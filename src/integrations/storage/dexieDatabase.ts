import Dexie, { type Table } from "dexie";
import type { BestiarySettings } from "@/domain/entities/settings";
import type { CreatureSheet } from "@/domain/entities/sheet";
import type {
  ImageTemplateMapping,
  TokenInstance,
} from "@/domain/entities/tokenInstance";

export interface StoredInstanceRow extends TokenInstance {
  /** Chave composta `${sceneId}::${boundItemId}` para isolamento entre cenas */
  pk: string;
}

export interface StoredSettingsRow {
  key: string;
  value: BestiarySettings;
  updatedAt: string;
}

export interface MetaFlagRow {
  key: string;
  value: string;
}

export class SgiBestiaryDexieDb extends Dexie {
  sheets!: Table<CreatureSheet, string>;
  instances!: Table<StoredInstanceRow, string>;
  imageMappings!: Table<ImageTemplateMapping, string>;
  settings!: Table<StoredSettingsRow, string>;
  meta!: Table<MetaFlagRow, string>;

  constructor(dbName = "sgi_bestiary_db") {
    super(dbName);
    this.version(1).stores({
      sheets: "id, kind, ruleset, name, favorite, updatedAt, *tags",
      instances: "pk, boundItemId, sceneId, templateId, instanceId, updatedAt",
      imageMappings: "signature, templateId, updatedAt",
      settings: "key",
      meta: "key",
    });
  }
}

export const defaultDexieDb = new SgiBestiaryDexieDb();
