import { beforeEach, describe, expect, it } from "vitest";
import type { CreatureSheet } from "@/domain/entities/sheet";
import { createConditionFromCatalog } from "@/domain/rules/conditionsCatalog";
import { createEmptySheet } from "@/domain/schemas/sheetSchema";
import { SEED_SHEETS } from "@/integrations/storage/seedData";
import { storageProvider } from "@/integrations/storage/dexieRepository";
import {
  addParticipantsToEncounter,
  adjustParticipantTieOrder,
  advanceEncounterTurn,
  createCombatEncounter,
  removeParticipantsFromEncounter,
  rollEncounterInitiatives,
  setParticipantInitiative,
  sortEncounterParticipants,
  startEncounterCombat,
} from "@/services/combatService";
import {
  addConditionToInstance,
  createTokenInstanceFromSheet,
} from "@/services/instanceService";

describe("Gerenciamento de combate, iniciativa e turnos (Testes 1–4, 13–14)", () => {
  const goblin = SEED_SHEETS.find((s) => s.id === "seed-goblin-001")!;
  const npc = SEED_SHEETS.find((s) => s.kind === "npc")!;

  const heroSheet: CreatureSheet = {
    ...createEmptySheet("character", "dnd5e-2014"),
    id: "hero-fighter-1",
    name: "Thorin Escudo-de-Ferro",
    abilities: { str: 18, dex: 12, con: 16, int: 10, wis: 12, cha: 11 },
    hitPoints: { maximum: 38, current: 38, temporary: 0, formula: "4d10+12" },
    armorClass: { value: 18, description: "Cota de malha e escudo" },
  };

  const sheetsById = new Map<string, CreatureSheet>([
    [goblin.id, goblin],
    [npc.id, npc],
    [heroSheet.id, heroSheet],
  ]);

  beforeEach(async () => {
    await storageProvider.instances.deleteInstancesByScene("scene-multi");
    const encs = await storageProvider.encounters.listEncountersByScene("scene-multi");
    for (const enc of encs) {
      await storageProvider.encounters.deleteEncounter(enc.id);
    }
  });

  it("Teste 1: separa explicitamente participantes do combate dos demais tokens da cena", () => {
    const allTen = [
      ...Array.from({ length: 8 }, (_, i) =>
        createTokenInstanceFromSheet({
          sheet: goblin,
          boundItemId: `gob-${i + 1}`,
          sceneId: "scene-multi",
          individualName: `Goblin ${i + 1}`,
        }),
      ),
      createTokenInstanceFromSheet({
        sheet: npc,
        boundItemId: "npc-1",
        sceneId: "scene-multi",
        individualName: "Sentinela",
      }),
      createTokenInstanceFromSheet({
        sheet: heroSheet,
        boundItemId: "pj-1",
        sceneId: "scene-multi",
      }),
    ];
    const instancesMap = new Map(allTen.map((i) => [i.boundItemId, i]));

    const enc = createCombatEncounter({
      sceneId: "scene-multi",
      name: "Mapa A",
    });
    const { encounter: withThree, addedCount } = addParticipantsToEncounter(
      enc,
      ["gob-1", "gob-2", "pj-1"],
      instancesMap,
      sheetsById,
    );

    expect(addedCount).toBe(3);
    expect(withThree.participants.map((p) => p.itemId)).toEqual([
      "gob-1",
      "gob-2",
      "pj-1",
    ]);
    expect(withThree.participants.every((p) => p.initiative === null)).toBe(true);
  });

  it("Teste 2: Rolar iniciativa sorteia automaticamente Monstros e NPCs, mas NUNCA PJs, e preserva iniciativas já definidas", () => {
    const instGoblin = createTokenInstanceFromSheet({
      sheet: goblin,
      boundItemId: "gob-1",
      sceneId: "scene-multi",
      individualName: "Goblin 1",
    });
    const instNpc = createTokenInstanceFromSheet({
      sheet: npc,
      boundItemId: "npc-1",
      sceneId: "scene-multi",
      individualName: "Sentinela",
    });
    const instHero = createTokenInstanceFromSheet({
      sheet: heroSheet,
      boundItemId: "pj-1",
      sceneId: "scene-multi",
    });
    const instancesMap = new Map([
      [instGoblin.boundItemId, instGoblin],
      [instNpc.boundItemId, instNpc],
      [instHero.boundItemId, instHero],
    ]);

    let enc = createCombatEncounter({ sceneId: "scene-multi" });
    enc = addParticipantsToEncounter(
      enc,
      ["gob-1", "npc-1", "pj-1"],
      instancesMap,
      sheetsById,
    ).encounter;

    const roll1 = rollEncounterInitiatives(enc, instancesMap, sheetsById, {
      d20Fn: () => 12,
    });
    expect(roll1.rolledItemIds).toEqual(["gob-1", "npc-1"]);
    expect(roll1.skippedCharacterIds).toEqual(["pj-1"]);

    const pGob = roll1.encounter.participants.find((p) => p.itemId === "gob-1")!;
    const pNpc = roll1.encounter.participants.find((p) => p.itemId === "npc-1")!;
    const pHero = roll1.encounter.participants.find((p) => p.itemId === "pj-1")!;
    expect(pGob.initiative).toBe(12 + Math.floor((goblin.abilities.dex - 10) / 2) + (goblin.initiativeBonus ?? 0));
    expect(pNpc.initiative).toBe(12 + Math.floor((npc.abilities.dex - 10) / 2) + (npc.initiativeBonus ?? 0));
    expect(pHero.initiative).toBeNull();

    // Segunda chamada sem rerollExisting preserva valores já rolados
    const roll2 = rollEncounterInitiatives(
      roll1.encounter,
      instancesMap,
      sheetsById,
      { d20Fn: () => 19 },
    );
    expect(roll2.rolledItemIds).toHaveLength(0);

    // Rerolar com rerollExisting sobrescreve monstros/NPCs, mas ainda mantém PJ manual
    const roll3 = rollEncounterInitiatives(
      roll1.encounter,
      instancesMap,
      sheetsById,
      { rerollExisting: true, d20Fn: () => 19 },
    );
    expect(roll3.rolledItemIds).toEqual(["gob-1", "npc-1"]);
    expect(
      roll3.encounter.participants.find((p) => p.itemId === "pj-1")?.initiative,
    ).toBeNull();
  });

  it("Teste 3 & 4: ordenação decrescente, iniciativa negativa em PJ, pendente no fim, desempate e avanço seguro após remoção", () => {
    const instGob1 = createTokenInstanceFromSheet({
      sheet: goblin,
      boundItemId: "gob-1",
      sceneId: "scene-multi",
      individualName: "Goblin A",
    });
    const instGob2 = createTokenInstanceFromSheet({
      sheet: goblin,
      boundItemId: "gob-2",
      sceneId: "scene-multi",
      individualName: "Goblin B",
    });
    const instHero = createTokenInstanceFromSheet({
      sheet: heroSheet,
      boundItemId: "pj-1",
      sceneId: "scene-multi",
    });
    const instNpc = createTokenInstanceFromSheet({
      sheet: npc,
      boundItemId: "npc-1",
      sceneId: "scene-multi",
      individualName: "Sentinela",
    });
    const instances = [instGob1, instGob2, instHero, instNpc];
    const instancesMap = new Map(instances.map((i) => [i.boundItemId, i]));

    let enc = createCombatEncounter({ sceneId: "scene-multi" });
    enc = addParticipantsToEncounter(
      enc,
      ["gob-1", "gob-2", "pj-1", "npc-1"],
      instancesMap,
      sheetsById,
    ).encounter;

    // Define empate em 14 para gob-1 e gob-2, -2 para pj-1 e null (pendente) para npc-1
    enc = setParticipantInitiative(enc, "gob-1", 14);
    enc = setParticipantInitiative(enc, "gob-2", 14);
    enc = setParticipantInitiative(enc, "pj-1", -2);

    let ordered = sortEncounterParticipants(enc.participants, instancesMap, sheetsById);
    expect(ordered.map((p) => p.itemId)).toEqual(["gob-1", "gob-2", "pj-1", "npc-1"]);

    // Ajuste manual de empate sobe Goblin B acima de Goblin A
    enc = adjustParticipantTieOrder(enc, "gob-2", "up", instancesMap, sheetsById);
    ordered = sortEncounterParticipants(enc.participants, instancesMap, sheetsById);
    expect(ordered.map((p) => p.itemId)).toEqual(["gob-2", "gob-1", "pj-1", "npc-1"]);

    // Inicia combate -> turno ativo no 1º (gob-2)
    enc = startEncounterCombat(enc, instancesMap, sheetsById);
    expect(enc.active).toBe(true);
    expect(enc.activeParticipantItemId).toBe("gob-2");

    // Remove o participante ativo do combate -> próximo participante (gob-1) herda turno sem quebrar
    enc = removeParticipantsFromEncounter(
      enc,
      ["gob-2"],
      instancesMap,
      sheetsById,
    ).encounter;
    expect(enc.participants).toHaveLength(3);
    expect(enc.active).toBe(true);
    expect(enc.activeParticipantItemId).toBe("gob-1");

    // Avança turnos até completar rodada e incrementar round (condição com rodada expira apenas em combatentes)
    const outOfCombatInst = addConditionToInstance(
      createTokenInstanceFromSheet({
        sheet: goblin,
        boundItemId: "gob-fora",
        sceneId: "scene-multi",
      }),
      createConditionFromCatalog("poisoned", { durationUnit: "rounds", duration: 1 }),
    );
    const allInst = [...instances, outOfCombatInst];

    let step = advanceEncounterTurn(enc, allInst, sheetsById); // -> pj-1
    expect(step.encounter.activeParticipantItemId).toBe("pj-1");
    expect(step.encounter.round).toBe(1);

    step = advanceEncounterTurn(step.encounter, allInst, sheetsById); // -> npc-1
    expect(step.encounter.activeParticipantItemId).toBe("npc-1");
    expect(step.encounter.round).toBe(1);

    step = advanceEncounterTurn(step.encounter, allInst, sheetsById); // -> wrap para gob-1, Rodada 2
    expect(step.encounter.activeParticipantItemId).toBe("gob-1");
    expect(step.encounter.round).toBe(2);
    expect(step.changedInstances.some((i) => i.boundItemId === "gob-fora")).toBe(false);
  });

  it("Teste 13 & 14: múltiplos encontros na mesma cena persistem independentemente no Dexie", async () => {
    const instA = createTokenInstanceFromSheet({
      sheet: goblin,
      boundItemId: "tok-a",
      sceneId: "scene-multi",
      individualName: "Goblin Mapa A",
    });
    const instB = createTokenInstanceFromSheet({
      sheet: npc,
      boundItemId: "tok-b",
      sceneId: "scene-multi",
      individualName: "Sentinela Mapa B",
    });
    const map = new Map([
      ["tok-a", instA],
      ["tok-b", instB],
    ]);

    let enc1 = createCombatEncounter({ sceneId: "scene-multi", name: "Mapa A" });
    enc1 = addParticipantsToEncounter(enc1, ["tok-a"], map, sheetsById).encounter;
    enc1 = setParticipantInitiative(enc1, "tok-a", 16);
    enc1 = startEncounterCombat(enc1, map, sheetsById);

    let enc2 = createCombatEncounter({ sceneId: "scene-multi", name: "Mapa B" });
    enc2 = addParticipantsToEncounter(enc2, ["tok-b"], map, sheetsById).encounter;
    enc2 = setParticipantInitiative(enc2, "tok-b", 9);

    await storageProvider.encounters.saveEncounter(enc1);
    await storageProvider.encounters.saveEncounter(enc2);
    await storageProvider.encounters.setActiveEncounterId("scene-multi", enc1.id);

    const loaded = await storageProvider.encounters.listEncountersByScene("scene-multi");
    const activeId = await storageProvider.encounters.getActiveEncounterId("scene-multi");

    expect(loaded).toHaveLength(2);
    expect(activeId).toBe(enc1.id);
    expect(loaded.find((e) => e.id === enc1.id)?.participants.map((p) => p.itemId)).toEqual(["tok-a"]);
    expect(loaded.find((e) => e.id === enc2.id)?.participants.map((p) => p.itemId)).toEqual(["tok-b"]);
  });
});
