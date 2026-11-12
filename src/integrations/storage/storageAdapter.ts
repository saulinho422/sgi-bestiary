import type { BestiarySettings } from "@/domain/entities/settings";
import type { CreatureSheet } from "@/domain/entities/sheet";
import type {
  ImageTemplateMapping,
  TokenInstance,
} from "@/domain/entities/tokenInstance";

export interface LibraryStorageAdapter {
  listSheets(): Promise<CreatureSheet[]>;
  getSheet(id: string): Promise<CreatureSheet | undefined>;
  saveSheet(sheet: CreatureSheet): Promise<void>;
  saveSheetsBulk(sheets: CreatureSheet[]): Promise<void>;
  deleteSheet(id: string): Promise<void>;
  clearAllSheets(): Promise<void>;
}

export interface InstanceStorageAdapter {
  listInstancesByScene(sceneId: string): Promise<TokenInstance[]>;
  listAllInstances(): Promise<TokenInstance[]>;
  getInstance(boundItemId: string, sceneId?: string): Promise<TokenInstance | undefined>;
  saveInstance(instance: TokenInstance): Promise<void>;
  saveInstancesBulk(instances: TokenInstance[]): Promise<void>;
  deleteInstance(boundItemId: string, sceneId?: string): Promise<void>;
  deleteInstancesByScene(sceneId: string): Promise<void>;
}

export interface MappingStorageAdapter {
  listMappings(): Promise<ImageTemplateMapping[]>;
  getMappingBySignature(signature: string): Promise<ImageTemplateMapping | undefined>;
  saveMapping(mapping: ImageTemplateMapping): Promise<void>;
  deleteMapping(signature: string): Promise<void>;
}

export interface SettingsStorageAdapter {
  getSettings(): Promise<BestiarySettings>;
  saveSettings(settings: BestiarySettings): Promise<void>;
}

export interface StorageProvider {
  kind: "indexeddb" | "remote-api";
  library: LibraryStorageAdapter;
  instances: InstanceStorageAdapter;
  mappings: MappingStorageAdapter;
  settings: SettingsStorageAdapter;
}
