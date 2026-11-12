export type RpgSystemId = "dnd5e" | (string & {});

export type Dnd5eRuleset = "dnd5e-2014" | "dnd5e-2024";

export type SheetCategory = "monster" | "npc" | "character";

export type CreatureSize =
  | "TINY"
  | "SMALL"
  | "MEDIUM"
  | "LARGE"
  | "HUGE"
  | "GARGANTUAN";

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type SkillKey =
  | "acrobatics"
  | "animalHandling"
  | "arcana"
  | "athletics"
  | "deception"
  | "history"
  | "insight"
  | "intimidation"
  | "investigation"
  | "medicine"
  | "nature"
  | "perception"
  | "performance"
  | "persuasion"
  | "religion"
  | "sleightOfHand"
  | "stealth"
  | "survival";

export interface RpgSystemDefinition {
  id: RpgSystemId;
  name: string;
  supportedRulesets: Array<{ id: string; label: string; summary: string }>;
  abilityLabels: Record<string, string>;
  defaultVisibilityByCategory: Record<
    SheetCategory,
    {
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
  >;
}
