import type {
  AbilityKey,
  CreatureSize,
  Dnd5eRuleset,
  RpgSystemId,
  SheetCategory,
  SkillKey,
} from "../types/rpgSystem";

export interface ImageAssetMeta {
  url: string;
  name?: string;
  mime?: string;
  width?: number;
  height?: number;
  gridDpi?: number;
  gridOffset?: { x: number; y: number };
  signature?: string;
}

export type ImageReference = string | ImageAssetMeta | null;

export interface DamagePart {
  formula: string;
  type: string;
}

export type RechargeTiming =
  | "at-will"
  | "short-rest"
  | "long-rest"
  | "dawn"
  | "recharge-4-6"
  | "recharge-5-6"
  | "recharge-6"
  | "per-day"
  | "turn"
  | "custom";

export interface FeatureEntry {
  id: string;
  name: string;
  description: string;
  kind?:
    | "trait"
    | "action"
    | "bonus"
    | "reaction"
    | "legendary"
    | "lair"
    | "mythic"
    | "spell"
    | "equipment"
    | "resource"
    | "custom";
  usageFrequency?: string;
  maxUses?: number | null;
  availableUses?: number | null;
  rechargeOn?: RechargeTiming;
  attackBonus?: number | null;
  reach?: number | null;
  range?: string | null;
  damage?: DamagePart[];
  saveDc?: number | null;
  saveAbility?: AbilityKey | null;
  appliedConditions?: string[];
  extraRules?: string;
  cost?: number;
  spellLevel?: number | null;
  school?: string | null;
  castingTime?: string | null;
  components?: string | null;
  duration?: string | null;
  concentration?: boolean;
  ritual?: boolean;
  prepared?: boolean;
}

export interface SavingThrowEntry {
  ability: AbilityKey;
  proficient: boolean;
  bonus?: number;
}

export interface SkillEntry {
  id: SkillKey;
  proficient: boolean;
  expertise?: boolean;
  halfProficiency?: boolean;
  bonus?: number;
  abilityOverride?: AbilityKey;
}

export interface CharacterClassEntry {
  id: string;
  name: string;
  subclass?: string;
  level: number;
  hitDie: "d6" | "d8" | "d10" | "d12";
}

export interface InventoryItemEntry {
  id: string;
  name: string;
  quantity: number;
  weight?: number;
  equipped?: boolean;
  attuned?: boolean;
  notes?: string;
}

export interface SpellSlotLevel {
  max: number;
  used: number;
}

export interface CharacterDetails {
  species?: string;
  classes: CharacterClassEntry[];
  level: number;
  background?: string;
  inspiration: boolean;
  experiencePoints: number;
  proficiencies: {
    armor: string[];
    weapons: string[];
    tools: string[];
  };
  inventory: InventoryItemEntry[];
  currency: {
    cp: number;
    sp: number;
    ep: number;
    gp: number;
    pp: number;
  };
  spellcasting?: {
    ability?: AbilityKey | null;
    saveDc?: number | null;
    attackBonus?: number | null;
    concentratingOn?: string | null;
    slots: Record<string, SpellSlotLevel>;
  };
  deathSaves: {
    successes: number;
    failures: number;
  };
  restNotes?: string;
}

export interface VisibilityPolicy {
  publicName: boolean;
  publicHealthBar: boolean;
  publicHealthPercent: boolean;
  publicExactHp: boolean;
  publicTempHp: boolean;
  publicArmorClass: boolean;
  publicConditions: boolean;
  publicSummarySheet: boolean;
  publicFullSheet: boolean;
  playerCanEdit: boolean;
}

export interface CreatureSheet {
  schemaVersion: string;
  id: string;
  system: RpgSystemId;
  ruleset: Dnd5eRuleset;
  kind: SheetCategory;
  name: string;
  alias?: string;
  portrait: ImageReference;
  tokenImage: ImageReference;
  altImage?: ImageReference;
  description: string;
  size: CreatureSize;
  creatureType: string;
  subtype?: string;
  alignment: string;
  source?: string;
  armorClass: {
    value: number;
    description: string;
  };
  hitPoints: {
    maximum: number;
    current?: number;
    temporary?: number;
    formula: string;
    hitDie?: "d4" | "d6" | "d8" | "d10" | "d12" | "d20";
    hitDiceTotal?: number;
    hitDiceAvailable?: number;
  };
  speed: {
    walk: number | null;
    fly: number | null;
    swim: number | null;
    climb: number | null;
    burrow: number | null;
    hover?: boolean;
    special?: string;
    unit: "m" | "ft" | "q";
  };
  abilities: Record<AbilityKey, number>;
  abilityModifiersOverride?: Partial<Record<AbilityKey, number | null>>;
  proficiencyBonus: number;
  initiativeBonus?: number | null;
  challengeRating: string;
  experiencePoints: number;
  savingThrows: SavingThrowEntry[];
  skills: SkillEntry[];
  damageResistances: string[];
  damageImmunities: string[];
  damageVulnerabilities: string[];
  conditionImmunities: string[];
  senses: string[];
  passivePerceptionOverride?: number | null;
  languages: string[];
  traits: FeatureEntry[];
  actions: FeatureEntry[];
  bonusActions: FeatureEntry[];
  reactions: FeatureEntry[];
  legendaryActions: FeatureEntry[];
  legendaryActionCount?: number;
  legendaryDescription?: string;
  lairActions: FeatureEntry[];
  mythicActions: FeatureEntry[];
  spells: FeatureEntry[];
  equipment: FeatureEntry[];
  resources: FeatureEntry[];
  customFeatures: FeatureEntry[];
  characterDetails?: CharacterDetails;
  tags: string[];
  favorite: boolean;
  visibility: VisibilityPolicy;
  notes: {
    public: string;
    gm: string;
  };
  createdAt: string;
  updatedAt: string;
  /** Preserva campos extras de importações futuras sem perda */
  [extraKey: string]: unknown;
}
