import { z } from "zod";
import type { CreatureSheet, VisibilityPolicy } from "../entities/sheet";
import type { Dnd5eRuleset, SheetCategory } from "../types/rpgSystem";
import { getDefaultVisibilityForCategory } from "../rules/visibilityProjection";

export const CURRENT_SHEET_SCHEMA_VERSION = "1.0.0";

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Remove chaves perigosas (prototype pollution) recursivamente de objetos JSON importados.
 */
export function stripUnsafeKeys(value: unknown, depth = 0): unknown {
  if (depth > 32) {
    throw new Error("Profundidade máxima de JSON excedida.");
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripUnsafeKeys(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    const clean: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      clean[key] = stripUnsafeKeys(val, depth + 1);
    }
    return clean;
  }
  if (typeof value === "string") {
    // Remove blocos <script> em descrições importadas
    return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  }
  return value;
}

export function isSafeImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:text/") ||
    lower.startsWith("data:application/")
  ) {
    return false;
  }
  if (lower.startsWith("data:image/svg+xml")) {
    // Bloqueia event handlers ou scripts inline em data-URL SVG
    if (/<script|on\w+\s*=|javascript:/i.test(trimmed)) {
      return false;
    }
    return true;
  }
  if (lower.startsWith("data:image/")) {
    return /^data:image\/(png|jpeg|jpg|webp|gif|avif|bmp);base64,[a-z0-9+/=]+$/i.test(
      trimmed,
    );
  }
  if (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("blob:") ||
    trimmed.startsWith("/")
  ) {
    return true;
  }
  return false;
}

const SafeUrlSchema = z.string().refine(isSafeImageUrl, {
  message: "URL de imagem inválida ou potencialmente insegura.",
});

export const ImageAssetMetaSchema = z
  .object({
    url: SafeUrlSchema,
    name: z.string().max(240).optional(),
    mime: z.string().max(100).optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    gridDpi: z.number().positive().optional(),
    gridOffset: z
      .object({
        x: z.number(),
        y: z.number(),
      })
      .optional(),
    signature: z.string().max(300).optional(),
  })
  .passthrough();

export const ImageReferenceSchema = z
  .union([SafeUrlSchema, ImageAssetMetaSchema, z.null()])
  .default(null);

export const AbilityKeySchema = z.enum(["str", "dex", "con", "int", "wis", "cha"]);

export const DamagePartSchema = z.object({
  formula: z.string().min(1).max(120),
  type: z.string().max(80).default("slashing"),
});

export const FeatureEntrySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(160),
    description: z.string().max(12000).default(""),
    kind: z
      .enum([
        "trait",
        "action",
        "bonus",
        "reaction",
        "legendary",
        "lair",
        "mythic",
        "spell",
        "equipment",
        "resource",
        "custom",
      ])
      .optional(),
    usageFrequency: z.string().max(120).optional(),
    maxUses: z.number().int().min(0).nullable().optional(),
    availableUses: z.number().int().min(0).nullable().optional(),
    rechargeOn: z
      .enum([
        "at-will",
        "short-rest",
        "long-rest",
        "dawn",
        "recharge-4-6",
        "recharge-5-6",
        "recharge-6",
        "per-day",
        "turn",
        "custom",
      ])
      .optional(),
    attackBonus: z.number().int().nullable().optional(),
    reach: z.number().nonnegative().nullable().optional(),
    range: z.string().max(80).nullable().optional(),
    damage: z.array(DamagePartSchema).optional(),
    saveDc: z.number().int().min(0).nullable().optional(),
    saveAbility: AbilityKeySchema.nullable().optional(),
    appliedConditions: z.array(z.string().max(80)).optional(),
    extraRules: z.string().max(4000).optional(),
    cost: z.number().int().min(1).optional(),
    spellLevel: z.number().int().min(0).max(9).nullable().optional(),
    school: z.string().max(80).nullable().optional(),
    castingTime: z.string().max(120).nullable().optional(),
    components: z.string().max(160).nullable().optional(),
    duration: z.string().max(120).nullable().optional(),
    concentration: z.boolean().optional(),
    ritual: z.boolean().optional(),
    prepared: z.boolean().optional(),
  })
  .passthrough();

export const SavingThrowSchema = z.object({
  ability: AbilityKeySchema,
  proficient: z.boolean().default(true),
  bonus: z.number().int().optional(),
});

export const SkillKeySchema = z.enum([
  "acrobatics",
  "animalHandling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleightOfHand",
  "stealth",
  "survival",
]);

export const SkillEntrySchema = z.object({
  id: SkillKeySchema,
  proficient: z.boolean().default(true),
  expertise: z.boolean().optional(),
  halfProficiency: z.boolean().optional(),
  bonus: z.number().int().optional(),
  abilityOverride: AbilityKeySchema.optional(),
});

export const VisibilityPolicySchema = z
  .object({
    publicName: z.boolean().default(true),
    publicHealthBar: z.boolean().default(true),
    publicHealthPercent: z.boolean().default(false),
    publicExactHp: z.boolean().default(false),
    publicTempHp: z.boolean().default(false),
    publicArmorClass: z.boolean().default(false),
    publicConditions: z.boolean().default(true),
    publicSummarySheet: z.boolean().default(false),
    publicFullSheet: z.boolean().default(false),
    playerCanEdit: z.boolean().default(false),
  })
  .passthrough();

export const CharacterDetailsSchema = z
  .object({
    species: z.string().max(120).optional(),
    classes: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1).max(80),
          subclass: z.string().max(80).optional(),
          level: z.number().int().min(1).max(20),
          hitDie: z.enum(["d6", "d8", "d10", "d12"]).default("d8"),
        }),
      )
      .default([]),
    level: z.number().int().min(1).max(20).default(1),
    background: z.string().max(120).optional(),
    inspiration: z.boolean().default(false),
    experiencePoints: z.number().int().min(0).default(0),
    proficiencies: z
      .object({
        armor: z.array(z.string()).default([]),
        weapons: z.array(z.string()).default([]),
        tools: z.array(z.string()).default([]),
      })
      .default({ armor: [], weapons: [], tools: [] }),
    inventory: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1).max(160),
          quantity: z.number().min(0).default(1),
          weight: z.number().min(0).optional(),
          equipped: z.boolean().optional(),
          attuned: z.boolean().optional(),
          notes: z.string().max(1000).optional(),
        }),
      )
      .default([]),
    currency: z
      .object({
        cp: z.number().int().min(0).default(0),
        sp: z.number().int().min(0).default(0),
        ep: z.number().int().min(0).default(0),
        gp: z.number().int().min(0).default(0),
        pp: z.number().int().min(0).default(0),
      })
      .default({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }),
    spellcasting: z
      .object({
        ability: AbilityKeySchema.nullable().optional(),
        saveDc: z.number().int().nullable().optional(),
        attackBonus: z.number().int().nullable().optional(),
        concentratingOn: z.string().max(120).nullable().optional(),
        slots: z
          .record(
            z.string(),
            z.object({
              max: z.number().int().min(0).max(20),
              used: z.number().int().min(0).max(20),
            }),
          )
          .default({}),
      })
      .optional(),
    deathSaves: z
      .object({
        successes: z.number().int().min(0).max(3).default(0),
        failures: z.number().int().min(0).max(3).default(0),
      })
      .default({ successes: 0, failures: 0 }),
    restNotes: z.string().max(4000).optional(),
  })
  .passthrough();

export const CreatureSheetSchema = z
  .object({
    schemaVersion: z.string().default(CURRENT_SHEET_SCHEMA_VERSION),
    id: z.string().min(1).max(160),
    system: z.string().default("dnd5e"),
    ruleset: z.enum(["dnd5e-2014", "dnd5e-2024"]).default("dnd5e-2014"),
    kind: z.enum(["monster", "npc", "character"]).default("monster"),
    name: z.string().min(1).max(160),
    alias: z.string().max(160).optional(),
    portrait: ImageReferenceSchema,
    tokenImage: ImageReferenceSchema,
    altImage: ImageReferenceSchema.optional(),
    description: z.string().max(20000).default(""),
    size: z
      .enum(["TINY", "SMALL", "MEDIUM", "LARGE", "HUGE", "GARGANTUAN"])
      .default("MEDIUM"),
    creatureType: z.string().max(80).default("HUMANOID"),
    subtype: z.string().max(80).optional(),
    alignment: z.string().max(80).default("NEUTRAL"),
    source: z.string().max(160).optional(),
    armorClass: z.object({
      value: z.number().int().min(0).max(99),
      description: z.string().max(160).default(""),
    }),
    hitPoints: z.object({
      maximum: z.number().int().min(1).max(99999),
      current: z.number().int().min(0).max(99999).optional(),
      temporary: z.number().int().min(0).max(99999).optional(),
      formula: z.string().max(80).default("1d8"),
      hitDie: z.enum(["d4", "d6", "d8", "d10", "d12", "d20"]).optional(),
      hitDiceTotal: z.number().int().min(0).optional(),
      hitDiceAvailable: z.number().int().min(0).optional(),
    }),
    speed: z
      .object({
        walk: z.number().min(0).nullable().default(9),
        fly: z.number().min(0).nullable().default(null),
        swim: z.number().min(0).nullable().default(null),
        climb: z.number().min(0).nullable().default(null),
        burrow: z.number().min(0).nullable().default(null),
        hover: z.boolean().optional(),
        special: z.string().max(160).optional(),
        unit: z.enum(["m", "ft", "q"]).default("m"),
      })
      .default({
        walk: 9,
        fly: null,
        swim: null,
        climb: null,
        burrow: null,
        unit: "m",
      }),
    abilities: z.object({
      str: z.number().int().min(1).max(50),
      dex: z.number().int().min(1).max(50),
      con: z.number().int().min(1).max(50),
      int: z.number().int().min(1).max(50),
      wis: z.number().int().min(1).max(50),
      cha: z.number().int().min(1).max(50),
    }),
    abilityModifiersOverride: z
      .partialRecord(AbilityKeySchema, z.number().int().nullable())
      .optional(),
    proficiencyBonus: z.number().int().min(0).max(20).default(2),
    initiativeBonus: z.number().int().nullable().optional(),
    challengeRating: z.string().max(20).default("1"),
    experiencePoints: z.number().int().min(0).default(200),
    savingThrows: z.array(SavingThrowSchema).default([]),
    skills: z.array(SkillEntrySchema).default([]),
    damageResistances: z.array(z.string().max(80)).default([]),
    damageImmunities: z.array(z.string().max(80)).default([]),
    damageVulnerabilities: z.array(z.string().max(80)).default([]),
    conditionImmunities: z.array(z.string().max(80)).default([]),
    senses: z.array(z.string().max(120)).default([]),
    passivePerceptionOverride: z.number().int().nullable().optional(),
    languages: z.array(z.string().max(80)).default([]),
    traits: z.array(FeatureEntrySchema).default([]),
    actions: z.array(FeatureEntrySchema).default([]),
    bonusActions: z.array(FeatureEntrySchema).default([]),
    reactions: z.array(FeatureEntrySchema).default([]),
    legendaryActions: z.array(FeatureEntrySchema).default([]),
    legendaryActionCount: z.number().int().min(0).max(20).optional(),
    legendaryDescription: z.string().max(1000).optional(),
    lairActions: z.array(FeatureEntrySchema).default([]),
    mythicActions: z.array(FeatureEntrySchema).default([]),
    spells: z.array(FeatureEntrySchema).default([]),
    equipment: z.array(FeatureEntrySchema).default([]),
    resources: z.array(FeatureEntrySchema).default([]),
    customFeatures: z.array(FeatureEntrySchema).default([]),
    characterDetails: CharacterDetailsSchema.optional(),
    tags: z.array(z.string().max(60)).default([]),
    favorite: z.boolean().default(false),
    visibility: VisibilityPolicySchema.optional(),
    notes: z
      .object({
        public: z.string().max(30000).default(""),
        gm: z.string().max(30000).default(""),
      })
      .default({ public: "", gm: "" }),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

/**
 * Normaliza e migra dados brutos (incluindo o exemplo do prompt com `publicHitPoints`
 * ou versões antigas de schema) para uma `CreatureSheet` validada.
 */
export function migrateAndValidateSheet(raw: unknown): CreatureSheet {
  const sanitized = stripUnsafeKeys(raw);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    throw new Error("Ficha inválida: esperado um objeto JSON.");
  }

  const obj = { ...(sanitized as Record<string, unknown>) };

  // Migração de visibilidade legada / exemplo do prompt (publicHitPoints -> publicExactHp)
  if (obj.visibility && typeof obj.visibility === "object") {
    const vis = { ...(obj.visibility as Record<string, unknown>) };
    if ("publicHitPoints" in vis && !("publicExactHp" in vis)) {
      vis.publicExactHp = Boolean(vis.publicHitPoints);
    }
    obj.visibility = vis;
  }

  const now = new Date().toISOString();
  const parsed = CreatureSheetSchema.parse(obj);
  const category = parsed.kind;
  const defaults = getDefaultVisibilityForCategory(category);
  const visibility: VisibilityPolicy = {
    ...defaults,
    ...(parsed.visibility ?? {}),
  };

  return {
    ...parsed,
    schemaVersion: CURRENT_SHEET_SCHEMA_VERSION,
    visibility,
    createdAt: parsed.createdAt ?? now,
    updatedAt: parsed.updatedAt ?? now,
  } as CreatureSheet;
}

export function createEmptySheet(
  kind: SheetCategory = "monster",
  ruleset: Dnd5eRuleset = "dnd5e-2014",
): CreatureSheet {
  const now = new Date().toISOString();
  const isChar = kind === "character";
  return {
    schemaVersion: CURRENT_SHEET_SCHEMA_VERSION,
    id: `${kind}-${crypto.randomUUID()}`,
    system: "dnd5e",
    ruleset,
    kind,
    name:
      kind === "monster"
        ? "Novo Monstro"
        : kind === "npc"
          ? "Novo NPC"
          : "Novo Personagem",
    alias: "",
    portrait: null,
    tokenImage: null,
    altImage: null,
    description: "",
    size: "MEDIUM",
    creatureType: "HUMANOID",
    subtype: "",
    alignment: "NEUTRO",
    source: "Customizado",
    armorClass: {
      value: 12,
      description: isChar ? "Armadura leve" : "Natural",
    },
    hitPoints: {
      maximum: isChar ? 12 : 15,
      current: isChar ? 12 : 15,
      temporary: 0,
      formula: isChar ? "1d10+2" : "2d8+4",
      hitDie: "d8",
      hitDiceTotal: 1,
      hitDiceAvailable: 1,
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
      str: 10,
      dex: 12,
      con: 12,
      int: 10,
      wis: 10,
      cha: 10,
    },
    proficiencyBonus: 2,
    challengeRating: isChar ? "1" : "1/2",
    experiencePoints: isChar ? 0 : 100,
    savingThrows: [],
    skills: [],
    damageResistances: [],
    damageImmunities: [],
    damageVulnerabilities: [],
    conditionImmunities: [],
    senses: [],
    languages: ["Comum"],
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    lairActions: [],
    mythicActions: [],
    spells: [],
    equipment: [],
    resources: [],
    customFeatures: [],
    characterDetails:
      kind === "character" || kind === "npc"
        ? {
            species: ruleset === "dnd5e-2024" ? "Humano" : "Humano",
            classes: [
              {
                id: crypto.randomUUID(),
                name: "Guerreiro",
                subclass: "",
                level: 1,
                hitDie: "d10",
              },
            ],
            level: 1,
            background: "Soldado",
            inspiration: false,
            experiencePoints: 0,
            proficiencies: {
              armor: ["Armaduras leves", "Armaduras médias", "Escudos"],
              weapons: ["Armas simples", "Armas marciais"],
              tools: [],
            },
            inventory: [],
            currency: { cp: 0, sp: 0, ep: 0, gp: 15, pp: 0 },
            spellcasting: {
              ability: null,
              saveDc: null,
              attackBonus: null,
              concentratingOn: null,
              slots: {},
            },
            deathSaves: { successes: 0, failures: 0 },
            restNotes: "",
          }
        : undefined,
    tags: [],
    favorite: false,
    visibility: getDefaultVisibilityForCategory(kind),
    notes: {
      public: "",
      gm: "",
    },
    createdAt: now,
    updatedAt: now,
  };
}
