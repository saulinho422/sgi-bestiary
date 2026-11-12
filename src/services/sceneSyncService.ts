import type { CreatureSheet } from "@/domain/entities/sheet";
import type {
  CombatEncounter,
  TokenInstance,
} from "@/domain/entities/tokenInstance";
import { storageProvider } from "@/integrations/storage/dexieRepository";
import { reconcileEncounterWithValidItems } from "@/services/combatService";

const pendingSpawnTimestamps = new Map<string, number>();
const PENDING_SPAWN_TTL_MS = 5000;

export function markPendingSpawnItemIds(itemIds: string[]): void {
  const now = Date.now();
  for (const id of itemIds) {
    pendingSpawnTimestamps.set(id, now);
  }
}

export function clearPendingSpawnItemIds(itemIds: string[]): void {
  for (const id of itemIds) {
    pendingSpawnTimestamps.delete(id);
  }
}

export function getActivePendingSpawnIds(now = Date.now()): Set<string> {
  const active = new Set<string>();
  for (const [id, ts] of pendingSpawnTimestamps.entries()) {
    if (now - ts <= PENDING_SPAWN_TTL_MS) {
      active.add(id);
    } else {
      pendingSpawnTimestamps.delete(id);
    }
  }
  return active;
}

export interface OrphanReconciliationResult {
  orphanItemIds: string[];
  survivingInstances: TokenInstance[];
  updatedEncounters: CombatEncounter[];
  encounterChangedIds: string[];
}

/**
 * Reconcilia de forma pura e idempotente as instâncias registradas e encontros
 * de uma cena com os IDs realmente existentes no mapa do Owlbear Rodeo.
 * Nunca altera fichas-base da Biblioteca nem registros de outras cenas.
 */
export function reconcileSceneRecordsPure(params: {
  sceneId: string;
  validItemIds: Set<string>;
  protectedItemIds?: Set<string>;
  instances: TokenInstance[];
  encounters: CombatEncounter[];
  sheetsById: Map<string, CreatureSheet>;
}): OrphanReconciliationResult {
  const {
    sceneId,
    validItemIds,
    protectedItemIds,
    instances,
    encounters,
    sheetsById,
  } = params;

  const effectiveValidIds = new Set(validItemIds);
  if (protectedItemIds) {
    for (const id of protectedItemIds) {
      effectiveValidIds.add(id);
    }
  }

  const orphanItemIds: string[] = [];
  const survivingInstances: TokenInstance[] = [];

  for (const inst of instances) {
    if (inst.sceneId !== sceneId) {
      survivingInstances.push(inst);
      continue;
    }
    if (effectiveValidIds.has(inst.boundItemId)) {
      survivingInstances.push(inst);
    } else {
      orphanItemIds.push(inst.boundItemId);
    }
  }

  const survivingMap = new Map(
    survivingInstances.map((i) => [i.boundItemId, i]),
  );

  const updatedEncounters: CombatEncounter[] = [];
  const encounterChangedIds: string[] = [];

  for (const enc of encounters) {
    if (enc.sceneId !== sceneId) {
      updatedEncounters.push(enc);
      continue;
    }
    const { encounter: cleaned, changed } = reconcileEncounterWithValidItems(
      enc,
      effectiveValidIds,
      survivingMap,
      sheetsById,
    );
    updatedEncounters.push(cleaned);
    if (changed) {
      encounterChangedIds.push(cleaned.id);
    }
  }

  return {
    orphanItemIds,
    survivingInstances,
    updatedEncounters,
    encounterChangedIds,
  };
}

/**
 * Executa a limpeza idempotente de instâncias órfãs e participações em combate
 * diretamente no armazenamento local para uma cena específica.
 */
export async function pruneOrphanRecordsForScene(params: {
  sceneId: string;
  validItemIds: Set<string>;
  sheetsById: Map<string, CreatureSheet>;
}): Promise<{
  orphanItemIds: string[];
  survivingInstances: TokenInstance[];
  encounters: CombatEncounter[];
  encountersChanged: boolean;
}> {
  const { sceneId, validItemIds, sheetsById } = params;
  const protectedItemIds = getActivePendingSpawnIds();

  const [instances, encounters] = await Promise.all([
    storageProvider.instances.listInstancesByScene(sceneId),
    storageProvider.encounters.listEncountersByScene(sceneId),
  ]);

  const plan = reconcileSceneRecordsPure({
    sceneId,
    validItemIds,
    protectedItemIds,
    instances,
    encounters,
    sheetsById,
  });

  if (plan.orphanItemIds.length > 0) {
    for (const id of plan.orphanItemIds) {
      await storageProvider.instances.deleteInstance(id, sceneId);
    }
  }

  if (plan.encounterChangedIds.length > 0) {
    const changedSet = new Set(plan.encounterChangedIds);
    for (const enc of plan.updatedEncounters) {
      if (changedSet.has(enc.id)) {
        await storageProvider.encounters.saveEncounter(enc);
      }
    }
  }

  return {
    orphanItemIds: plan.orphanItemIds,
    survivingInstances: plan.survivingInstances,
    encounters: plan.updatedEncounters,
    encountersChanged: plan.encounterChangedIds.length > 0,
  };
}
