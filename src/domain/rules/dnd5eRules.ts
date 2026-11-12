import type { CreatureSheet } from "../entities/sheet";
import type { TempHpRuleMode } from "../entities/settings";
import type {
  AbilityKey,
  Dnd5eRuleset,
  RpgSystemDefinition,
  SkillKey,
} from "../types/rpgSystem";

export const ABILITY_KEYS: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

export const ABILITY_LABELS_PT: Record<AbilityKey, { short: string; full: string }> = {
  str: { short: "FOR", full: "Força" },
  dex: { short: "DES", full: "Destreza" },
  con: { short: "CON", full: "Constituição" },
  int: { short: "INT", full: "Inteligência" },
  wis: { short: "SAB", full: "Sabedoria" },
  cha: { short: "CAR", full: "Carisma" },
};

export interface SkillDefinition {
  id: SkillKey;
  label: string;
  ability: AbilityKey;
}

export const DND5E_SKILLS: SkillDefinition[] = [
  { id: "acrobatics", label: "Acrobacia", ability: "dex" },
  { id: "animalHandling", label: "Adestrar Animais", ability: "wis" },
  { id: "arcana", label: "Arcanismo", ability: "int" },
  { id: "athletics", label: "Atletismo", ability: "str" },
  { id: "deception", label: "Enganação", ability: "cha" },
  { id: "history", label: "História", ability: "int" },
  { id: "insight", label: "Intuição", ability: "wis" },
  { id: "intimidation", label: "Intimidação", ability: "cha" },
  { id: "investigation", label: "Investigação", ability: "int" },
  { id: "medicine", label: "Medicina", ability: "wis" },
  { id: "nature", label: "Natureza", ability: "int" },
  { id: "perception", label: "Percepção", ability: "wis" },
  { id: "performance", label: "Atuação", ability: "cha" },
  { id: "persuasion", label: "Persuasão", ability: "cha" },
  { id: "religion", label: "Religião", ability: "int" },
  { id: "sleightOfHand", label: "Prestidigitação", ability: "dex" },
  { id: "stealth", label: "Furtividade", ability: "dex" },
  { id: "survival", label: "Sobrevivência", ability: "wis" },
];

export const CR_XP_TABLE: Record<string, number> = {
  "0": 10,
  "1/8": 25,
  "1/4": 50,
  "1/2": 100,
  "1": 200,
  "2": 450,
  "3": 700,
  "4": 1100,
  "5": 1800,
  "6": 2300,
  "7": 2900,
  "8": 3900,
  "9": 5000,
  "10": 5900,
  "11": 7200,
  "12": 8400,
  "13": 10000,
  "14": 11500,
  "15": 13000,
  "16": 15000,
  "17": 18000,
  "18": 20000,
  "19": 22000,
  "20": 25000,
  "21": 33000,
  "22": 41000,
  "23": 50000,
  "24": 62000,
  "25": 75000,
  "26": 90000,
  "27": 105000,
  "28": 120000,
  "29": 135000,
  "30": 155000,
};

export const SIZE_LABELS_PT: Record<string, string> = {
  TINY: "Miúdo",
  SMALL: "Pequeno",
  MEDIUM: "Médio",
  LARGE: "Grande",
  HUGE: "Enorme",
  GARGANTUAN: "Imenso",
};

export const CREATURE_TYPE_LABELS_PT: Record<string, string> = {
  ABERRATION: "Aberração",
  BEAST: "Besta",
  CELESTIAL: "Celestial",
  CONSTRUCT: "Constructo",
  DRAGON: "Dragão",
  ELEMENTAL: "Elemental",
  FEY: "Feérico",
  FIEND: "Corruptor",
  GIANT: "Gigante",
  HUMANOID: "Humanoide",
  MONSTROSITY: "Monstruosidade",
  OOZE: "Limo",
  PLANT: "Planta",
  UNDEAD: "Morto-vivo",
};

export const DND5E_SYSTEM_DEFINITION: RpgSystemDefinition = {
  id: "dnd5e",
  name: "Dungeons & Dragons 5ª Edição",
  supportedRulesets: [
    {
      id: "dnd5e-2014",
      label: "D&D 5e (2014)",
      summary: "Regras clássicas de 2014: Raças, exaustão em 6 estágios, bloco tradicional.",
    },
    {
      id: "dnd5e-2024",
      label: "D&D 5e (2024)",
      summary: "Regras revisadas 2024: Espécies, Exaustão (-2/nível), Iniciativa com bônus explícito e Maestria de Armas.",
    },
  ],
  abilityLabels: {
    str: "FOR",
    dex: "DES",
    con: "CON",
    int: "INT",
    wis: "SAB",
    cha: "CAR",
  },
  defaultVisibilityByCategory: {
    monster: {
      publicName: true,
      publicHealthBar: true,
      publicHealthPercent: false,
      publicExactHp: false,
      publicTempHp: false,
      publicArmorClass: false,
      publicConditions: true,
      publicSummarySheet: false,
      publicFullSheet: false,
      playerCanEdit: false,
    },
    npc: {
      publicName: true,
      publicHealthBar: true,
      publicHealthPercent: false,
      publicExactHp: false,
      publicTempHp: true,
      publicArmorClass: false,
      publicConditions: true,
      publicSummarySheet: true,
      publicFullSheet: false,
      playerCanEdit: false,
    },
    character: {
      publicName: true,
      publicHealthBar: true,
      publicHealthPercent: true,
      publicExactHp: true,
      publicTempHp: true,
      publicArmorClass: true,
      publicConditions: true,
      publicSummarySheet: true,
      publicFullSheet: true,
      playerCanEdit: true,
    },
  },
};

export function getAbilityModifier(score: number, override?: number | null): number {
  if (typeof override === "number" && Number.isFinite(override)) {
    return Math.trunc(override);
  }
  return Math.floor((score - 10) / 2);
}

export function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function parseCrToNumber(cr: string): number {
  const clean = cr.trim();
  if (clean === "1/8") return 0.125;
  if (clean === "1/4") return 0.25;
  if (clean === "1/2") return 0.5;
  const num = Number(clean);
  return Number.isFinite(num) ? num : 0;
}

export function getProficiencyBonusFromCr(cr: string): number {
  const n = parseCrToNumber(cr);
  if (n < 5) return 2;
  if (n < 9) return 3;
  if (n < 13) return 4;
  if (n < 17) return 5;
  if (n < 21) return 6;
  if (n < 25) return 7;
  if (n < 29) return 8;
  return 9;
}

export function getProficiencyBonusFromLevel(level: number): number {
  const clamped = Math.max(1, Math.min(20, Math.trunc(level)));
  return Math.ceil(clamped / 4) + 1;
}

export function getSavingThrowModifier(sheet: CreatureSheet, ability: AbilityKey): number {
  const baseMod = getAbilityModifier(
    sheet.abilities[ability],
    sheet.abilityModifiersOverride?.[ability],
  );
  const save = sheet.savingThrows.find((s) => s.ability === ability);
  if (!save) return baseMod;
  return baseMod + (save.proficient ? sheet.proficiencyBonus : 0) + (save.bonus ?? 0);
}

export function getSkillModifier(sheet: CreatureSheet, skillId: SkillKey): number {
  const def = DND5E_SKILLS.find((s) => s.id === skillId);
  const entry = sheet.skills.find((s) => s.id === skillId);
  const ability = entry?.abilityOverride ?? def?.ability ?? "dex";
  const baseMod = getAbilityModifier(
    sheet.abilities[ability],
    sheet.abilityModifiersOverride?.[ability],
  );
  if (!entry) return baseMod;

  let profPart = 0;
  if (entry.expertise) {
    profPart = sheet.proficiencyBonus * 2;
  } else if (entry.proficient) {
    profPart = sheet.proficiencyBonus;
  } else if (entry.halfProficiency) {
    profPart = Math.floor(sheet.proficiencyBonus / 2);
  }
  return baseMod + profPart + (entry.bonus ?? 0);
}

export function getPassivePerception(sheet: CreatureSheet): number {
  if (
    typeof sheet.passivePerceptionOverride === "number" &&
    Number.isFinite(sheet.passivePerceptionOverride)
  ) {
    return Math.trunc(sheet.passivePerceptionOverride);
  }
  return 10 + getSkillModifier(sheet, "perception");
}

export function getInitiativeModifier(sheet: CreatureSheet): number {
  const dexMod = getAbilityModifier(
    sheet.abilities.dex,
    sheet.abilityModifiersOverride?.dex,
  );
  const extra = typeof sheet.initiativeBonus === "number" ? sheet.initiativeBonus : 0;
  return dexMod + extra;
}

export function getRulesetNotes(ruleset: Dnd5eRuleset): string[] {
  if (ruleset === "dnd5e-2024") {
    return [
      "Exaustão (2024): -2 por nível em Testes D20 e -1,5 m de deslocamento por nível (morte no nível 6).",
      "Iniciativa (2024): suporta bônus explícito de proficiência/Alert e destaque no cabeçalho do bloco.",
      "Personagens (2024): usa Espécie e Origem com talentos iniciais.",
    ];
  }
  return [
    "Exaustão (2014): tabela clássica em 6 estágios progressivos.",
    "Iniciativa (2014): baseada no modificador de Destreza + bônus opcionais.",
    "Personagens (2014): usa Raça, Classe/Subclasse e Antecedente.",
  ];
}

export interface DamageResult {
  currentHp: number;
  tempHp: number;
  absorbedByTemp: number;
  hpLost: number;
}

/**
 * Aplica dano seguindo D&D 5e: PV temporários absorvem primeiro o dano;
 * o restante reduz os PV normais até o mínimo de 0.
 */
export function applyDamage(
  currentHp: number,
  maxHp: number,
  tempHp: number,
  rawDamage: number,
): DamageResult {
  const damage = Math.max(0, Math.trunc(rawDamage));
  const safeCurrent = Math.max(0, Math.min(Math.max(1, maxHp), Math.trunc(currentHp)));
  const safeTemp = Math.max(0, Math.trunc(tempHp));

  if (damage === 0) {
    return {
      currentHp: safeCurrent,
      tempHp: safeTemp,
      absorbedByTemp: 0,
      hpLost: 0,
    };
  }

  const absorbedByTemp = Math.min(safeTemp, damage);
  const remainingDamage = damage - absorbedByTemp;
  const nextTempHp = safeTemp - absorbedByTemp;
  const nextCurrentHp = Math.max(0, safeCurrent - remainingDamage);
  const hpLost = safeCurrent - nextCurrentHp;

  return {
    currentHp: nextCurrentHp,
    tempHp: nextTempHp,
    absorbedByTemp,
    hpLost,
  };
}

export function applyHealing(
  currentHp: number,
  maxHp: number,
  rawHeal: number,
): { currentHp: number; healed: number } {
  const heal = Math.max(0, Math.trunc(rawHeal));
  const safeMax = Math.max(1, Math.trunc(maxHp));
  const safeCurrent = Math.max(0, Math.min(safeMax, Math.trunc(currentHp)));
  const nextCurrent = Math.min(safeMax, safeCurrent + heal);
  return {
    currentHp: nextCurrent,
    healed: nextCurrent - safeCurrent,
  };
}

export function applyTempHp(
  currentTempHp: number,
  incomingTempHp: number,
  mode: TempHpRuleMode = "dnd5e-max",
): number {
  const incoming = Math.max(0, Math.trunc(incomingTempHp));
  const current = Math.max(0, Math.trunc(currentTempHp));
  if (mode === "replace") return incoming;
  // Regra oficial D&D 5e: PV temporários não se somam; escolhe-se o maior valor.
  return Math.max(current, incoming);
}

export type HpCommandParseResult =
  | { type: "damage"; amount: number }
  | { type: "heal"; amount: number }
  | { type: "set"; value: number }
  | { type: "invalid" };

/**
 * Interpreta comandos matemáticos rápidos de PV:
 * "-8" -> dano 8
 * "+5" -> cura 5
 * "15" -> definir PV atuais = 15
 */
export function parseHpCommand(input: string): HpCommandParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { type: "invalid" };
  if (/^-\d+$/.test(trimmed)) {
    return { type: "damage", amount: parseInt(trimmed.slice(1), 10) };
  }
  if (/^\+\d+$/.test(trimmed)) {
    return { type: "heal", amount: parseInt(trimmed.slice(1), 10) };
  }
  if (/^\d+$/.test(trimmed)) {
    return { type: "set", value: parseInt(trimmed, 10) };
  }
  return { type: "invalid" };
}

export function executeHpCommand(
  currentHp: number,
  maxHp: number,
  tempHp: number,
  command: string,
): { currentHp: number; tempHp: number; valid: boolean; summary: string } {
  const parsed = parseHpCommand(command);
  if (parsed.type === "invalid") {
    return { currentHp, tempHp, valid: false, summary: "Comando inválido" };
  }
  if (parsed.type === "damage") {
    const res = applyDamage(currentHp, maxHp, tempHp, parsed.amount);
    return {
      currentHp: res.currentHp,
      tempHp: res.tempHp,
      valid: true,
      summary: `-${parsed.amount} PV (${res.currentHp}/${maxHp})`,
    };
  }
  if (parsed.type === "heal") {
    const res = applyHealing(currentHp, maxHp, parsed.amount);
    return {
      currentHp: res.currentHp,
      tempHp,
      valid: true,
      summary: `+${parsed.amount} PV (${res.currentHp}/${maxHp})`,
    };
  }
  const clamped = Math.max(0, Math.min(Math.max(1, maxHp), parsed.value));
  return {
    currentHp: clamped,
    tempHp,
    valid: true,
    summary: `PV definido para ${clamped}/${maxHp}`,
  };
}

export interface DiceRollTerm {
  count: number;
  sides: number;
  sign: 1 | -1;
  rolls: number[];
  keptRolls: number[];
  subtotal: number;
}

export interface DiceRollResult {
  expression: string;
  mode: "normal" | "advantage" | "disadvantage";
  terms: DiceRollTerm[];
  flatBonus: number;
  total: number;
  isCritical?: boolean;
  isFumble?: boolean;
  breakdown: string;
}

/**
 * Parser e rolador seguro de expressões de dados (sem eval).
 * Suporta expressões como "1d20+5", "2d6+1d4+3", "4d8 - 1", "d20", "8d6".
 */
export function rollDiceExpression(
  expression: string,
  options?: {
    mode?: "normal" | "advantage" | "disadvantage";
    rng?: () => number;
  },
): DiceRollResult {
  const mode = options?.mode ?? "normal";
  const rng = options?.rng ?? Math.random;
  const clean = expression.replace(/\s+/g, "").toLowerCase();

  if (!clean || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(clean)) {
    throw new Error(`Expressão de dados inválida: "${expression}"`);
  }

  const tokenMatches = clean.match(/[+-]?(\d*d\d+|\d+)/g);
  if (!tokenMatches) {
    throw new Error(`Expressão de dados inválida: "${expression}"`);
  }

  const terms: DiceRollTerm[] = [];
  let flatBonus = 0;
  let total = 0;
  const breakdownParts: string[] = [];
  let isCritical: boolean | undefined;
  let isFumble: boolean | undefined;

  const rollDie = (sides: number) => Math.floor(rng() * sides) + 1;

  tokenMatches.forEach((rawToken, index) => {
    const sign: 1 | -1 = rawToken.startsWith("-") ? -1 : 1;
    const body = rawToken.replace(/^[+-]/, "");

    if (body.includes("d")) {
      const [countStr, sidesStr] = body.split("d");
      const count = Math.min(100, Math.max(1, countStr ? parseInt(countStr, 10) : 1));
      const sides = Math.min(1000, Math.max(2, parseInt(sidesStr, 10)));

      let rolls: number[] = [];
      let keptRolls: number[] = [];

      // Vantagem/Desvantagem se aplicam ao d20 principal
      if (count === 1 && sides === 20 && mode !== "normal" && index === 0) {
        const r1 = rollDie(20);
        const r2 = rollDie(20);
        rolls = [r1, r2];
        const chosen = mode === "advantage" ? Math.max(r1, r2) : Math.min(r1, r2);
        keptRolls = [chosen];
        if (chosen === 20) isCritical = true;
        if (chosen === 1) isFumble = true;
      } else {
        for (let i = 0; i < count; i++) {
          rolls.push(rollDie(sides));
        }
        keptRolls = [...rolls];
        if (count === 1 && sides === 20 && index === 0) {
          if (keptRolls[0] === 20) isCritical = true;
          if (keptRolls[0] === 1) isFumble = true;
        }
      }

      const subtotal = keptRolls.reduce((acc, v) => acc + v, 0) * sign;
      total += subtotal;
      terms.push({ count, sides, sign, rolls, keptRolls, subtotal });

      const prefix = sign === -1 ? "- " : index > 0 ? "+ " : "";
      if (rolls.length !== keptRolls.length) {
        breakdownParts.push(
          `${prefix}[${rolls.join(", ")} -> ${keptRolls[0]}]`,
        );
      } else {
        breakdownParts.push(`${prefix}[${keptRolls.join("+")}]`);
      }
    } else {
      const val = parseInt(body, 10) * sign;
      flatBonus += val;
      total += val;
      breakdownParts.push(val >= 0 ? `+ ${val}` : `- ${Math.abs(val)}`);
    }
  });

  return {
    expression: clean,
    mode,
    terms,
    flatBonus,
    total,
    isCritical,
    isFumble,
    breakdown: breakdownParts.join(" ").replace(/^\+\s*/, ""),
  };
}
