import { DEFAULT_SETTINGS } from "@/domain/entities/settings";
import type { CreatureSheet } from "@/domain/entities/sheet";
import type {
  CombatEncounter,
  TokenInstance,
} from "@/domain/entities/tokenInstance";
import {
  defaultDexieDb,
  type SgiBestiaryDexieDb,
  type StoredInstanceRow,
} from "./dexieDatabase";
import type { StorageProvider } from "./storageAdapter";

export type DbSyncTopic =
  | "sheets"
  | "instances"
  | "mappings"
  | "settings"
  | "encounters";

const DB_SYNC_CHANNEL = "sgi-bestiary-db-sync";

function getSyncChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(DB_SYNC_CHANNEL);
  } catch {
    return null;
  }
}

export function notifyDbSync(topic: DbSyncTopic): void {
  const ch = getSyncChannel();
  if (!ch) return;
  try {
    ch.postMessage({ topic, at: Date.now() });
  } finally {
    ch.close();
  }
}

export function subscribeDbSync(
  handler: (topic: DbSyncTopic) => void,
): () => void {
  const ch = getSyncChannel();
  if (!ch) return () => {};
  const listener = (ev: MessageEvent<{ topic?: DbSyncTopic }>) => {
    if (ev.data?.topic) handler(ev.data.topic);
  };
  ch.addEventListener("message", listener);
  return () => {
    ch.removeEventListener("message", listener);
    ch.close();
  };
}

export function makeInstancePk(sceneId: string, boundItemId: string): string {
  return `${sceneId || "default"}::${boundItemId}`;
}

function stripPk(row: StoredInstanceRow): TokenInstance {
  const { pk: _pk, ...instance } = row;
  return instance;
}

export function createDexieStorageProvider(
  db: SgiBestiaryDexieDb = defaultDexieDb,
): StorageProvider {
  return {
    kind: "indexeddb",
    library: {
      async listSheets() {
        return db.sheets.orderBy("name").toArray();
      },
      async getSheet(id) {
        return db.sheets.get(id);
      },
      async saveSheet(sheet) {
        await db.sheets.put({
          ...sheet,
          updatedAt: new Date().toISOString(),
        });
        notifyDbSync("sheets");
      },
      async saveSheetsBulk(sheets) {
        const now = new Date().toISOString();
        await db.sheets.bulkPut(
          sheets.map((s) => ({
            ...s,
            updatedAt: s.updatedAt || now,
          })),
        );
        notifyDbSync("sheets");
      },
      async deleteSheet(id) {
        await db.sheets.delete(id);
        notifyDbSync("sheets");
      },
      async clearAllSheets() {
        await db.sheets.clear();
        notifyDbSync("sheets");
      },
    },
    instances: {
      async listInstancesByScene(sceneId) {
        const rows = await db.instances.where("sceneId").equals(sceneId).toArray();
        return rows.map(stripPk);
      },
      async listAllInstances() {
        const rows = await db.instances.toArray();
        return rows.map(stripPk);
      },
      async getInstance(boundItemId, sceneId) {
        if (sceneId) {
          const row = await db.instances.get(makeInstancePk(sceneId, boundItemId));
          if (row) return stripPk(row);
        }
        const fallback = await db.instances
          .where("boundItemId")
          .equals(boundItemId)
          .first();
        return fallback ? stripPk(fallback) : undefined;
      },
      async saveInstance(instance) {
        const sceneId = instance.sceneId || "default";
        const row: StoredInstanceRow = {
          ...instance,
          sceneId,
          pk: makeInstancePk(sceneId, instance.boundItemId),
        };
        await db.instances.put(row);
        notifyDbSync("instances");
      },
      async saveInstancesBulk(instances) {
        const rows: StoredInstanceRow[] = instances.map((instance) => {
          const sceneId = instance.sceneId || "default";
          return {
            ...instance,
            sceneId,
            pk: makeInstancePk(sceneId, instance.boundItemId),
          };
        });
        await db.instances.bulkPut(rows);
        notifyDbSync("instances");
      },
      async deleteInstance(boundItemId, sceneId) {
        if (sceneId) {
          await db.instances.delete(makeInstancePk(sceneId, boundItemId));
        } else {
          await db.instances.where("boundItemId").equals(boundItemId).delete();
        }
        notifyDbSync("instances");
      },
      async deleteInstancesByScene(sceneId) {
        await db.instances.where("sceneId").equals(sceneId).delete();
        notifyDbSync("instances");
      },
    },
    mappings: {
      async listMappings() {
        return db.imageMappings.toArray();
      },
      async getMappingBySignature(signature) {
        return db.imageMappings.get(signature);
      },
      async saveMapping(mapping) {
        await db.imageMappings.put(mapping);
        notifyDbSync("mappings");
      },
      async deleteMapping(signature) {
        await db.imageMappings.delete(signature);
        notifyDbSync("mappings");
      },
    },
    settings: {
      async getSettings() {
        const row = await db.settings.get("user-default");
        if (!row) return structuredClone(DEFAULT_SETTINGS);
        return {
          ui: { ...DEFAULT_SETTINGS.ui, ...row.value.ui },
          hud: {
            ...DEFAULT_SETTINGS.hud,
            ...row.value.hud,
            colorThresholds: {
              ...DEFAULT_SETTINGS.hud.colorThresholds,
              ...(row.value.hud?.colorThresholds ?? {}),
            },
          },
        };
      },
      async saveSettings(settings) {
        await db.settings.put({
          key: "user-default",
          value: settings,
          updatedAt: new Date().toISOString(),
        });
        notifyDbSync("settings");
      },
    },
    encounters: {
      async listEncountersByScene(sceneId) {
        const rows = await db.encounters
          .where("sceneId")
          .equals(sceneId || "default")
          .toArray();
        return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      async saveEncounter(encounter: CombatEncounter) {
        await db.encounters.put({
          ...encounter,
          sceneId: encounter.sceneId || "default",
          updatedAt: new Date().toISOString(),
        });
        notifyDbSync("encounters");
      },
      async deleteEncounter(encounterId: string) {
        await db.encounters.delete(encounterId);
        notifyDbSync("encounters");
      },
      async deleteEncountersByScene(sceneId: string) {
        await db.encounters
          .where("sceneId")
          .equals(sceneId || "default")
          .delete();
        await db.meta.delete(`active-encounter::${sceneId || "default"}`);
        notifyDbSync("encounters");
      },
      async getActiveEncounterId(sceneId: string) {
        const row = await db.meta.get(`active-encounter::${sceneId || "default"}`);
        return row?.value || null;
      },
      async setActiveEncounterId(sceneId: string, encounterId: string | null) {
        const key = `active-encounter::${sceneId || "default"}`;
        if (encounterId) {
          await db.meta.put({ key, value: encounterId });
        } else {
          await db.meta.delete(key);
        }
        notifyDbSync("encounters");
      },
    },
  };
}

export const storageProvider = createDexieStorageProvider();

export async function ensureSeedLibraryLoaded(
  seedSheets: CreatureSheet[],
  db: SgiBestiaryDexieDb = defaultDexieDb,
): Promise<boolean> {
  const seeded = await db.meta.get("seed-v1-loaded");
  if (seeded) return false;
  const count = await db.sheets.count();
  if (count === 0 && seedSheets.length > 0) {
    await db.sheets.bulkPut(seedSheets);
  }
  await db.meta.put({ key: "seed-v1-loaded", value: new Date().toISOString() });
  return true;
}
