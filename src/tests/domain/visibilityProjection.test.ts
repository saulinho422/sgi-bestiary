import { describe, expect, it } from "vitest";
import { projectTokenForPlayers } from "@/domain/rules/visibilityProjection";
import { createConditionFromCatalog } from "@/domain/rules/conditionsCatalog";
import type { TokenInstance } from "@/domain/entities/tokenInstance";
import { SEED_SHEETS } from "@/integrations/storage/seedData";

describe("Projeção de visibilidade e segurança Mestre vs Jogadores (Teste 8)", () => {
  it("nunca vaza notas do mestre, CA oculta ou PV exatos ocultos na projeção pública", () => {
    const goblin = SEED_SHEETS.find((s) => s.id === "seed-goblin-001")!;
    const instance: TokenInstance = {
      instanceId: "inst-1",
      boundItemId: "obr-item-1",
      sceneId: "scene-1",
      templateId: goblin.id,
      category: "monster",
      individualName: "Goblin Líder",
      currentHp: 3,
      maxHp: 7,
      tempHp: 4,
      armorClass: 15,
      conditions: [
        createConditionFromCatalog("poisoned", { visibleToPlayers: true }),
        createConditionFromCatalog("charmed", { visibleToPlayers: false }),
      ],
      consumedResources: {},
      deathSaves: { successes: 0, failures: 0 },
      visibility: {
        publicName: true,
        publicHealthBar: true,
        publicHealthPercent: false,
        publicExactHp: false,
        publicTempHp: false,
        publicArmorClass: false,
        publicConditions: true,
        publicSummarySheet: false,
        publicFullSheet: false,
        playerCanEdit: false,
      },
      gmNotes: "Segredo do mestre na instância",
      history: [],
      updatedAt: new Date().toISOString(),
    };

    const projection = projectTokenForPlayers(instance, goblin);
    const serialized = JSON.stringify(projection);

    expect(projection.publicName).toBe("Goblin Líder");
    expect(projection.hpRatio).toBeCloseTo(3 / 7, 3);
    expect(projection.currentHp).toBeUndefined();
    expect(projection.maxHp).toBeUndefined();
    expect(projection.tempHp).toBeUndefined();
    expect(projection.armorClass).toBeUndefined();
    expect(projection.conditions).toHaveLength(1);
    expect(projection.conditions[0].conditionId).toBe("poisoned");
    expect(serialized).not.toContain("Reforços chegam no turno 3");
    expect(serialized).not.toContain("Segredo do mestre");
  });

  it("remove notes.gm mesmo quando publicFullSheet está habilitado", () => {
    const goblin = SEED_SHEETS.find((s) => s.id === "seed-goblin-001")!;
    const instance: TokenInstance = {
      instanceId: "inst-2",
      boundItemId: "obr-item-2",
      sceneId: "scene-1",
      templateId: goblin.id,
      category: "character",
      currentHp: 7,
      maxHp: 7,
      tempHp: 0,
      armorClass: 15,
      conditions: [],
      consumedResources: {},
      deathSaves: { successes: 0, failures: 0 },
      visibility: {
        publicName: true,
        publicHealthBar: true,
        publicHealthPercent: true,
        publicExactHp: true,
        publicTempHp: true,
        publicArmorClass: true,
        publicConditions: true,
        publicSummarySheet: true,
        publicFullSheet: true,
        playerCanEdit: true,
      },
      history: [],
      updatedAt: new Date().toISOString(),
    };

    const projection = projectTokenForPlayers(instance, goblin);
    expect(projection.currentHp).toBe(7);
    expect(projection.armorClass).toBe(15);
    expect(projection.fullSheetSnapshot?.notes.gm).toBe("");
    expect(JSON.stringify(projection)).not.toContain("Reforços chegam no turno 3");
  });
});
