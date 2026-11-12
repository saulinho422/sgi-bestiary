import type { BestiarySettings } from "@/domain/entities/settings";
import type { CreatureSheet } from "@/domain/entities/sheet";
import type { ImageTemplateMapping } from "@/domain/entities/tokenInstance";
import { CURRENT_SHEET_SCHEMA_VERSION } from "@/domain/schemas/sheetSchema";

export interface SgiBestiaryBackupBundle {
  format: "sgi-bestiary-bundle";
  schemaVersion: string;
  exportedAt: string;
  sheets: CreatureSheet[];
  imageMappings?: ImageTemplateMapping[];
  settings?: BestiarySettings;
}

export function exportSingleSheetToJson(sheet: CreatureSheet): string {
  return JSON.stringify(sheet, null, 2);
}

export function exportSheetsBatchToJson(sheets: CreatureSheet[]): string {
  const bundle: SgiBestiaryBackupBundle = {
    format: "sgi-bestiary-bundle",
    schemaVersion: CURRENT_SHEET_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sheets,
  };
  return JSON.stringify(bundle, null, 2);
}

export function exportFullBackupToJson(params: {
  sheets: CreatureSheet[];
  imageMappings?: ImageTemplateMapping[];
  settings?: BestiarySettings;
}): string {
  const bundle: SgiBestiaryBackupBundle = {
    format: "sgi-bestiary-bundle",
    schemaVersion: CURRENT_SHEET_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sheets: params.sheets,
    imageMappings: params.imageMappings,
    settings: params.settings,
  };
  return JSON.stringify(bundle, null, 2);
}

export function downloadJsonFile(filename: string, jsonContent: string): void {
  const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function sanitizeSlugFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "ficha"
  );
}
