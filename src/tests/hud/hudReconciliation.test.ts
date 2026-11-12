import { describe, expect, it } from "vitest";
import type { Image } from "@owlbear-rodeo/sdk";
import { DEFAULT_HUD_SETTINGS, type HudSettings } from "@/domain/entities/settings";
import { createConditionFromCatalog } from "@/domain/rules/conditionsCatalog";
import { projectTokenForPlayers } from "@/domain/rules/visibilityProjection";
import { computeHudLayoutGeometry, getHealthBarColor } from "@/features/token-hud/hudMath";
import {
  buildHudItemsForToken,
  buildHudViewForViewer,
  isSgiHudLocalItemId,
  planHudReconciliation,
  type HudRenderableView,
} from "@/features/token-hud/hudRenderer";
import { createTokenInstanceFromSheet, mutateInstanceStats } from "@/services/instanceService";
import { SEED_SHEETS } from "@/integrations/storage/seedData";

function makeMockObrImage(id: string, name = "Token", x = 150, y = 150): Image {
  return {
    id,
    type: "IMAGE",
    name,
    layer: "CHARACTER",
    position: { x, y },
    scale: { x: 1, y: 1 },
    rotation: 0,
    visible: true,
    locked: false,
    zIndex: 0,
    createdUserId: "user-1",
    lastModified: new Date().toISOString(),
    metadata: {},
    image: {
      url: "https://example.com/token.png",
      width: 150,
      height: 150,
      mime: "image/png",
    },
    grid: {
      dpi: 150,
      offset: { x: 75, y: 75 },
    },
    text: {
      plainText: "",
      richText: [],
      type: "PLAIN",
      style: {
        fillColor: "#ffffff",
        fillOpacity: 1,
        strokeColor: "#000000",
        strokeOpacity: 0,
        strokeWidth: 0,
        textAlign: "CENTER",
        textAlignVertical: "MIDDLE",
        fontFamily: "Roboto",
        fontSize: 16,
        fontWeight: 400,
        lineHeight: 1.2,
        padding: 0,
      },
      width: 0,
      height: 0,
    },
    textItemType: "LABEL",
    disableHit: false,
    disableAutoZIndex: false,
  } as unknown as Image;
}

describe("Motor de HUD Tático no mapa e escalabilidade (Testes 4, 8, 9, 11, 12)", () => {
  const goblinSheet = SEED_SHEETS.find((s) => s.id === "seed-goblin-001")!;

  it("Teste 8 (Visão HUD GM vs Jogador): oculta PV exatos e CA dos jogadores enquanto Mestre visualiza tudo", () => {
    const img = makeMockObrImage("tok-goblin-1", "Goblin Líder");
    let inst = createTokenInstanceFromSheet({
      sheet: goblinSheet,
      boundItemId: img.id,
      sceneId: "scene-1",
      individualName: "Goblin Líder",
    });
    inst = mutateInstanceStats(inst, { type: "temp-hp", amount: 5 }, goblinSheet);
    inst = mutateInstanceStats(inst, { type: "damage", amount: 2 }, goblinSheet);
    // Absorve 2 dos 5 temp -> currentHp=7, tempHp=3

    const projection = projectTokenForPlayers(inst, goblinSheet);

    const gmView = buildHudViewForViewer({
      item: img,
      role: "GM",
      settings: DEFAULT_HUD_SETTINGS,
      gmInstance: inst,
      gmTemplateName: goblinSheet.name,
    });
    const playerView = buildHudViewForViewer({
      item: img,
      role: "PLAYER",
      settings: DEFAULT_HUD_SETTINGS,
      publicProjection: projection,
    });

    expect(gmView?.showExactHp).toBe(true);
    expect(gmView?.currentHp).toBe(7);
    expect(gmView?.armorClass).toBe(15);
    expect(gmView?.showTempHp).toBe(true);

    // Jogador NÃO vê PV exatos, NÃO vê CA, NÃO vê PV Temp (visibilidade padrão de monstro)
    expect(playerView?.showBar).toBe(true);
    expect(playerView?.showExactHp).toBe(false);
    expect(playerView?.currentHp).toBeUndefined();
    expect(playerView?.armorClass).toBeUndefined();
    expect(playerView?.showTempHp).toBe(false);

    const playerHudItems = buildHudItemsForToken(
      playerView!,
      150,
      DEFAULT_HUD_SETTINGS,
    );
    const serialized = JSON.stringify(playerHudItems);
    expect(serialized).not.toContain("7/7");
    expect(serialized).not.toContain('"plainText":"15"');
  });

  it("Teste 9: alterações de posição (top, bottom, left, right) e cores refletem corretamente na geometria e saída", () => {
    const img = makeMockObrImage("tok-pos", "Sentinel", 300, 300);

    const bottomGeo = computeHudLayoutGeometry(img, 150, {
      ...DEFAULT_HUD_SETTINGS,
      position: "bottom",
    });
    const topGeo = computeHudLayoutGeometry(img, 150, {
      ...DEFAULT_HUD_SETTINGS,
      position: "top",
    });
    const leftGeo = computeHudLayoutGeometry(img, 150, {
      ...DEFAULT_HUD_SETTINGS,
      position: "left",
    });
    const rightGeo = computeHudLayoutGeometry(img, 150, {
      ...DEFAULT_HUD_SETTINGS,
      position: "right",
    });

    expect(bottomGeo.barTopLeft.y).toBeGreaterThan(300);
    expect(topGeo.barTopLeft.y).toBeLessThan(300);
    expect(leftGeo.barTopLeft.x).toBeLessThan(300 - 75);
    expect(rightGeo.barTopLeft.x).toBeGreaterThan(300 + 75);

    const customSettings: HudSettings = {
      ...DEFAULT_HUD_SETTINGS,
      colorThresholds: {
        ...DEFAULT_HUD_SETTINGS.colorThresholds,
        highColor: "#10b981",
        mediumColor: "#f59e0b",
        lowColor: "#b91c1c",
      },
    };
    expect(getHealthBarColor(0.8, customSettings)).toBe("#10b981");
    expect(getHealthBarColor(0.4, customSettings)).toBe("#f59e0b");
    expect(getHealthBarColor(0.1, customSettings)).toBe("#b91c1c");
  });

  it("Teste 4 & 11: gera faixas de PV Temp + condições legíveis, respeita prefixo SGI e remove órfãos sem afetar terceiros", () => {
    const img = makeMockObrImage("tok-hud", "Aria");
    const inst = createTokenInstanceFromSheet({
      sheet: goblinSheet,
      boundItemId: img.id,
      sceneId: "scene-1",
    });
    inst.tempHp = 6;
    inst.conditions = [createConditionFromCatalog("poisoned")];
    inst.concentratingOn = "Escudo da Fé";

    const view = buildHudViewForViewer({
      item: img,
      role: "GM",
      settings: DEFAULT_HUD_SETTINGS,
      gmInstance: inst,
    })!;

    const built = buildHudItemsForToken(view, 150, DEFAULT_HUD_SETTINGS);
    expect(built.length).toBeGreaterThan(5);
    expect(built.every((it) => isSgiHudLocalItemId(it.id))).toBe(true);
    expect(isSgiHudLocalItemId("third-party-plugin.ring.1")).toBe(false);
    expect(built.some((it) => it.id.endsWith(".thp-strip"))).toBe(true);
    expect(built.some((it) => it.id.endsWith(".thp-bg"))).toBe(true);
    expect(built.some((it) => it.id.endsWith(".ac-bg"))).toBe(true);
    expect(built.some((it) => it.id.endsWith(".cond-bg-0"))).toBe(true);
  });

  it("Teste 12: reconciliação incremental com 100 tokens reconstrói APENAS o token alterado em poucos ms", () => {
    const views: HudRenderableView[] = [];
    for (let i = 0; i < 100; i++) {
      const img = makeMockObrImage(`tok-${i}`, `Goblin ${i}`, i * 100, 0);
      const inst = createTokenInstanceFromSheet({
        sheet: goblinSheet,
        boundItemId: img.id,
        sceneId: "scene-scale",
        individualName: `Goblin ${i}`,
      });
      views.push(
        buildHudViewForViewer({
          item: img,
          role: "GM",
          settings: DEFAULT_HUD_SETTINGS,
          gmInstance: inst,
        })!,
      );
    }

    const initialPlan = planHudReconciliation({
      views,
      previousCache: new Map(),
      sceneDpi: 150,
      settings: DEFAULT_HUD_SETTINGS,
    });
    expect(initialPlan.changedTokenCount).toBe(100);
    expect(initialPlan.deleteIds).toHaveLength(0);

    // Muta APENAS o token #42
    views[42] = {
      ...views[42],
      currentHp: 2,
      hpRatio: 2 / 7,
    };

    const t0 = performance.now();
    const diffPlan = planHudReconciliation({
      views,
      previousCache: initialPlan.nextCache,
      sceneDpi: 150,
      settings: DEFAULT_HUD_SETTINGS,
    });
    const elapsedMs = performance.now() - t0;

    expect(diffPlan.changedTokenCount).toBe(1);
    expect(diffPlan.removedTokenCount).toBe(0);
    expect(diffPlan.deleteIds.every((id) => id.includes("tok-42."))).toBe(true);
    expect(diffPlan.addItems.every((it) => it.attachedTo === "tok-42")).toBe(true);
    expect(elapsedMs).toBeLessThan(150);
  });
});
