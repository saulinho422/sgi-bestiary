import type { CreatureSheet } from "@/domain/entities/sheet";
import type {
  CombatEncounter,
  CombatParticipant,
  InitiativeState,
  TokenInstance,
} from "@/domain/entities/tokenInstance";
import { tickConditionsOnTurnAdvance } from "@/domain/rules/conditionsCatalog";
import { getAbilityModifier } from "@/domain/rules/dnd5eRules";

export function createCombatEncounter(params: {
  sceneId: string;
  name?: string;
  id?: string;
}): CombatEncounter {
  const now = new Date().toISOString();
  return {
    id: params.id ?? `enc-${crypto.randomUUID()}`,
    name: params.name?.trim() || "Encontro Atual",
    sceneId: params.sceneId || "default",
    active: false,
    round: 1,
    activeParticipantItemId: null,
    participants: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function getParticipantDisplayName(
  itemId: string,
  instancesByItemId: Map<string, TokenInstance>,
  sheetsById: Map<string, CreatureSheet>,
): string {
  const inst = instancesByItemId.get(itemId);
  if (!inst) return itemId;
  const sheet = sheetsById.get(inst.templateId);
  return inst.individualName || sheet?.name || "Criatura";
}

export function sortEncounterParticipants(
  participants: CombatParticipant[],
  instancesByItemId: Map<string, TokenInstance>,
  sheetsById: Map<string, CreatureSheet>,
): CombatParticipant[] {
  return [...participants].sort((a, b) => {
    const aHas = typeof a.initiative === "number" && Number.isFinite(a.initiative);
    const bHas = typeof b.initiative === "number" && Number.isFinite(b.initiative);

    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;

    if (aHas && bHas) {
      const initDiff = (b.initiative as number) - (a.initiative as number);
      if (initDiff !== 0) return initDiff;

      const adjDiff =
        (b.manualOrderAdjustment ?? 0) - (a.manualOrderAdjustment ?? 0);
      if (adjDiff !== 0) return adjDiff;

      const dexDiff = b.dexTiebreaker - a.dexTiebreaker;
      if (dexDiff !== 0) return dexDiff;
    }

    const nameA = getParticipantDisplayName(a.itemId, instancesByItemId, sheetsById);
    const nameB = getParticipantDisplayName(b.itemId, instancesByItemId, sheetsById);
    const nameCmp = nameA.localeCompare(nameB, "pt-BR");
    if (nameCmp !== 0) return nameCmp;

    return a.addedAt.localeCompare(b.addedAt);
  });
}

export function addParticipantsToEncounter(
  encounter: CombatEncounter,
  itemIds: string[],
  instancesByItemId: Map<string, TokenInstance>,
  sheetsById: Map<string, CreatureSheet>,
): { encounter: CombatEncounter; addedCount: number } {
  const existingIds = new Set(encounter.participants.map((p) => p.itemId));
  const now = new Date().toISOString();
  const additions: CombatParticipant[] = [];

  for (const itemId of itemIds) {
    if (existingIds.has(itemId)) continue;
    const inst = instancesByItemId.get(itemId);
    if (!inst) continue;
    const sheet = sheetsById.get(inst.templateId);
    const dexTiebreaker = sheet ? getAbilityModifier(sheet.abilities.dex) : 0;
    existingIds.add(itemId);
    additions.push({
      itemId,
      initiative: null,
      dexTiebreaker,
      manualOrderAdjustment: 0,
      addedAt: now,
    });
  }

  if (additions.length === 0) {
    return { encounter, addedCount: 0 };
  }

  return {
    encounter: {
      ...encounter,
      participants: [...encounter.participants, ...additions],
      updatedAt: now,
    },
    addedCount: additions.length,
  };
}

export function removeParticipantsFromEncounter(
  encounter: CombatEncounter,
  itemIds: string[],
  instancesByItemId: Map<string, TokenInstance>,
  sheetsById: Map<string, CreatureSheet>,
): { encounter: CombatEncounter; removedCount: number } {
  if (itemIds.length === 0) return { encounter, removedCount: 0 };
  const removeSet = new Set(itemIds);
  const currentSorted = sortEncounterParticipants(
    encounter.participants,
    instancesByItemId,
    sheetsById,
  );
  const surviving = currentSorted.filter((p) => !removeSet.has(p.itemId));
  const removedCount = encounter.participants.length - surviving.length;
  if (removedCount === 0) return { encounter, removedCount: 0 };

  let nextActiveId = encounter.activeParticipantItemId;
  let nextActive = encounter.active;

  if (surviving.length === 0) {
    nextActiveId = null;
    nextActive = false;
  } else if (nextActiveId && removeSet.has(nextActiveId)) {
    const oldIdx = currentSorted.findIndex((p) => p.itemId === nextActiveId);
    let candidate: CombatParticipant | undefined;
    for (let offset = 1; offset <= currentSorted.length; offset++) {
      const check = currentSorted[(oldIdx + offset) % currentSorted.length];
      if (!removeSet.has(check.itemId)) {
        candidate = check;
        break;
      }
    }
    nextActiveId = candidate?.itemId ?? surviving[0].itemId;
  } else if (
    nextActiveId &&
    !surviving.some((p) => p.itemId === nextActiveId)
  ) {
    nextActiveId = surviving[0].itemId;
  }

  return {
    encounter: {
      ...encounter,
      active: nextActive,
      activeParticipantItemId: nextActive ? nextActiveId : nextActiveId && surviving.some((p) => p.itemId === nextActiveId) ? nextActiveId : null,
      participants: surviving,
      updatedAt: new Date().toISOString(),
    },
    removedCount,
  };
}

export function setParticipantInitiative(
  encounter: CombatEncounter,
  itemId: string,
  value: number | null,
): CombatEncounter {
  const normalized =
    value === null || !Number.isFinite(value) ? null : Math.trunc(value);

  return {
    ...encounter,
    participants: encounter.participants.map((p) =>
      p.itemId === itemId
        ? { ...p, initiative: normalized, manualOrderAdjustment: 0 }
        : p,
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function adjustParticipantTieOrder(
  encounter: CombatEncounter,
  itemId: string,
  direction: "up" | "down",
  instancesByItemId: Map<string, TokenInstance>,
  sheetsById: Map<string, CreatureSheet>,
): CombatEncounter {
  const ordered = sortEncounterParticipants(
    encounter.participants,
    instancesByItemId,
    sheetsById,
  );
  const idx = ordered.findIndex((p) => p.itemId === itemId);
  if (idx < 0) return encounter;

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= ordered.length) return encounter;

  const current = ordered[idx];
  const neighbor = ordered[swapIdx];
  if (current.initiative === null || current.initiative !== neighbor.initiative) {
    return encounter;
  }

  const curAdj = current.manualOrderAdjustment ?? 0;
  const nbrAdj = neighbor.manualOrderAdjustment ?? 0;
  const nextCurAdj = direction === "up" ? Math.max(curAdj + 1, nbrAdj + 1) : Math.min(curAdj - 1, nbrAdj - 1);

  return {
    ...encounter,
    participants: encounter.participants.map((p) =>
      p.itemId === itemId ? { ...p, manualOrderAdjustment: nextCurAdj } : p,
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function rollEncounterInitiatives(
  encounter: CombatEncounter,
  instancesByItemId: Map<string, TokenInstance>,
  sheetsById: Map<string, CreatureSheet>,
  options?: {
    rerollExisting?: boolean;
    onlyItemIds?: string[];
    d20Fn?: () => number;
  },
): {
  encounter: CombatEncounter;
  rolledItemIds: string[];
  skippedCharacterIds: string[];
} {
  const onlySet = options?.onlyItemIds ? new Set(options.onlyItemIds) : null;
  const rerollExisting = options?.rerollExisting ?? false;
  const rollD20 =
    options?.d20Fn ?? (() => Math.floor(Math.random() * 20) + 1);

  const rolledItemIds: string[] = [];
  const skippedCharacterIds: string[] = [];

  const nextParticipants = encounter.participants.map((p) => {
    if (onlySet && !onlySet.has(p.itemId)) return p;

    const inst = instancesByItemId.get(p.itemId);
    const sheet = inst ? sheetsById.get(inst.templateId) : undefined;
    const realCategory = sheet?.kind ?? inst?.category ?? "monster";

    // Critério 2: Personagens de jogadores (kind: "character") nunca recebem rolagem automática
    if (realCategory === "character") {
      skippedCharacterIds.push(p.itemId);
      return p;
    }

    // Não sobrescreve iniciativas já definidas, salvo se solicitado explicitamente ou rolagem individual
    if (!rerollExisting && !onlySet && typeof p.initiative === "number") {
      return p;
    }

    const dexMod = sheet ? getAbilityModifier(sheet.abilities.dex) : p.dexTiebreaker;
    const bonus = sheet?.initiativeBonus ?? 0;
    const total = rollD20() + dexMod + bonus;
    rolledItemIds.push(p.itemId);

    return {
      ...p,
      initiative: total,
      dexTiebreaker: dexMod,
      manualOrderAdjustment: 0,
    };
  });

  if (rolledItemIds.length === 0) {
    return { encounter, rolledItemIds, skippedCharacterIds };
  }

  return {
    encounter: {
      ...encounter,
      participants: nextParticipants,
      updatedAt: new Date().toISOString(),
    },
    rolledItemIds,
    skippedCharacterIds,
  };
}

export function startEncounterCombat(
  encounter: CombatEncounter,
  instancesByItemId: Map<string, TokenInstance>,
  sheetsById: Map<string, CreatureSheet>,
): CombatEncounter {
  const ordered = sortEncounterParticipants(
    encounter.participants,
    instancesByItemId,
    sheetsById,
  );
  if (ordered.length === 0) {
    return {
      ...encounter,
      active: false,
      activeParticipantItemId: null,
      updatedAt: new Date().toISOString(),
    };
  }

  const validExisting =
    encounter.activeParticipantItemId &&
    ordered.some((p) => p.itemId === encounter.activeParticipantItemId)
      ? encounter.activeParticipantItemId
      : ordered[0].itemId;

  return {
    ...encounter,
    active: true,
    round: Math.max(1, encounter.round || 1),
    activeParticipantItemId: validExisting,
    updatedAt: new Date().toISOString(),
  };
}

export function advanceEncounterTurn(
  encounter: CombatEncounter,
  instances: TokenInstance[],
  sheetsById: Map<string, CreatureSheet>,
): {
  encounter: CombatEncounter;
  changedInstances: TokenInstance[];
} {
  const instancesByItemId = new Map(instances.map((i) => [i.boundItemId, i]));
  const ordered = sortEncounterParticipants(
    encounter.participants,
    instancesByItemId,
    sheetsById,
  );

  if (ordered.length === 0) {
    return {
      encounter: {
        ...encounter,
        active: false,
        activeParticipantItemId: null,
        updatedAt: new Date().toISOString(),
      },
      changedInstances: [],
    };
  }

  // Se ainda não iniciou, inicia no primeiro participante da ordem
  if (!encounter.active || !encounter.activeParticipantItemId) {
    const started = startEncounterCombat(encounter, instancesByItemId, sheetsById);
    const firstInst = instancesByItemId.get(started.activeParticipantItemId ?? "");
    const changedInstances: TokenInstance[] = [];
    if (firstInst) {
      const startRes = tickConditionsOnTurnAdvance(
        firstInst.conditions,
        "start-of-turn",
      );
      if (startRes.expired.length > 0) {
        changedInstances.push({ ...firstInst, conditions: startRes.next });
      }
    }
    return { encounter: started, changedInstances };
  }

  const currentIdx = ordered.findIndex(
    (p) => p.itemId === encounter.activeParticipantItemId,
  );
  const safeCurrentIdx = currentIdx >= 0 ? currentIdx : 0;
  const currentEntry = ordered[safeCurrentIdx];
  const nextIndex = (safeCurrentIdx + 1) % ordered.length;
  const isNewRound = nextIndex === 0;
  const nextRound = isNewRound ? encounter.round + 1 : encounter.round;
  const nextEntry = ordered[nextIndex];

  const participantIdSet = new Set(ordered.map((p) => p.itemId));
  const changedInstances: TokenInstance[] = [];

  for (const inst of instances) {
    if (!participantIdSet.has(inst.boundItemId)) continue;
    let current = inst;
    let changed = false;

    if (currentEntry && inst.boundItemId === currentEntry.itemId) {
      const res = tickConditionsOnTurnAdvance(current.conditions, "end-of-turn");
      if (res.expired.length > 0) {
        current = { ...current, conditions: res.next };
        changed = true;
      }
    }

    if (nextEntry && inst.boundItemId === nextEntry.itemId) {
      const res = tickConditionsOnTurnAdvance(current.conditions, "start-of-turn");
      if (res.expired.length > 0) {
        current = { ...current, conditions: res.next };
        changed = true;
      }
    }

    if (isNewRound) {
      const res = tickConditionsOnTurnAdvance(current.conditions, "round");
      if (res.expired.length > 0 || res.next !== current.conditions) {
        current = { ...current, conditions: res.next };
        changed = true;
      }
    }

    if (changed) changedInstances.push(current);
  }

  return {
    encounter: {
      ...encounter,
      active: true,
      round: nextRound,
      activeParticipantItemId: nextEntry.itemId,
      updatedAt: new Date().toISOString(),
    },
    changedInstances,
  };
}

export function resetEncounterInitiatives(
  encounter: CombatEncounter,
): CombatEncounter {
  return {
    ...encounter,
    active: false,
    round: 1,
    activeParticipantItemId: null,
    participants: encounter.participants.map((p) => ({
      ...p,
      initiative: null,
      manualOrderAdjustment: 0,
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function reconcileEncounterWithValidItems(
  encounter: CombatEncounter,
  validItemIds: Set<string>,
  instancesByItemId: Map<string, TokenInstance>,
  sheetsById: Map<string, CreatureSheet>,
): { encounter: CombatEncounter; changed: boolean } {
  const orphanIds = encounter.participants
    .map((p) => p.itemId)
    .filter((id) => !validItemIds.has(id));
  if (orphanIds.length === 0) {
    return { encounter, changed: false };
  }
  const { encounter: cleaned } = removeParticipantsFromEncounter(
    encounter,
    orphanIds,
    instancesByItemId,
    sheetsById,
  );
  return { encounter: cleaned, changed: true };
}

export function buildInitiativeStateFromEncounter(
  encounter: CombatEncounter | null | undefined,
  instancesByItemId: Map<string, TokenInstance>,
  sheetsById: Map<string, CreatureSheet>,
): InitiativeState {
  if (!encounter) {
    return { active: false, round: 1, turnIndex: 0, order: [] };
  }
  const ordered = sortEncounterParticipants(
    encounter.participants,
    instancesByItemId,
    sheetsById,
  );
  const turnIdx = encounter.activeParticipantItemId
    ? Math.max(
        0,
        ordered.findIndex((p) => p.itemId === encounter.activeParticipantItemId),
      )
    : 0;
  return {
    active: encounter.active && ordered.length > 0,
    round: encounter.round,
    turnIndex: turnIdx,
    order: ordered
      .filter((p) => typeof p.initiative === "number")
      .map((p) => ({
        itemId: p.itemId,
        initiative: p.initiative as number,
        dexTiebreaker: p.dexTiebreaker,
      })),
  };
}
