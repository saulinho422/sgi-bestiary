import type { ActiveCondition, ConditionDurationUnit } from "../entities/tokenInstance";
import type { Dnd5eRuleset } from "../types/rpgSystem";

export interface ConditionDefinition {
  id: string;
  name: string;
  code: string;
  icon: string;
  color: string;
  description2014: string;
  description2024: string;
}

export const DND5E_CONDITIONS: ConditionDefinition[] = [
  {
    id: "blinded",
    name: "Cego",
    code: "CEG",
    icon: "eye-off",
    color: "#64748b",
    description2014:
      "Não enxerga e falha em testes que exigem visão. Ataques contra têm vantagem; seus ataques têm desvantagem.",
    description2024:
      "Não enxerga e falha em testes que exigem visão. Ataques contra têm Vantagem; seus ataques têm Desvantagem.",
  },
  {
    id: "charmed",
    name: "Enfeitiçado",
    code: "ENF",
    icon: "heart",
    color: "#ec4899",
    description2014:
      "Não pode atacar o encantador nem alvejá-lo com habilidades nocivas. O encantador tem vantagem em testes sociais.",
    description2024:
      "Não pode atacar o encantador ou alvejá-lo com efeitos prejudiciais. O encantador tem Vantagem em testes sociais contra você.",
  },
  {
    id: "deafened",
    name: "Surdo",
    code: "SUR",
    icon: "ear-off",
    color: "#78716c",
    description2014:
      "Não ouve e falha automaticamente em qualquer teste de atributo que exija audição.",
    description2024:
      "Não ouve e falha automaticamente em testes de atributo que dependem da audição.",
  },
  {
    id: "frightened",
    name: "Amedrontado",
    code: "AME",
    icon: "ghost",
    color: "#a855f7",
    description2014:
      "Desvantagem em testes e ataques enquanto a fonte do medo estiver à vista. Não pode aproximar-se voluntariamente dela.",
    description2024:
      "Desvantagem em testes de atributo e jogadas de ataque enquanto a fonte estiver em linha de visão. Não pode se aproximar voluntariamente.",
  },
  {
    id: "grappled",
    name: "Agarrado",
    code: "AGA",
    icon: "hand",
    color: "#f97316",
    description2014:
      "Deslocamento torna-se 0 e não recebe bônus de deslocamento.",
    description2024:
      "Deslocamento é 0; Desvantagem em ataques contra outros alvos além de quem o agarra; pode ser movido pelo agarrador.",
  },
  {
    id: "incapacitated",
    name: "Incapacitado",
    code: "INC",
    icon: "ban",
    color: "#f59e0b",
    description2014: "Não pode realizar ações ou reações.",
    description2024:
      "Inativo (sem ações, ações bônus ou reações), perde Concentração, não fala e tem Desvantagem em Iniciativa.",
  },
  {
    id: "invisible",
    name: "Invisível",
    code: "INV",
    icon: "sparkles",
    color: "#38bdf8",
    description2014:
      "Impossível de ver sem magia ou sentido especial. Seus ataques têm vantagem; ataques contra têm desvantagem.",
    description2024:
      "Oculto, sem poder ser visto sem sentidos especiais; Vantagem em Iniciativa e ataques; ataques contra sofrem Desvantagem se não puderem vê-lo.",
  },
  {
    id: "paralyzed",
    name: "Paralisado",
    code: "PAR",
    icon: "zap-off",
    color: "#eab308",
    description2014:
      "Incapacitado, não se move nem fala. Falha em TR de FOR/DES. Ataques têm vantagem e acertos a 1,5 m são críticos.",
    description2024:
      "Incapacitado, deslocamento 0, falha automática em TR de FOR/DES. Ataques contra têm Vantagem; ataques a 1,5 m causam Crítico.",
  },
  {
    id: "petrified",
    name: "Petrificado",
    code: "PET",
    icon: "shield-alert",
    color: "#94a3b8",
    description2014:
      "Transformado em pedra, peso ×10, incapacitado, resistência a todo dano e imune a veneno e doença.",
    description2024:
      "Transformado em substância inanimada, Incapacitado, falha TR FOR/DES, resistência a todo dano e imunidade a Envenenado.",
  },
  {
    id: "poisoned",
    name: "Envenenado",
    code: "ENV",
    icon: "skull",
    color: "#22c55e",
    description2014:
      "Desvantagem em jogadas de ataque e testes de atributo.",
    description2024:
      "Desvantagem em jogadas de ataque e testes de atributo.",
  },
  {
    id: "prone",
    name: "Caído",
    code: "CAI",
    icon: "arrow-down",
    color: "#d97706",
    description2014:
      "Só pode rastejar. Desvantagem nos ataques. Ataques a 1,5 m têm vantagem; ataques à distância têm desvantagem.",
    description2024:
      "Deslocamento restrito a rastejar; Desvantagem em ataques; ataques a 1,5 m contra têm Vantagem, à distância têm Desvantagem.",
  },
  {
    id: "restrained",
    name: "Impedido",
    code: "IMP",
    icon: "lock",
    color: "#ef4444",
    description2014:
      "Deslocamento 0. Ataques contra têm vantagem; seus ataques e TR de DES têm desvantagem.",
    description2024:
      "Deslocamento 0; ataques contra têm Vantagem; seus ataques e TR de DES têm Desvantagem.",
  },
  {
    id: "stunned",
    name: "Atordoado",
    code: "ATO",
    icon: "loader",
    color: "#fbbf24",
    description2014:
      "Incapacitado, não pode se mover, fala hesitante. Falha em TR de FOR/DES. Ataques contra têm vantagem.",
    description2024:
      "Incapacitado, falha automática em TR de FOR/DES; ataques contra têm Vantagem.",
  },
  {
    id: "unconscious",
    name: "Inconsciente",
    code: "ICO",
    icon: "moon",
    color: "#dc2626",
    description2014:
      "Incapacitado, cai no chão, larga o que segura. Falha TR FOR/DES. Ataques têm vantagem e acertos a 1,5 m são críticos.",
    description2024:
      "Incapacitado e Caído, deslocamento 0, larga itens, falha TR FOR/DES; ataques a 1,5 m são Críticos automáticos.",
  },
  {
    id: "exhaustion",
    name: "Exaustão",
    code: "EXA",
    icon: "battery-low",
    color: "#b91c1c",
    description2014:
      "Níveis 1–6 cumulativos (desvantagem em testes, metade do deslocamento, desvantagem em ataques/TR, metade PV máx, deslocamento 0, morte).",
    description2024:
      "Níveis 1–6: penalidade de -2 por nível em todos os Testes D20 e -1,5 m de deslocamento por nível. Morre no nível 6.",
  },
];

export function getConditionDefinition(conditionId: string): ConditionDefinition | undefined {
  return DND5E_CONDITIONS.find((c) => c.id === conditionId);
}

export function createConditionFromCatalog(
  conditionId: string,
  options?: {
    ruleset?: Dnd5eRuleset;
    duration?: number | null;
    durationUnit?: ConditionDurationUnit;
    source?: string;
    visibleToPlayers?: boolean;
    notes?: string;
  },
): ActiveCondition {
  const def = getConditionDefinition(conditionId);
  const ruleset = options?.ruleset ?? "dnd5e-2014";
  const durationUnit = options?.durationUnit ?? "indefinite";
  const duration = options?.duration ?? null;

  return {
    id: `${conditionId}-${crypto.randomUUID()}`,
    conditionId,
    name: def?.name ?? conditionId,
    code: def?.code ?? conditionId.slice(0, 3).toUpperCase(),
    icon: def?.icon ?? "alert-circle",
    color: def?.color ?? "#9ca3af",
    category: def ? "standard" : "custom",
    description: def
      ? ruleset === "dnd5e-2024"
        ? def.description2024
        : def.description2014
      : "Condição personalizada.",
    duration,
    durationUnit,
    remainingRounds: durationUnit === "rounds" ? duration : durationUnit === "until-next-turn" || durationUnit === "until-end-of-turn" ? 1 : null,
    source: options?.source,
    visibleToPlayers: options?.visibleToPlayers ?? true,
    notes: options?.notes,
    appliedAt: new Date().toISOString(),
  };
}

export function createCustomCondition(params: {
  name: string;
  code?: string;
  color?: string;
  description?: string;
  duration?: number | null;
  durationUnit?: ConditionDurationUnit;
  source?: string;
  visibleToPlayers?: boolean;
  notes?: string;
}): ActiveCondition {
  const trimmed = params.name.trim() || "Condição";
  const cleanCode = (params.code?.trim() || trimmed.slice(0, 3)).toUpperCase().slice(0, 4);
  const idSlug = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "custom";

  const durationUnit = params.durationUnit ?? "indefinite";
  const duration = params.duration ?? null;

  return {
    id: `custom-${idSlug}-${crypto.randomUUID()}`,
    conditionId: `custom:${idSlug}`,
    name: trimmed,
    code: cleanCode,
    icon: "tag",
    color: params.color ?? "#8b5cf6",
    category: "custom",
    description: params.description?.trim() || "Condição personalizada de sessão.",
    duration,
    durationUnit,
    remainingRounds: durationUnit === "rounds" ? duration : durationUnit === "until-next-turn" || durationUnit === "until-end-of-turn" ? 1 : null,
    source: params.source,
    visibleToPlayers: params.visibleToPlayers ?? true,
    notes: params.notes,
    appliedAt: new Date().toISOString(),
  };
}

/**
 * Avança uma rodada nas condições de uma instância, removendo somente
 * condições baseadas em rodadas ou turno que expiraram.
 */
export function tickConditionsOnTurnAdvance(
  conditions: ActiveCondition[],
  event: "round" | "start-of-turn" | "end-of-turn",
): { next: ActiveCondition[]; expired: ActiveCondition[] } {
  const next: ActiveCondition[] = [];
  const expired: ActiveCondition[] = [];

  for (const cond of conditions) {
    if (cond.durationUnit === "rounds" && event === "round") {
      const rem = (cond.remainingRounds ?? cond.duration ?? 1) - 1;
      if (rem <= 0) {
        expired.push(cond);
      } else {
        next.push({ ...cond, remainingRounds: rem });
      }
    } else if (cond.durationUnit === "until-next-turn" && event === "start-of-turn") {
      expired.push(cond);
    } else if (cond.durationUnit === "until-end-of-turn" && event === "end-of-turn") {
      expired.push(cond);
    } else {
      next.push(cond);
    }
  }

  return { next, expired };
}
