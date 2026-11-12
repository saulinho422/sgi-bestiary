import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Image, Item, Metadata } from "@owlbear-rodeo/sdk";
import { CurveBuilder } from "@owlbear-rodeo/sdk/lib/builders/CurveBuilder";
import { ImageBuilder } from "@owlbear-rodeo/sdk/lib/builders/ImageBuilder";
import { LabelBuilder } from "@owlbear-rodeo/sdk/lib/builders/LabelBuilder";
import { ShapeBuilder } from "@owlbear-rodeo/sdk/lib/builders/ShapeBuilder";
import { TextBuilder } from "@owlbear-rodeo/sdk/lib/builders/TextBuilder";
import type PlayerApi from "@owlbear-rodeo/sdk/lib/api/PlayerApi";

// Ambiente simulado controlado de Owlbear Rodeo para background/HUD
const obrSim = vi.hoisted(() => {
  type Listener<T> = (payload: T) => void;

  const state = {
    ready: true,
    sceneId: "scene-sim-1",
    role: "GM" as "GM" | "PLAYER",
    dpi: 150,
    sceneMetadata: {} as Metadata,
    roomMetadata: {} as Metadata,
    sceneItems: [] as Item[],
    localItems: [] as Item[],
    localAddCalls: 0,
    localDeleteCalls: 0,
    getItemsDelayMs: 0,
    getItemsHooks: [] as Array<() => Promise<void> | void>,
  };

  const readyListeners = new Set<Listener<boolean>>();
  const itemsListeners = new Set<Listener<Item[]>>();
  const gridListeners = new Set<Listener<{ dpi: number }>>();
  const playerListeners = new Set<
    Listener<{ role: "GM" | "PLAYER"; selection?: string[] }>
  >();
  const roomMetaListeners = new Set<Listener<Metadata>>();
  const sceneMetaListeners = new Set<Listener<Metadata>>();
  const themeListeners = new Set<Listener<{ mode: "DARK" | "LIGHT" }>>();

  function matchFilter(item: Item, filter?: ((it: Item) => boolean) | string[]): boolean {
    if (!filter) return true;
    if (typeof filter === "function") return filter(item);
    if (Array.isArray(filter)) return filter.includes(item.id);
    return true;
  }

  function reset() {
    state.ready = true;
    state.sceneId = "scene-sim-1";
    state.role = "GM";
    state.dpi = 150;
    state.sceneMetadata = {};
    state.roomMetadata = {};
    state.sceneItems = [];
    state.localItems = [];
    state.localAddCalls = 0;
    state.localDeleteCalls = 0;
    state.getItemsDelayMs = 0;
    state.getItemsHooks = [];
    readyListeners.clear();
    itemsListeners.clear();
    gridListeners.clear();
    playerListeners.clear();
    roomMetaListeners.clear();
    sceneMetaListeners.clear();
    themeListeners.clear();
  }

  return {
    state,
    readyListeners,
    itemsListeners,
    gridListeners,
    playerListeners,
    roomMetaListeners,
    sceneMetaListeners,
    themeListeners,
    matchFilter,
    reset,
    emitItemsChange() {
      const snapshot = structuredClone(state.sceneItems);
      itemsListeners.forEach((cb) => cb(snapshot));
    },
    emitSceneReady(nextReady: boolean) {
      state.ready = nextReady;
      readyListeners.forEach((cb) => cb(nextReady));
    },
    emitRoleChange(nextRole: "GM" | "PLAYER") {
      state.role = nextRole;
      playerListeners.forEach((cb) => cb({ role: nextRole, selection: [] }));
    },
    emitSceneMetadataChange() {
      const snapshot = structuredClone(state.sceneMetadata);
      sceneMetaListeners.forEach((cb) => cb(snapshot));
    },
  };
});

vi.mock("@owlbear-rodeo/sdk", async () => {
  const actual = await vi.importActual<typeof import("@owlbear-rodeo/sdk")>(
    "@owlbear-rodeo/sdk",
  );
  const stubPlayer = { id: "player-sim-1" } as unknown as PlayerApi;

  const mockOBR = {
    isAvailable: true,
    isReady: true,
    onReady(cb: () => void) {
      cb();
    },
    player: {
      id: "player-sim-1",
      getRole: vi.fn(async () => obrSim.state.role),
      getSelection: vi.fn(async () => []),
      select: vi.fn(async () => undefined),
      onChange: vi.fn((cb: (p: { role: "GM" | "PLAYER"; selection?: string[] }) => void) => {
        obrSim.playerListeners.add(cb);
        return () => {
          obrSim.playerListeners.delete(cb);
        };
      }),
    },
    room: {
      id: "room-sim-1",
      getMetadata: vi.fn(async () => structuredClone(obrSim.state.roomMetadata)),
      onMetadataChange: vi.fn((cb: (meta: Metadata) => void) => {
        obrSim.roomMetaListeners.add(cb);
        return () => {
          obrSim.roomMetaListeners.delete(cb);
        };
      }),
    },
    theme: {
      getTheme: vi.fn(async () => ({ mode: "DARK" as const })),
      onChange: vi.fn((cb: (t: { mode: "DARK" | "LIGHT" }) => void) => {
        obrSim.themeListeners.add(cb);
        return () => {
          obrSim.themeListeners.delete(cb);
        };
      }),
    },
    contextMenu: {
      create: vi.fn(async () => undefined),
    },
    broadcast: {
      onMessage: vi.fn(() => () => undefined),
      sendMessage: vi.fn(async () => undefined),
    },
    scene: {
      isReady: vi.fn(async () => obrSim.state.ready),
      onReadyChange: vi.fn((cb: (ready: boolean) => void) => {
        obrSim.readyListeners.add(cb);
        return () => {
          obrSim.readyListeners.delete(cb);
        };
      }),
      getMetadata: vi.fn(async () => structuredClone(obrSim.state.sceneMetadata)),
      setMetadata: vi.fn(async (patch: Metadata) => {
        obrSim.state.sceneMetadata = { ...obrSim.state.sceneMetadata, ...patch };
        obrSim.emitSceneMetadataChange();
      }),
      onMetadataChange: vi.fn((cb: (meta: Metadata) => void) => {
        obrSim.sceneMetaListeners.add(cb);
        return () => {
          obrSim.sceneMetaListeners.delete(cb);
        };
      }),
      grid: {
        getDpi: vi.fn(async () => obrSim.state.dpi),
        onChange: vi.fn((cb: (grid: { dpi: number }) => void) => {
          obrSim.gridListeners.add(cb);
          return () => {
            obrSim.gridListeners.delete(cb);
          };
        }),
      },
      items: {
        getItems: vi.fn(async (filter?: ((it: Item) => boolean) | string[]) => {
          const hook = obrSim.state.getItemsHooks.shift();
          if (hook) {
            await hook();
          }
          if (obrSim.state.getItemsDelayMs > 0) {
            await new Promise((r) => setTimeout(r, obrSim.state.getItemsDelayMs));
          }
          return structuredClone(
            obrSim.state.sceneItems.filter((it) => obrSim.matchFilter(it, filter)),
          );
        }),
        addItems: vi.fn(async (items: Item[]) => {
          obrSim.state.sceneItems.push(...structuredClone(items));
          obrSim.emitItemsChange();
        }),
        deleteItems: vi.fn(async (ids: string[]) => {
          const rm = new Set(ids);
          obrSim.state.sceneItems = obrSim.state.sceneItems.filter((it) => !rm.has(it.id));
          obrSim.emitItemsChange();
        }),
        updateItems: vi.fn(
          async (
            idsOrFilter: string[] | ((it: Item) => boolean),
            updater: (drafts: Item[]) => void,
          ) => {
            const matched = obrSim.state.sceneItems.filter((it) =>
              obrSim.matchFilter(it, idsOrFilter),
            );
            updater(matched);
            obrSim.emitItemsChange();
          },
        ),
        onChange: vi.fn((cb: (items: Item[]) => void) => {
          obrSim.itemsListeners.add(cb);
          return () => {
            obrSim.itemsListeners.delete(cb);
          };
        }),
      },
      local: {
        getItems: vi.fn(async (filter?: ((it: Item) => boolean) | string[]) => {
          return structuredClone(
            obrSim.state.localItems.filter((it) => obrSim.matchFilter(it, filter)),
          );
        }),
        addItems: vi.fn(async (items: Item[]) => {
          obrSim.state.localAddCalls += 1;
          const byId = new Map(obrSim.state.localItems.map((it) => [it.id, it]));
          for (const it of items) {
            byId.set(it.id, structuredClone(it));
          }
          obrSim.state.localItems = Array.from(byId.values());
        }),
        deleteItems: vi.fn(async (ids: string[]) => {
          obrSim.state.localDeleteCalls += 1;
          const rm = new Set(ids);
          obrSim.state.localItems = obrSim.state.localItems.filter((it) => !rm.has(it.id));
        }),
      },
    },
  };

  return {
    ...actual,
    default: mockOBR,
    buildCurve: () => new CurveBuilder(stubPlayer),
    buildLabel: () => new LabelBuilder(stubPlayer),
    buildShape: () => new ShapeBuilder(stubPlayer),
    buildText: () => new TextBuilder(stubPlayer),
    buildImage: (
      img: ConstructorParameters<typeof ImageBuilder>[1],
      grid: ConstructorParameters<typeof ImageBuilder>[2],
    ) => new ImageBuilder(stubPlayer, img, grid),
  };
});

import { DEFAULT_HUD_SETTINGS } from "@/domain/entities/settings";
import { SgiBackgroundDaemon } from "@/background/backgroundService";
import {
  buildHudViewForViewer,
  isSgiHudLocalItemId,
  TacticalHudRenderer,
} from "@/features/token-hud/hudRenderer";
import { projectTokenForPlayers } from "@/domain/rules/visibilityProjection";
import {
  notifyDbSync,
  storageProvider,
} from "@/integrations/storage/dexieRepository";
import { SEED_SHEETS } from "@/integrations/storage/seedData";
import { addParticipantsToEncounter, createCombatEncounter } from "@/services/combatService";
import { createTokenInstanceFromSheet } from "@/services/instanceService";
import { METADATA_KEYS } from "@/utils/pluginId";

function makeMapToken(id: string, name: string, visible = true): Image {
  return {
    id,
    type: "IMAGE",
    name,
    layer: "CHARACTER",
    position: { x: 150, y: 150 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    visible,
    locked: false,
    zIndex: 1,
    createdUserId: "user-1",
    lastModified: new Date().toISOString(),
    metadata: {},
    image: {
      url: "https://example.com/goblin.png",
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
        fillColor: "#fff",
        fillOpacity: 1,
        strokeColor: "#000",
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

describe("Ciclo de vida do HUD no mapa — eliminação de órfãos e piscamento (Testes A–H)", () => {
  const goblin = SEED_SHEETS.find((s) => s.id === "seed-goblin-001")!;
  const hero = SEED_SHEETS.find((s) => s.kind === "character") ?? SEED_SHEETS[0];
  let daemon: SgiBackgroundDaemon | null = null;

  beforeEach(async () => {
    obrSim.reset();
    obrSim.state.sceneMetadata = {
      [METADATA_KEYS.SCENE_SETTINGS]: { sceneId: "scene-sim-1" },
    };
    await storageProvider.library.saveSheet(goblin);
    await storageProvider.library.saveSheet(hero);
    await storageProvider.instances.deleteInstancesByScene("scene-sim-1");
    await storageProvider.instances.deleteInstancesByScene("scene-sim-2");
    for (const s of ["scene-sim-1", "scene-sim-2"]) {
      const encs = await storageProvider.encounters.listEncountersByScene(s);
      for (const e of encs) {
        await storageProvider.encounters.deleteEncounter(e.id);
      }
    }
  });

  afterEach(() => {
    daemon?.stop();
    daemon = null;
  });

  async function seedBoundTokenOnMap(params: {
    id: string;
    name: string;
    sheet?: typeof goblin;
    sceneId?: string;
    visible?: boolean;
  }) {
    const sheet = params.sheet ?? goblin;
    const sceneId = params.sceneId ?? obrSim.state.sceneId;
    const inst = createTokenInstanceFromSheet({
      sheet,
      boundItemId: params.id,
      sceneId,
      individualName: params.name,
    });
    const proj = projectTokenForPlayers(inst, sheet);
    const tok = makeMapToken(params.id, params.name, params.visible ?? true);
    tok.metadata[METADATA_KEYS.TOKEN] = proj;
    await storageProvider.instances.saveInstance(inst);
    obrSim.state.sceneItems.push(tok);
    return { inst, tok };
  }

  it("Teste A: exclusão simples de token remove todos os indicadores locais e preserva ficha na Biblioteca", async () => {
    const { inst } = await seedBoundTokenOnMap({
      id: "tok-a1",
      name: "Goblin Solitário",
    });

    const enc = addParticipantsToEncounter(
      createCombatEncounter({ sceneId: "scene-sim-1" }),
      ["tok-a1"],
      new Map([[inst.boundItemId, inst]]),
      new Map([[goblin.id, goblin]]),
    ).encounter;
    await storageProvider.encounters.saveEncounter(enc);
    await storageProvider.encounters.setActiveEncounterId("scene-sim-1", enc.id);

    daemon = new SgiBackgroundDaemon();
    await daemon.start();
    await daemon.flushQueue();

    // Confirma que HUD completo foi desenhado no mapa (barra HP, CA, nome)
    expect(
      obrSim.state.localItems.some((it) => it.id.startsWith("com.sgi.bestiary.hud.tok-a1.")),
    ).toBe(true);

    // Exclui o token diretamente no mapa do OBR
    obrSim.state.sceneItems = [];
    obrSim.emitItemsChange();
    await daemon.flushQueue();

    // 0 restos locais do SGI
    expect(
      obrSim.state.localItems.filter((it) => isSgiHudLocalItemId(it.id)),
    ).toHaveLength(0);
    // Instância e combate limpos, mas ficha preservada na Biblioteca
    expect(await storageProvider.instances.listInstancesByScene("scene-sim-1")).toHaveLength(0);
    const encsAfter = await storageProvider.encounters.listEncountersByScene("scene-sim-1");
    expect(encsAfter[0].participants).toHaveLength(0);
    expect(await storageProvider.library.getSheet(goblin.id)).toBeDefined();
  });

  it("Teste B: exclusões repetidas em sequência (5 monstros) não deixam órfãos e não refazem tokens sobreviventes", async () => {
    const ids = ["m-1", "m-2", "m-3", "m-4", "m-5"];
    for (const id of ids) {
      await seedBoundTokenOnMap({ id, name: `Goblin ${id}` });
    }

    daemon = new SgiBackgroundDaemon();
    await daemon.start();
    await daemon.flushQueue();

    for (let idx = 0; idx < ids.length; idx++) {
      const removedId = ids[idx];
      const survivingIds = new Set(ids.slice(idx + 1));

      obrSim.state.sceneItems = obrSim.state.sceneItems.filter((it) => it.id !== removedId);
      const addCallsBefore = obrSim.state.localAddCalls;
      obrSim.emitItemsChange();
      await daemon.flushQueue();

      // Nenhum indicador do token recém-excluído (nem de anteriores)
      const leftRemoved = obrSim.state.localItems.filter((it) =>
        it.id.includes(`.${removedId}.`),
      );
      expect(leftRemoved).toHaveLength(0);

      // Tokens sobreviventes NÃO sofrem addItems desnecessário (zero flicker)
      expect(obrSim.state.localAddCalls).toBe(addCallsBefore);

      const activeHudTokens = new Set(
        obrSim.state.localItems
          .filter((it) => isSgiHudLocalItemId(it.id))
          .map((it) => it.attachedTo),
      );
      expect(activeHudTokens).toEqual(survivingIds);
    }

    expect(obrSim.state.localItems.filter((it) => isSgiHudLocalItemId(it.id))).toHaveLength(0);
  });

  it("Teste C: exclusão em lote remove apenas os HUDs excluídos e preserva sobreviventes e itens de terceiros", async () => {
    await seedBoundTokenOnMap({ id: "batch-1", name: "Goblin 1" });
    await seedBoundTokenOnMap({ id: "batch-2", name: "Goblin 2" });
    await seedBoundTokenOnMap({ id: "batch-3", name: "Goblin 3" });
    await seedBoundTokenOnMap({ id: "hero-keep", name: "Valeros", sheet: hero });

    // Item gráfico de outra extensão que NUNCA deve ser tocado
    obrSim.state.localItems.push({
      id: "third.party.aura.hero-keep",
      attachedTo: "hero-keep",
    } as unknown as Item);

    daemon = new SgiBackgroundDaemon();
    await daemon.start();
    await daemon.flushQueue();

    // Exclui os 3 goblins de uma vez
    obrSim.state.sceneItems = obrSim.state.sceneItems.filter((it) => it.id === "hero-keep");
    obrSim.emitItemsChange();
    await daemon.flushQueue();

    const sgiLocals = obrSim.state.localItems.filter((it) => isSgiHudLocalItemId(it.id));
    expect(sgiLocals.length).toBeGreaterThan(0);
    expect(sgiLocals.every((it) => it.attachedTo === "hero-keep")).toBe(true);
    expect(
      obrSim.state.localItems.some((it) => it.id === "third.party.aura.hero-keep"),
    ).toBe(true);
  });

  it("Teste D: limpeza independente de cache remove órfãos sem cache e até sem attachedTo", async () => {
    const imgAlive = makeMapToken("alive-1", "Sobrevivente");
    const instAlive = createTokenInstanceFromSheet({
      sheet: hero,
      boundItemId: imgAlive.id,
      sceneId: "scene-sim-1",
    });

    // Órfãos preexistentes no local storage do OBR (um com attachedTo, outro sem attachedTo!)
    obrSim.state.sceneItems = [imgAlive];
    obrSim.state.localItems = [
      { id: "com.sgi.bestiary.hud.ghost-1.name", attachedTo: "ghost-1" } as unknown as Item,
      { id: "com.sgi.bestiary.hud.ghost-2.hp-bg" } as unknown as Item,
      { id: "other.ext.ring.1", attachedTo: "ghost-1" } as unknown as Item,
    ];

    const renderer = new TacticalHudRenderer();
    renderer.resetCache(); // Garante cache totalmente vazio

    const viewAlive = buildHudViewForViewer({
      item: imgAlive,
      role: "GM",
      settings: DEFAULT_HUD_SETTINGS,
      gmInstance: instAlive,
      gmTemplateName: hero.name,
    })!;

    await renderer.reconcile({
      views: [viewAlive],
      sceneDpi: 150,
      settings: DEFAULT_HUD_SETTINGS,
      forceFullCleanup: false,
    });

    // Órfãos removidos, sobrevivente desenhado, item de terceira extensão preservado
    expect(obrSim.state.localItems.some((it) => it.id.includes("ghost-1"))).toBe(false);
    expect(obrSim.state.localItems.some((it) => it.id.includes("ghost-2"))).toBe(false);
    expect(obrSim.state.localItems.some((it) => it.id === "other.ext.ring.1")).toBe(true);
    expect(
      obrSim.state.localItems.some((it) => it.id === "com.sgi.bestiary.hud.alive-1.name"),
    ).toBe(true);

    // cleanupOrphanedLocalItems direto também funciona com cache resetado
    renderer.resetCache();
    obrSim.state.localItems.push({
      id: "com.sgi.bestiary.hud.ghost-3.ac-bg",
    } as unknown as Item);
    const cleaned = await renderer.cleanupOrphanedLocalItems(new Set(["alive-1"]));
    expect(cleaned).toBe(1);
    expect(obrSim.state.localItems.some((it) => it.id.includes("ghost-3"))).toBe(false);
  });

  it("Teste E: atualização assíncrona lenta/concorrente antes da exclusão não recria HUD após exclusão", async () => {
    await seedBoundTokenOnMap({ id: "race-1", name: "Goblin Veloz" });
    await seedBoundTokenOnMap({ id: "race-keep", name: "Guerreiro" , sheet: hero });

    daemon = new SgiBackgroundDaemon();
    await daemon.start();
    await daemon.flushQueue();

    // Prepara atraso na leitura de `items.getItems` disparada por evento concorrente (metadata/DB sync)
    // enquanto a exclusão acontece logo depois durante o processamento assíncrono!
    let resolveHook!: () => void;
    const hookEntered = new Promise<void>((res) => {
      resolveHook = res;
    });
    let releaseSlowGetItems!: () => void;
    const gate = new Promise<void>((res) => {
      releaseSlowGetItems = res;
    });

    obrSim.state.getItemsHooks.push(async () => {
      resolveHook();
      await gate;
    });

    // Dispara reconcile concorrente (ex.: mudança de metadados da cena ou BroadcastChannel DB sync)
    obrSim.emitSceneMetadataChange();
    notifyDbSync("instances");
    await hookEntered;

    // Durante o processamento atrasado, o usuário exclui "race-1" diretamente do mapa!
    obrSim.state.sceneItems = obrSim.state.sceneItems.filter((it) => it.id !== "race-1");
    obrSim.emitItemsChange();

    // Libera a chamada antiga agora que o token já foi excluído
    releaseSlowGetItems();
    await daemon.flushQueue();

    // Garante que "race-1" NÃO tem nenhum indicador nem reapareceu, e "race-keep" permanece íntegro
    expect(obrSim.state.localItems.some((it) => it.id.includes("race-1"))).toBe(false);
    expect(
      obrSim.state.localItems.some((it) => it.id === "com.sgi.bestiary.hud.race-keep.name"),
    ).toBe(true);

    // Verifica que também não recria em reconciliação direta atrasada do TacticalHudRenderer
    const renderer = daemon.getRenderer();
    const traceEvents = renderer.getDebugHistory().map((e) => e.event);
    expect(traceEvents.length).toBeGreaterThan(0);

    const raceView = buildHudViewForViewer({
      item: makeMapToken("race-ghost-midflight", "Fantasma"),
      role: "GM",
      settings: DEFAULT_HUD_SETTINGS,
      gmInstance: createTokenInstanceFromSheet({
        sheet: goblin,
        boundItemId: "race-ghost-midflight",
        sceneId: "scene-sim-1",
      }),
    })!;

    await renderer.reconcile({
      views: [raceView],
      sceneDpi: 150,
      settings: DEFAULT_HUD_SETTINGS,
      verifyActiveTokenIds: async () => new Set(["race-keep"]), // token não existe mais na cena!
    });

    expect(
      obrSim.state.localItems.some((it) => it.id.includes("race-ghost-midflight")),
    ).toBe(false);
    expect(
      renderer.getDebugHistory().some((e) => e.event === "discard-stale-add"),
    ).toBe(true);
  });

  it("Teste F: troca rápida de cena invalida tarefas antigas e impede vazamento de HUDs da cena anterior", async () => {
    await seedBoundTokenOnMap({ id: "scene1-goblin", name: "Goblin Cena 1", sceneId: "scene-sim-1" });

    daemon = new SgiBackgroundDaemon();
    await daemon.start();
    await daemon.flushQueue();

    expect(
      obrSim.state.localItems.some((it) => it.id.includes("scene1-goblin")),
    ).toBe(true);

    // Troca rápida: desliga Cena 1 -> muda para Cena 2 -> liga Cena 2
    obrSim.emitSceneReady(false);
    obrSim.state.sceneMetadata = {
      [METADATA_KEYS.SCENE_SETTINGS]: { sceneId: "scene-sim-2" },
    };
    obrSim.state.sceneItems = [];
    // Mesmo que houvesse resíduo local na cena nova ao abrir, attachScene faz cleanup completo
    obrSim.state.localItems = [
      { id: "com.sgi.bestiary.hud.scene1-goblin.name", attachedTo: "scene1-goblin" } as unknown as Item,
    ];
    await seedBoundTokenOnMap({
      id: "scene2-hero",
      name: "Herói Cena 2",
      sheet: hero,
      sceneId: "scene-sim-2",
    });
    obrSim.emitSceneReady(true);
    await daemon.flushQueue();

    expect(
      obrSim.state.localItems.some((it) => it.id.includes("scene1-goblin")),
    ).toBe(false);
    expect(
      obrSim.state.localItems.some((it) => it.id === "com.sgi.bestiary.hud.scene2-hero.name"),
    ).toBe(true);
  });

  it("Teste G: após exclusão com painel fechado e reinicialização do daemon, indicadores não retornam", async () => {
    await seedBoundTokenOnMap({ id: "persist-del", name: "Goblin Excluído" });
    await seedBoundTokenOnMap({ id: "persist-keep", name: "Clérigo", sheet: hero });

    daemon = new SgiBackgroundDaemon();
    await daemon.start();
    await daemon.flushQueue();

    // Exclui do mapa com o painel fechado
    obrSim.state.sceneItems = obrSim.state.sceneItems.filter(
      (it) => it.id !== "persist-del",
    );
    obrSim.emitItemsChange();
    await daemon.flushQueue();

    expect(obrSim.state.localItems.some((it) => it.id.includes("persist-del"))).toBe(false);

    // Simula reload da aba/sessão
    daemon.stop();
    const daemonReloaded = new SgiBackgroundDaemon();
    daemon = daemonReloaded;
    await daemonReloaded.start();
    await daemonReloaded.flushQueue();

    expect(obrSim.state.localItems.some((it) => it.id.includes("persist-del"))).toBe(false);
    expect(
      obrSim.state.localItems.some((it) => it.id === "com.sgi.bestiary.hud.persist-keep.name"),
    ).toBe(true);
  });

  it("Teste H: visão PLAYER remove imediatamente HUD quando token é excluído ou ocultado do mapa", async () => {
    obrSim.state.role = "PLAYER";

    const tokVisible = makeMapToken("player-tok-1", "Orc Inimigo", true);
    const instOrc = createTokenInstanceFromSheet({
      sheet: goblin,
      boundItemId: tokVisible.id,
      sceneId: "scene-sim-1",
      individualName: "Orc Inimigo",
    });
    tokVisible.metadata[METADATA_KEYS.TOKEN] = projectTokenForPlayers(instOrc, goblin);

    const tokSurvivor = makeMapToken("player-tok-hero", "Elfo", true);
    const instElfo = createTokenInstanceFromSheet({
      sheet: hero,
      boundItemId: tokSurvivor.id,
      sceneId: "scene-sim-1",
      individualName: "Elfo",
    });
    tokSurvivor.metadata[METADATA_KEYS.TOKEN] = projectTokenForPlayers(instElfo, hero);

    obrSim.state.sceneItems = [tokVisible, tokSurvivor];

    daemon = new SgiBackgroundDaemon();
    await daemon.start();
    await daemon.flushQueue();

    expect(
      obrSim.state.localItems.some((it) => it.id.includes("player-tok-1")),
    ).toBe(true);
    expect(
      obrSim.state.localItems.some((it) => it.id.includes("player-tok-hero")),
    ).toBe(true);

    // 1. Mestre oculta player-tok-hero para jogadores -> HUD deve sumir para PLAYER
    tokSurvivor.visible = false;
    obrSim.emitItemsChange();
    await daemon.flushQueue();
    expect(
      obrSim.state.localItems.some((it) => it.id.includes("player-tok-hero")),
    ).toBe(false);
    expect(
      obrSim.state.localItems.some((it) => it.id.includes("player-tok-1")),
    ).toBe(true);

    // 2. Token player-tok-1 é excluído do mapa -> HUD desaparece imediatamente na visão do jogador
    obrSim.state.sceneItems = [tokSurvivor];
    obrSim.emitItemsChange();
    await daemon.flushQueue();
    expect(obrSim.state.localItems.filter((it) => isSgiHudLocalItemId(it.id))).toHaveLength(0);
  });
});
