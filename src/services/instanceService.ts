import type { Image, Item } from "@owlbear-rodeo/sdk";
import type { TempHpRuleMode } from "@/domain/entities/settings";
import type { CreatureSheet, VisibilityPolicy } from "@/domain/entities/sheet";
import type {
  ActiveCondition,
  PublicTokenProjection,
  TokenInstance,
} from "@/domain/entities/tokenInstance";
import {
  applyDamage,
  applyHealing,
  applyTempHp,
  executeHpCommand,
} from "@/domain/rules/dnd5eRules";
import {
  getDefaultVisibilityForCategory,
  projectTokenForPlayers,
} from "@/domain/rules/visibilityProjection";
import { PublicTokenProjectionSchema } from "@/domain/schemas/instanceSchema";
import { METADATA_KEYS } from "@/utils/pluginId";

export function computeImageSignature(image: Image): string {
  const cleanUrl = image.image.url.split("?")[0];
  return `${cleanUrl}|${image.image.width}x${image.image.height}`;
}

export function readPublicProjectionFromItem(
  item: Item,
): PublicTokenProjection | null {
  const raw = item.metadata?.[METADATA_KEYS.TOKEN];
  if (!raw || typeof raw !== "object") return null;
  const parsed = PublicTokenProjectionSchema.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data;
  if (data.fullSheetSnapshot) {
    data.fullSheetSnapshot = {
      ...data.fullSheetSnapshot,
      visibility: {
        ...getDefaultVisibilityForCategory(data.fullSheetSnapshot.kind),
        ...(data.fullSheetSnapshot.visibility ?? {}),
      },
      notes: {
        public: data.fullSheetSnapshot.notes.public,
        gm: "",
      },
    };
  }
  return data as PublicTokenProjection;
}

export function createTokenInstanceFromSheet(params: {
  sheet: CreatureSheet;
  boundItemId: string;
  sceneId: string;
  individualName?: string;
  initialInitiative?: number | null;
}): TokenInstance {
  const { sheet, boundItemId, sceneId, individualName, initialInitiative } = params;
  const maxHp = Math.max(1, sheet.hitPoints.maximum);
  const currentHp =
    sheet.kind === "character" && typeof sheet.hitPoints.current === "number"
      ? Math.max(0, Math.min(maxHp, sheet.hitPoints.current))
      : maxHp;
  const tempHp =
    sheet.kind === "character" && typeof sheet.hitPoints.temporary === "number"
      ? Math.max(0, sheet.hitPoints.temporary)
      : 0;

  return {
    instanceId: crypto.randomUUID(),
    boundItemId,
    sceneId: sceneId || "default",
    templateId: sheet.id,
    templateUpdatedAt: sheet.updatedAt,
    category: sheet.kind,
    individualName: individualName?.trim() || undefined,
    currentHp,
    maxHp,
    tempHp,
    armorClass: sheet.armorClass.value,
    initiative: initialInitiative ?? null,
    concentratingOn: null,
    conditions: [],
    consumedResources: {},
    deathSaves: { successes: 0, failures: 0 },
    visibility: {
      ...getDefaultVisibilityForCategory(sheet.kind),
      ...sheet.visibility,
    },
    history: [
      {
        timestamp: new Date().toISOString(),
        action: "bind",
        summary: `Vinculado à ficha ${sheet.name}`,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Clona um TokenInstance quando o usuário duplica um token nativamente no Owlbear Rodeo.
 * Garante um novo `instanceId` e `boundItemId = newItemId` para evitar colisões.
 */
export function cloneInstanceForDuplicateToken(params: {
  sourceInstance: TokenInstance;
  newBoundItemId: string;
  newName?: string;
  resetHp?: boolean;
}): TokenInstance {
  const { sourceInstance, newBoundItemId, newName, resetHp } = params;
  const now = new Date().toISOString();
  return {
    ...structuredClone(sourceInstance),
    instanceId: crypto.randomUUID(),
    boundItemId: newBoundItemId,
    individualName: newName ?? sourceInstance.individualName,
    currentHp: resetHp ? sourceInstance.maxHp : sourceInstance.currentHp,
    tempHp: resetHp ? 0 : sourceInstance.tempHp,
    history: [
      {
        timestamp: now,
        action: "bind",
        summary: "Instância separada criada por duplicação de token",
      },
    ],
    updatedAt: now,
  };
}

export function applySheetUpdateToInstance(
  instance: TokenInstance,
  updatedSheet: CreatureSheet,
  mode: "existing-preserve-damage" | "existing-reset-hp",
): TokenInstance {
  const nextMaxHp = Math.max(1, updatedSheet.hitPoints.maximum);
  const nextCurrentHp =
    mode === "existing-reset-hp"
      ? nextMaxHp
      : Math.min(instance.currentHp, nextMaxHp);

  return {
    ...instance,
    templateUpdatedAt: updatedSheet.updatedAt,
    category: updatedSheet.kind,
    maxHp: nextMaxHp,
    currentHp: nextCurrentHp,
    tempHp: mode === "existing-reset-hp" ? 0 : instance.tempHp,
    armorClass: updatedSheet.armorClass.value,
    visibility: { ...updatedSheet.visibility },
    history: [
      ...instance.history.slice(-19),
      {
        timestamp: new Date().toISOString(),
        action: "sync",
        summary:
          mode === "existing-reset-hp"
            ? "Sincronizado com ficha-base (PV restaurados)"
            : "Sincronizado com ficha-base (PV atuais preservados)",
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export type InstanceHpMutation =
  | { type: "damage"; amount: number }
  | { type: "heal"; amount: number }
  | { type: "set-hp"; value: number }
  | { type: "set-max-hp"; value: number }
  | { type: "temp-hp"; amount: number; mode?: TempHpRuleMode }
  | { type: "set-ac"; value: number }
  | { type: "command"; command: string }
  | { type: "restore" };

export function mutateInstanceStats(
  instance: TokenInstance,
  mutation: InstanceHpMutation,
  sheet?: CreatureSheet | null,
): TokenInstance {
  const now = new Date().toISOString();
  let next = { ...instance };
  let summary = "";

  switch (mutation.type) {
    case "damage": {
      const res = applyDamage(
        instance.currentHp,
        instance.maxHp,
        instance.tempHp,
        mutation.amount,
      );
      next.currentHp = res.currentHp;
      next.tempHp = res.tempHp;
      summary = `Dano -${mutation.amount} (${res.currentHp}/${instance.maxHp})`;
      break;
    }
    case "heal": {
      const res = applyHealing(instance.currentHp, instance.maxHp, mutation.amount);
      next.currentHp = res.currentHp;
      summary = `Cura +${mutation.amount} (${res.currentHp}/${instance.maxHp})`;
      break;
    }
    case "set-hp": {
      const clamped = Math.max(0, Math.min(instance.maxHp, Math.trunc(mutation.value)));
      next.currentHp = clamped;
      summary = `PV definidos para ${clamped}/${instance.maxHp}`;
      break;
    }
    case "set-max-hp": {
      const nextMax = Math.max(1, Math.trunc(mutation.value));
      next.maxHp = nextMax;
      next.currentHp = Math.min(instance.currentHp, nextMax);
      summary = `PV máx ajustados para ${nextMax}`;
      break;
    }
    case "temp-hp": {
      const nextTemp = applyTempHp(
        instance.tempHp,
        mutation.amount,
        mutation.mode ?? "dnd5e-max",
      );
      next.tempHp = nextTemp;
      summary = `PV temporários: ${nextTemp}`;
      break;
    }
    case "set-ac": {
      next.armorClass = Math.max(0, Math.trunc(mutation.value));
      summary = `CA ajustada para ${next.armorClass}`;
      break;
    }
    case "command": {
      const res = executeHpCommand(
        instance.currentHp,
        instance.maxHp,
        instance.tempHp,
        mutation.command,
      );
      if (!res.valid) return instance;
      next.currentHp = res.currentHp;
      next.tempHp = res.tempHp;
      summary = res.summary;
      break;
    }
    case "restore": {
      const baseMax = sheet ? Math.max(1, sheet.hitPoints.maximum) : instance.maxHp;
      next.maxHp = baseMax;
      next.currentHp = baseMax;
      next.tempHp = 0;
      next.consumedResources = {};
      next.deathSaves = { successes: 0, failures: 0 };
      summary = `Instância restaurada (${baseMax}/${baseMax})`;
      break;
    }
  }

  return {
    ...next,
    history: [
      ...instance.history.slice(-19),
      {
        timestamp: now,
        action:
          mutation.type === "set-hp" || mutation.type === "set-max-hp"
            ? "set-hp"
            : mutation.type === "temp-hp"
              ? "temp-hp"
              : mutation.type === "set-ac"
                ? "sync"
                : mutation.type === "command"
                  ? "set-hp"
                  : mutation.type,
        summary,
      },
    ],
    updatedAt: now,
  };
}

export function addConditionToInstance(
  instance: TokenInstance,
  condition: ActiveCondition,
): TokenInstance {
  return {
    ...instance,
    conditions: [...instance.conditions, condition],
    history: [
      ...instance.history.slice(-19),
      {
        timestamp: new Date().toISOString(),
        action: "condition",
        summary: `+Condição: ${condition.name}`,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function removeConditionFromInstance(
  instance: TokenInstance,
  conditionIdOrInstanceId: string,
): TokenInstance {
  const removed = instance.conditions.find(
    (c) =>
      c.id === conditionIdOrInstanceId ||
      c.conditionId === conditionIdOrInstanceId,
  );
  if (!removed) return instance;
  return {
    ...instance,
    conditions: instance.conditions.filter((c) => c.id !== removed.id),
    history: [
      ...instance.history.slice(-19),
      {
        timestamp: new Date().toISOString(),
        action: "condition",
        summary: `-Condição: ${removed.name}`,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function updateInstanceVisibility(
  instance: TokenInstance,
  patch: Partial<VisibilityPolicy>,
): TokenInstance {
  return {
    ...instance,
    visibility: {
      ...instance.visibility,
      ...patch,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function buildMetadataUpdatePayload(
  instance: TokenInstance,
  sheet?: CreatureSheet | null,
): PublicTokenProjection {
  return projectTokenForPlayers(instance, sheet);
}
