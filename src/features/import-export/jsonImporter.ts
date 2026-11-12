import type { BestiarySettings } from "@/domain/entities/settings";
import type { CreatureSheet, FeatureEntry } from "@/domain/entities/sheet";
import type { ImageTemplateMapping } from "@/domain/entities/tokenInstance";
import {
  CURRENT_SHEET_SCHEMA_VERSION,
  migrateAndValidateSheet,
  stripUnsafeKeys,
} from "@/domain/schemas/sheetSchema";
import { CR_XP_TABLE, getProficiencyBonusFromCr } from "@/domain/rules/dnd5eRules";

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024; // 10 MB

export type DetectedImportFormat =
  | "sgi-single"
  | "sgi-array"
  | "sgi-bundle"
  | "external-5e-mapped";

export type DuplicateResolution = "replace" | "copy" | "skip";

export interface ImportPreviewItem {
  index: number;
  sheet: CreatureSheet;
  sourceFormat: DetectedImportFormat;
  warnings: string[];
  duplicateOfId?: string;
  duplicateReason?: "id-match" | "name-kind-match";
  resolution: DuplicateResolution;
}

export interface ImportPreviewResult {
  format: DetectedImportFormat;
  items: ImportPreviewItem[];
  errors: Array<{ index: number; reason: string }>;
  settings?: BestiarySettings;
  imageMappings?: ImageTemplateMapping[];
}

export interface ImportCommitReport {
  importedNew: number;
  replaced: number;
  copied: number;
  skipped: number;
  failed: number;
  settingsRestored: boolean;
  mappingsRestored: number;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

/**
 * Mapeia objetos externos simples (ex: formato tabular/Open5e-like com strength/hit_points/armor_class)
 * para o esquema SGI Bestiary, preservando avisos claros de mapeamento.
 */
function tryMapExternalGenericSheet(
  rawObj: Record<string, unknown>,
): { mapped: Record<string, unknown>; warnings: string[] } | null {
  const hasExternalMarkers =
    "armor_class" in rawObj ||
    "hit_points" in rawObj ||
    "strength" in rawObj ||
    ("hp" in rawObj && "ac" in rawObj);

  if (!hasExternalMarkers || typeof rawObj.name !== "string") {
    return null;
  }

  const warnings: string[] = [
    "Formato externo detectado e convertido automaticamente para o esquema SGI Bestiary.",
  ];

  const acRaw = rawObj.armor_class ?? rawObj.ac ?? 10;
  const acVal =
    typeof acRaw === "number"
      ? acRaw
      : Array.isArray(acRaw) && typeof acRaw[0] === "number"
        ? acRaw[0]
        : isRecord(acRaw) && typeof acRaw.value === "number"
          ? acRaw.value
          : 10;

  const hpVal = Number(rawObj.hit_points ?? rawObj.hp ?? 10) || 10;
  const crStr = String(rawObj.challenge_rating ?? rawObj.cr ?? "1");

  const mapFeatureList = (
    list: unknown,
    kind: FeatureEntry["kind"],
  ): FeatureEntry[] => {
    if (!Array.isArray(list)) return [];
    return list
      .filter(isRecord)
      .map((entry, idx) => ({
        id: String(entry.id ?? `${kind}-${idx + 1}`),
        name: String(entry.name ?? "Habilidade"),
        description: String(entry.desc ?? entry.description ?? ""),
        kind,
        attackBonus:
          typeof entry.attack_bonus === "number" ? entry.attack_bonus : undefined,
        damage:
          typeof entry.damage_dice === "string"
            ? [{ formula: entry.damage_dice, type: "físico" }]
            : undefined,
      }));
  };

  const sizeMap: Record<string, CreatureSheet["size"]> = {
    tiny: "TINY",
    small: "SMALL",
    medium: "MEDIUM",
    large: "LARGE",
    huge: "HUGE",
    gargantuan: "GARGANTUAN",
  };
  const rawSize = String(rawObj.size ?? "MEDIUM").toLowerCase();

  const mapped: Record<string, unknown> = {
    schemaVersion: CURRENT_SHEET_SCHEMA_VERSION,
    id:
      typeof rawObj.id === "string" && rawObj.id.trim()
        ? rawObj.id
        : typeof rawObj.slug === "string" && rawObj.slug.trim()
          ? `ext-${rawObj.slug}`
          : `ext-${crypto.randomUUID()}`,
    system: "dnd5e",
    ruleset: "dnd5e-2014",
    kind:
      rawObj.kind === "npc" || rawObj.kind === "character" ? rawObj.kind : "monster",
    name: rawObj.name,
    description: String(rawObj.desc ?? rawObj.description ?? ""),
    size: sizeMap[rawSize] ?? "MEDIUM",
    creatureType: String(rawObj.type ?? rawObj.creatureType ?? "HUMANOID").toUpperCase(),
    alignment: String(rawObj.alignment ?? "NEUTRAL"),
    portrait: null,
    tokenImage: null,
    armorClass: {
      value: Math.max(0, Math.trunc(acVal)),
      description: String(rawObj.armor_desc ?? ""),
    },
    hitPoints: {
      maximum: Math.max(1, Math.trunc(hpVal)),
      formula: String(rawObj.hit_dice ?? "2d8"),
    },
    speed: {
      walk: 9,
      fly: null,
      swim: null,
      climb: null,
      burrow: null,
      unit: "m",
    },
    abilities: {
      str: Number(rawObj.strength ?? rawObj.str ?? 10) || 10,
      dex: Number(rawObj.dexterity ?? rawObj.dex ?? 10) || 10,
      con: Number(rawObj.constitution ?? rawObj.con ?? 10) || 10,
      int: Number(rawObj.intelligence ?? rawObj.int ?? 10) || 10,
      wis: Number(rawObj.wisdom ?? rawObj.wis ?? 10) || 10,
      cha: Number(rawObj.charisma ?? rawObj.cha ?? 10) || 10,
    },
    proficiencyBonus: getProficiencyBonusFromCr(crStr),
    challengeRating: crStr,
    experiencePoints: CR_XP_TABLE[crStr] ?? 200,
    traits: mapFeatureList(rawObj.special_abilities ?? rawObj.traits, "trait"),
    actions: mapFeatureList(rawObj.actions, "action"),
    bonusActions: mapFeatureList(rawObj.bonus_actions, "bonus"),
    reactions: mapFeatureList(rawObj.reactions, "reaction"),
    legendaryActions: mapFeatureList(rawObj.legendary_actions, "legendary"),
    tags: ["importado"],
  };

  return { mapped, warnings };
}

export function previewJsonImport(
  jsonText: string,
  existingSheets: CreatureSheet[],
): ImportPreviewResult {
  if (new Blob([jsonText]).size > MAX_IMPORT_BYTES) {
    throw new Error("Arquivo excede o limite máximo de segurança de 10 MB.");
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `JSON malformado: ${err instanceof Error ? err.message : "erro de sintaxe"}`,
    );
  }

  const sanitized = stripUnsafeKeys(parsedRaw);

  let format: DetectedImportFormat = "sgi-single";
  let rawEntries: unknown[] = [];
  let settings: BestiarySettings | undefined;
  let imageMappings: ImageTemplateMapping[] | undefined;

  if (Array.isArray(sanitized)) {
    format = "sgi-array";
    rawEntries = sanitized;
  } else if (isRecord(sanitized)) {
    if (
      sanitized.format === "sgi-bestiary-bundle" ||
      Array.isArray(sanitized.sheets)
    ) {
      format = "sgi-bundle";
      rawEntries = Array.isArray(sanitized.sheets) ? sanitized.sheets : [];
      if (isRecord(sanitized.settings)) {
        settings = sanitized.settings as unknown as BestiarySettings;
      }
      if (Array.isArray(sanitized.imageMappings)) {
        imageMappings = sanitized.imageMappings as ImageTemplateMapping[];
      }
    } else {
      rawEntries = [sanitized];
    }
  } else {
    throw new Error("Estrutura JSON não suportada. Esperado objeto ou lista de fichas.");
  }

  const existingById = new Map(existingSheets.map((s) => [s.id, s]));
  const existingByNameKind = new Map(
    existingSheets.map((s) => [`${s.kind}:${s.name.trim().toLowerCase()}`, s]),
  );

  const items: ImportPreviewItem[] = [];
  const errors: Array<{ index: number; reason: string }> = [];

  rawEntries.forEach((entry, index) => {
    const warnings: string[] = [];
    let candidate = entry;
    let itemFormat: DetectedImportFormat = format;

    if (isRecord(entry) && !("armorClass" in entry && "hitPoints" in entry)) {
      const external = tryMapExternalGenericSheet(entry);
      if (external) {
        candidate = external.mapped;
        warnings.push(...external.warnings);
        itemFormat = "external-5e-mapped";
        if (format === "sgi-single") format = "external-5e-mapped";
      }
    }

    try {
      const sheet = migrateAndValidateSheet(candidate);

      if (sheet.portrait === null && isRecord(entry) && entry.portrait) {
        warnings.push("Retrato ignorado por formato inválido.");
      }

      const idMatch = existingById.get(sheet.id);
      const nameMatch = existingByNameKind.get(
        `${sheet.kind}:${sheet.name.trim().toLowerCase()}`,
      );

      const duplicateOfId = idMatch?.id ?? nameMatch?.id;
      const duplicateReason = idMatch
        ? "id-match"
        : nameMatch
          ? "name-kind-match"
          : undefined;

      items.push({
        index,
        sheet,
        sourceFormat: itemFormat,
        warnings,
        duplicateOfId,
        duplicateReason,
        resolution: duplicateOfId ? "copy" : "replace",
      });
    } catch (err) {
      errors.push({
        index,
        reason:
          err instanceof Error
            ? err.message
            : "Falha de validação no registro.",
      });
    }
  });

  return {
    format,
    items,
    errors,
    settings,
    imageMappings,
  };
}

export function resolveImportSheets(
  previewItems: ImportPreviewItem[],
): {
  sheetsToSave: CreatureSheet[];
  report: Omit<ImportCommitReport, "settingsRestored" | "mappingsRestored">;
} {
  const sheetsToSave: CreatureSheet[] = [];
  let importedNew = 0;
  let replaced = 0;
  let copied = 0;
  let skipped = 0;

  for (const item of previewItems) {
    if (!item.duplicateOfId) {
      sheetsToSave.push(item.sheet);
      importedNew++;
      continue;
    }

    if (item.resolution === "skip") {
      skipped++;
      continue;
    }

    if (item.resolution === "replace") {
      sheetsToSave.push({
        ...item.sheet,
        id: item.duplicateOfId,
        updatedAt: new Date().toISOString(),
      });
      replaced++;
      continue;
    }

    // "copy": gera um novo ID estável e preserva a cópia existente
    sheetsToSave.push({
      ...item.sheet,
      id: `${item.sheet.kind}-${crypto.randomUUID()}`,
      name:
        item.duplicateReason === "name-kind-match"
          ? `${item.sheet.name} (Cópia)`
          : item.sheet.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    copied++;
  }

  return {
    sheetsToSave,
    report: {
      importedNew,
      replaced,
      copied,
      skipped,
      failed: 0,
    },
  };
}
