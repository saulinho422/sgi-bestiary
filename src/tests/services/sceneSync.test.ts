import { beforeEach, describe, expect, it } from "vitest";
import type { CreatureSheet } from "@/domain/entities/sheet";
import { SEED_SHEETS } from "@/integrations/storage/seedData";
import { storageProvider } from "@/integrations/storage/dexieRepository";
import {
  addParticipantsToEncounter,
  createCombatEncounter,
} from "@/services/combatService";
import { createTokenInstanceFromSheet } from "@/services/instanceService";
import {
  clearPendingSpawnItemIds,
  markPendingSpawnItemIds,
  pruneOrphanRecordsForScene,
  reconcileSceneRecordsPure,
} from "@/services/sceneSyncService";

describe("Sincronização bidirecional Cena ↔ Mapa e limpeza de órfãos (Testes 8, 9, 11)", () => {
  const goblin = SEED_SHEETS.find((s) => s.id === "seed-goblin-001")!;
  const sheetsById = new Map<string, CreatureSheet>([[goblin.id, goblin]]);

  beforeEach(async () => {
    clearPendingSpawnItemIds(["gob-1", "gob-2", "gob-pending", "gob-other"]);
    await storageProvider.library.saveSheet(goblin);
    await storageProvider.instances.deleteInstancesByScene("scene-sync-A");
    await storageProvider.instances.deleteInstancesByScene("scene-sync-B");
    for (const s of ["scene-sync-A", "scene-sync-B"]) {
      const encs = await storageProvider.encounters.listEncountersByScene(s);
      for (const e of encs) {
        await storageProvider.encounters.deleteEncounter(e.id);
      }
    }
  });

  it("reconcileSceneRecordsPure protege tokens recém-invocados e isola órfãos por cena", () => {
    const i1 = createTokenInstanceFromSheet({
      sheet: goblin,
      boundItemId: "gob-1",
      sceneId: "scene-sync-A",
      individualName: "Goblin 1",
    });
    const iPending = createTokenInstanceFromSheet({
      sheet: goblin,
      boundItemId: "gob-pending",
      sceneId: "scene-sync-A",
      individualName: "Goblin Pending",
    });
    const iOrphan = createTokenInstanceFromSheet({
      sheet: goblin,
      boundItemId: "gob-orphan",
      sceneId: "scene-sync-A",
      individualName: "Goblin Órfão",
    });

    const enc = addParticipantsToEncounter(
      createCombatEncounter({ sceneId: "scene-sync-A" }),
      ["gob-1", "gob-pending", "gob-orphan"],
      new Map([i1, iPending, iOrphan].map((i) => [i.boundItemId, i])),
      sheetsById,
    ).encounter;

    const result = reconcileSceneRecordsPure({
      sceneId: "scene-sync-A",
      instances: [i1, iPending, iOrphan],
      encounters: [enc],
      validItemIds: new Set(["gob-1"]),
      protectedItemIds: new Set(["gob-pending"]),
      sheetsById,
    });

    expect(result.orphanItemIds).toEqual(["gob-orphan"]);
    expect(result.survivingInstances.map((i) => i.boundItemId)).toEqual([
      "gob-1",
      "gob-pending",
    ]);
    expect(result.updatedEncounters[0].participants.map((p) => p.itemId)).toEqual([
      "gob-1",
      "gob-pending",
    ]);
  });

  it("Teste 8, 9 & 11: exclusão de token no mapa remove instância + combate, preserva Biblioteca e outras cenas", async () => {
    const i1 = createTokenInstanceFromSheet({
      sheet: goblin,
      boundItemId: "gob-1",
      sceneId: "scene-sync-A",
      individualName: "Goblin 1",
    });
    const i2 = createTokenInstanceFromSheet({
      sheet: goblin,
      boundItemId: "gob-2",
      sceneId: "scene-sync-A",
      individualName: "Goblin 2",
    });
    const iOtherScene = createTokenInstanceFromSheet({
      sheet: goblin,
      boundItemId: "gob-other",
      sceneId: "scene-sync-B",
      individualName: "Goblin Cena B",
    });

    await storageProvider.instances.saveInstancesBulk([i1, i2, iOtherScene]);

    const encA = addParticipantsToEncounter(
      createCombatEncounter({ sceneId: "scene-sync-A" }),
      ["gob-1", "gob-2"],
      new Map([i1, i2].map((i) => [i.boundItemId, i])),
      sheetsById,
    ).encounter;
    await storageProvider.encounters.saveEncounter(encA);

    // 1. Exclui gob-1 do mapa -> deve sumir de instances e encA imediatamente
    let pruned = await pruneOrphanRecordsForScene({
      sceneId: "scene-sync-A",
      validItemIds: new Set(["gob-2"]),
      sheetsById,
    });
    expect(pruned.orphanItemIds).toEqual(["gob-1"]);
    expect(pruned.survivingInstances.map((i) => i.boundItemId)).toEqual(["gob-2"]);
    expect(pruned.encounters[0].participants.map((p) => p.itemId)).toEqual(["gob-2"]);

    // 2. Exclui o restante (lote/sequencial) -> encA zera participantes sem apagar ficha-base nem cena B
    pruned = await pruneOrphanRecordsForScene({
      sceneId: "scene-sync-A",
      validItemIds: new Set(),
      sheetsById,
    });
    expect(pruned.orphanItemIds).toEqual(["gob-2"]);
    expect(pruned.survivingInstances).toHaveLength(0);
    expect(pruned.encounters[0].participants).toHaveLength(0);

    // Ficha-base permanece na Biblioteca
    const sheetInLib = await storageProvider.library.getSheet(goblin.id);
    expect(sheetInLib?.name).toBe("Goblin");

    // Cena B permanece intacta
    const sceneBInstances =
      await storageProvider.instances.listInstancesByScene("scene-sync-B");
    expect(sceneBInstances.map((i) => i.boundItemId)).toEqual(["gob-other"]);
  });

  it("markPendingSpawnItemIds evita remoção falsa antes da confirmação do OBR", async () => {
    const iPending = createTokenInstanceFromSheet({
      sheet: goblin,
      boundItemId: "gob-pending",
      sceneId: "scene-sync-A",
      individualName: "Goblin Novo",
    });
    await storageProvider.instances.saveInstance(iPending);

    markPendingSpawnItemIds(["gob-pending"]);
    const prunedWhilePending = await pruneOrphanRecordsForScene({
      sceneId: "scene-sync-A",
      validItemIds: new Set(),
      sheetsById,
    });
    expect(prunedWhilePending.survivingInstances.map((i) => i.boundItemId)).toEqual([
      "gob-pending",
    ]);

    clearPendingSpawnItemIds(["gob-pending"]);
    const prunedAfterClear = await pruneOrphanRecordsForScene({
      sceneId: "scene-sync-A",
      validItemIds: new Set(),
      sheetsById,
    });
    expect(prunedAfterClear.survivingInstances).toHaveLength(0);
  });
});
