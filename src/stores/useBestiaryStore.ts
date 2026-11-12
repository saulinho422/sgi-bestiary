import { create } from "zustand";
import OBR, { type Image } from "@owlbear-rodeo/sdk";
import {
  DEFAULT_SETTINGS,
  type BestiarySettings,
} from "@/domain/entities/settings";
import type { CreatureSheet, VisibilityPolicy } from "@/domain/entities/sheet";
import type {
  ActiveCondition,
  InitiativeState,
  PublicTokenProjection,
  TokenInstance,
} from "@/domain/entities/tokenInstance";
import { tickConditionsOnTurnAdvance } from "@/domain/rules/conditionsCatalog";
import { getAbilityModifier } from "@/domain/rules/dnd5eRules";
import {
  addConditionToInstance,
  applySheetUpdateToInstance,
  mutateInstanceStats,
  readPublicProjectionFromItem,
  removeConditionFromInstance,
  updateInstanceVisibility,
  type InstanceHpMutation,
} from "@/services/instanceService";
import {
  ensureSeedLibraryLoaded,
  storageProvider,
  subscribeDbSync,
} from "@/integrations/storage/dexieRepository";
import { SEED_SHEETS } from "@/integrations/storage/seedData";
import {
  bindItemsToSheet,
  ensureSceneScopeId,
  isCharacterOrMountImage,
  spawnCreaturesOnScene,
  syncInstancesToObrItems,
  unbindItemsFromSheet,
} from "@/integrations/owlbear/obrBridge";
import {
  subscribeRollEvents,
  type RollLogEntry,
} from "@/integrations/dice/diceService";
import { BROADCAST_CHANNELS, METADATA_KEYS } from "@/utils/pluginId";

export interface UiToast {
  id: string;
  message: string;
  variant: "success" | "error" | "info" | "warning";
}

interface BestiaryStoreState {
  initialized: boolean;
  obrConnected: boolean;
  sceneReady: boolean;
  sceneId: string;
  role: "GM" | "PLAYER";
  sheets: CreatureSheet[];
  instances: TokenInstance[];
  publicProjectionsByItemId: Record<string, PublicTokenProjection>;
  sceneImages: Image[];
  selectedItemIds: string[];
  settings: BestiarySettings;
  initiative: InitiativeState;
  rollLog: RollLogEntry[];
  toast: UiToast | null;

  showToast: (message: string, variant?: UiToast["variant"]) => void;
  clearToast: () => void;
  initialize: () => Promise<() => void>;
  refreshLibrary: () => Promise<void>;
  refreshInstances: () => Promise<void>;
  saveSheet: (
    sheet: CreatureSheet,
    syncMode?: "future-only" | "existing-preserve-damage" | "existing-reset-hp",
  ) => Promise<void>;
  deleteSheet: (id: string) => Promise<void>;
  duplicateSheet: (id: string) => Promise<CreatureSheet | undefined>;
  toggleFavorite: (id: string) => Promise<void>;
  spawnCreatures: (sheet: CreatureSheet, count: number) => Promise<void>;
  bindTokens: (
    items: Image[],
    sheet: CreatureSheet,
    rememberMapping?: boolean,
  ) => Promise<void>;
  unbindTokens: (itemIds: string[]) => Promise<void>;
  applyHpMutation: (
    itemIds: string[],
    mutation: InstanceHpMutation,
  ) => Promise<void>;
  applyCondition: (
    itemIds: string[],
    condition: ActiveCondition,
  ) => Promise<void>;
  removeCondition: (
    itemIds: string[],
    conditionIdOrInstanceId: string,
  ) => Promise<void>;
  updateVisibility: (
    itemIds: string[],
    patch: Partial<VisibilityPolicy>,
  ) => Promise<void>;
  renameInstance: (itemId: string, name: string) => Promise<void>;
  setConcentrating: (itemId: string, spell: string | null) => Promise<void>;
  consumeResource: (itemId: string, featureId: string, delta: number) => Promise<void>;
  updateSettings: (next: BestiarySettings) => Promise<void>;
  setInstanceInitiative: (itemId: string, value: number | null) => Promise<void>;
  rollAllInitiatives: () => Promise<void>;
  nextTurn: () => Promise<void>;
  resetInitiative: () => Promise<void>;
}

const DEFAULT_INITIATIVE: InitiativeState = {
  active: false,
  round: 1,
  turnIndex: 0,
  order: [],
};

export const useBestiaryStore = create<BestiaryStoreState>((set, get) => ({
  initialized: false,
  obrConnected: false,
  sceneReady: false,
  sceneId: "local-sandbox",
  role: "GM",
  sheets: [],
  instances: [],
  publicProjectionsByItemId: {},
  sceneImages: [],
  selectedItemIds: [],
  settings: structuredClone(DEFAULT_SETTINGS),
  initiative: structuredClone(DEFAULT_INITIATIVE),
  rollLog: [],
  toast: null,

  showToast(message, variant = "info") {
    const id = crypto.randomUUID();
    set({ toast: { id, message, variant } });
    setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null });
      }
    }, 3400);
  },

  clearToast() {
    set({ toast: null });
  },

  async refreshLibrary() {
    const sheets = await storageProvider.library.listSheets();
    set({ sheets });
  },

  async refreshInstances() {
    const { sceneId, role } = get();
    if (role === "GM") {
      const instances =
        await storageProvider.instances.listInstancesByScene(sceneId);
      set({ instances });
    }
  },

  async initialize() {
    await ensureSeedLibraryLoaded(SEED_SHEETS);
    const [sheets, settings] = await Promise.all([
      storageProvider.library.listSheets(),
      storageProvider.settings.getSettings(),
    ]);

    const unsubRoll = subscribeRollEvents((entry) => {
      set((state) => ({
        rollLog: [entry, ...state.rollLog].slice(0, 40),
      }));
    });

    const unsubDb = subscribeDbSync((topic) => {
      if (topic === "sheets") void get().refreshLibrary();
      if (topic === "instances") void get().refreshInstances();
      if (topic === "settings") {
        void storageProvider.settings
          .getSettings()
          .then((s) => set({ settings: s }));
      }
    });

    if (!OBR.isAvailable) {
      const instances =
        await storageProvider.instances.listInstancesByScene("local-sandbox");
      set({
        initialized: true,
        obrConnected: false,
        sceneReady: true,
        sceneId: "local-sandbox",
        role: "GM",
        sheets,
        instances,
        settings,
      });
      return () => {
        unsubRoll();
        unsubDb();
      };
    }

    set({
      obrConnected: true,
      sheets,
      settings,
    });

    const cleanups: Array<() => void> = [unsubRoll, unsubDb];

    const attachSceneState = async () => {
      const sceneReady = await OBR.scene.isReady();
      if (!sceneReady) {
        set({ sceneReady: false, sceneImages: [], instances: [] });
        return;
      }

      const [role, sceneId, items, selection, sceneMeta] = await Promise.all([
        OBR.player.getRole(),
        ensureSceneScopeId(),
        OBR.scene.items.getItems(isCharacterOrMountImage),
        OBR.player.getSelection(),
        OBR.scene.getMetadata(),
      ]);

      const projMap: Record<string, PublicTokenProjection> = {};
      for (const item of items) {
        const proj = readPublicProjectionFromItem(item);
        if (proj) projMap[item.id] = proj;
      }

      const instances =
        role === "GM"
          ? await storageProvider.instances.listInstancesByScene(sceneId)
          : [];

      const initMeta = sceneMeta[METADATA_KEYS.INITIATIVE_STATE] as
        | InitiativeState
        | undefined;

      set({
        initialized: true,
        sceneReady: true,
        role,
        sceneId,
        sceneImages: items,
        publicProjectionsByItemId: projMap,
        instances,
        selectedItemIds: selection ?? [],
        initiative: initMeta ?? structuredClone(DEFAULT_INITIATIVE),
      });
    };

    const startObrListeners = async () => {
      await attachSceneState();

      cleanups.push(
        OBR.scene.onReadyChange(() => {
          void attachSceneState();
        }),
      );

      cleanups.push(
        OBR.scene.items.onChange((allItems) => {
          const images = allItems.filter(isCharacterOrMountImage);
          const projMap: Record<string, PublicTokenProjection> = {};
          for (const item of images) {
            const proj = readPublicProjectionFromItem(item);
            if (proj) projMap[item.id] = proj;
          }
          set({
            sceneImages: images,
            publicProjectionsByItemId: projMap,
          });
          if (get().role === "GM") {
            void get().refreshInstances();
          }
        }),
      );

      cleanups.push(
        OBR.player.onChange((player) => {
          const prevRole = get().role;
          set({
            role: player.role,
            selectedItemIds: player.selection ?? [],
          });
          if (prevRole !== player.role) {
            void attachSceneState();
          }
        }),
      );

      cleanups.push(
        OBR.scene.onMetadataChange((meta) => {
          const initMeta = meta[METADATA_KEYS.INITIATIVE_STATE] as
            | InitiativeState
            | undefined;
          if (initMeta) {
            set({ initiative: initMeta });
          }
        }),
      );
    };

    if (OBR.isReady) {
      await startObrListeners();
    } else {
      OBR.onReady(() => {
        void startObrListeners();
      });
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  },

  async saveSheet(sheet, syncMode = "future-only") {
    const saved: CreatureSheet = {
      ...sheet,
      updatedAt: new Date().toISOString(),
    };
    await storageProvider.library.saveSheet(saved);

    const { instances, sheets } = get();
    const nextSheets = sheets.some((s) => s.id === saved.id)
      ? sheets.map((s) => (s.id === saved.id ? saved : s))
      : [...sheets, saved];

    set({ sheets: nextSheets.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) });

    if (syncMode !== "future-only") {
      const matching = instances.filter((i) => i.templateId === saved.id);
      if (matching.length > 0) {
        const updatedInstances = matching.map((inst) =>
          applySheetUpdateToInstance(inst, saved, syncMode),
        );
        await storageProvider.instances.saveInstancesBulk(updatedInstances);
        const updatedMap = new Map(updatedInstances.map((i) => [i.boundItemId, i]));
        set({
          instances: instances.map((i) => updatedMap.get(i.boundItemId) ?? i),
        });
        await syncInstancesToObrItems(
          updatedInstances,
          new Map(nextSheets.map((s) => [s.id, s])),
        );
      }
    }

    get().showToast(`Ficha "${saved.name}" salva.`, "success");
  },

  async deleteSheet(id) {
    const target = get().sheets.find((s) => s.id === id);
    await storageProvider.library.deleteSheet(id);
    set((s) => ({ sheets: s.sheets.filter((sh) => sh.id !== id) }));
    if (target) {
      get().showToast(`Ficha "${target.name}" excluída.`, "info");
    }
  },

  async duplicateSheet(id) {
    const source = get().sheets.find((s) => s.id === id);
    if (!source) return undefined;
    const now = new Date().toISOString();
    const copy: CreatureSheet = {
      ...structuredClone(source),
      id: `${source.kind}-${crypto.randomUUID()}`,
      name: `${source.name} (Cópia)`,
      favorite: false,
      createdAt: now,
      updatedAt: now,
    };
    await storageProvider.library.saveSheet(copy);
    await get().refreshLibrary();
    get().showToast(`Cópia criada: "${copy.name}".`, "success");
    return copy;
  },

  async toggleFavorite(id) {
    const target = get().sheets.find((s) => s.id === id);
    if (!target) return;
    const next = { ...target, favorite: !target.favorite };
    await storageProvider.library.saveSheet(next);
    set((s) => ({
      sheets: s.sheets.map((sh) => (sh.id === id ? next : sh)),
    }));
  },

  async spawnCreatures(sheet, count) {
    const res = await spawnCreaturesOnScene({ sheet, count });
    await get().refreshInstances();
    get().showToast(
      count === 1
        ? `${sheet.name} invocado na cena.`
        : `${res.instances.length}× ${sheet.name} invocados na cena.`,
      "success",
    );
  },

  async bindTokens(items, sheet, rememberMapping = false) {
    await bindItemsToSheet({
      items,
      sheet,
      rememberImageMapping: rememberMapping,
    });
    await get().refreshInstances();
    get().showToast(
      items.length === 1
        ? `Token vinculado a "${sheet.name}".`
        : `${items.length} tokens vinculados a "${sheet.name}".`,
      "success",
    );
  },

  async unbindTokens(itemIds) {
    await unbindItemsFromSheet(itemIds);
    await get().refreshInstances();
    get().showToast(
      itemIds.length === 1
        ? "Vínculo removido do token."
        : `${itemIds.length} tokens desvinculados.`,
      "info",
    );
  },

  async applyHpMutation(itemIds, mutation) {
    const { role, instances, sheets, publicProjectionsByItemId } = get();
    if (itemIds.length === 0) return;

    if (role === "PLAYER") {
      if (!OBR.isAvailable) return;
      for (const itemId of itemIds) {
        const proj = publicProjectionsByItemId[itemId];
        if (!proj?.visibility.playerCanEdit) continue;
        await OBR.broadcast.sendMessage(
          BROADCAST_CHANNELS.PLAYER_EDIT,
          { type: "hp-mutation", itemId, mutation },
          { destination: "REMOTE" },
        );
      }
      get().showToast("Alteração enviada ao mestre.", "info");
      return;
    }

    const sheetsById = new Map(sheets.map((s) => [s.id, s]));
    const targetSet = new Set(itemIds);
    const updatedList: TokenInstance[] = [];

    const nextInstances = instances.map((inst) => {
      if (!targetSet.has(inst.boundItemId)) return inst;
      const sheet = sheetsById.get(inst.templateId);
      const updated = mutateInstanceStats(inst, mutation, sheet);
      updatedList.push(updated);
      return updated;
    });

    if (updatedList.length === 0) return;
    set({ instances: nextInstances });
    await storageProvider.instances.saveInstancesBulk(updatedList);
    await syncInstancesToObrItems(updatedList, sheetsById);
  },

  async applyCondition(itemIds, condition) {
    const { role, instances, sheets, publicProjectionsByItemId } = get();
    if (itemIds.length === 0) return;

    if (role === "PLAYER") {
      if (!OBR.isAvailable) return;
      for (const itemId of itemIds) {
        const proj = publicProjectionsByItemId[itemId];
        if (!proj?.visibility.playerCanEdit) continue;
        await OBR.broadcast.sendMessage(
          BROADCAST_CHANNELS.PLAYER_EDIT,
          { type: "add-condition", itemId, conditionId: condition.conditionId },
          { destination: "REMOTE" },
        );
      }
      return;
    }

    const sheetsById = new Map(sheets.map((s) => [s.id, s]));
    const targetSet = new Set(itemIds);
    const updatedList: TokenInstance[] = [];

    const nextInstances = instances.map((inst) => {
      if (!targetSet.has(inst.boundItemId)) return inst;
      // Cada instância recebe cópia independente da condição para evitar mutação compartilhada
      const updated = addConditionToInstance(inst, {
        ...structuredClone(condition),
        id: `${condition.conditionId}-${crypto.randomUUID()}`,
      });
      updatedList.push(updated);
      return updated;
    });

    if (updatedList.length === 0) return;
    set({ instances: nextInstances });
    await storageProvider.instances.saveInstancesBulk(updatedList);
    await syncInstancesToObrItems(updatedList, sheetsById);
  },

  async removeCondition(itemIds, conditionIdOrInstanceId) {
    const { role, instances, sheets, publicProjectionsByItemId } = get();
    if (itemIds.length === 0) return;

    if (role === "PLAYER") {
      if (!OBR.isAvailable) return;
      for (const itemId of itemIds) {
        const proj = publicProjectionsByItemId[itemId];
        if (!proj?.visibility.playerCanEdit) continue;
        await OBR.broadcast.sendMessage(
          BROADCAST_CHANNELS.PLAYER_EDIT,
          {
            type: "remove-condition",
            itemId,
            conditionId: conditionIdOrInstanceId,
          },
          { destination: "REMOTE" },
        );
      }
      return;
    }

    const sheetsById = new Map(sheets.map((s) => [s.id, s]));
    const targetSet = new Set(itemIds);
    const updatedList: TokenInstance[] = [];

    const nextInstances = instances.map((inst) => {
      if (!targetSet.has(inst.boundItemId)) return inst;
      const updated = removeConditionFromInstance(inst, conditionIdOrInstanceId);
      if (updated !== inst) updatedList.push(updated);
      return updated;
    });

    if (updatedList.length === 0) return;
    set({ instances: nextInstances });
    await storageProvider.instances.saveInstancesBulk(updatedList);
    await syncInstancesToObrItems(updatedList, sheetsById);
  },

  async updateVisibility(itemIds, patch) {
    if (get().role !== "GM") return;
    const { instances, sheets } = get();
    const sheetsById = new Map(sheets.map((s) => [s.id, s]));
    const targetSet = new Set(itemIds);
    const updatedList: TokenInstance[] = [];

    const nextInstances = instances.map((inst) => {
      if (!targetSet.has(inst.boundItemId)) return inst;
      const updated = updateInstanceVisibility(inst, patch);
      updatedList.push(updated);
      return updated;
    });

    if (updatedList.length === 0) return;
    set({ instances: nextInstances });
    await storageProvider.instances.saveInstancesBulk(updatedList);
    await syncInstancesToObrItems(updatedList, sheetsById);
  },

  async renameInstance(itemId, name) {
    if (get().role !== "GM") return;
    const { instances, sheets } = get();
    const sheetsById = new Map(sheets.map((s) => [s.id, s]));
    const target = instances.find((i) => i.boundItemId === itemId);
    if (!target) return;
    const updated: TokenInstance = {
      ...target,
      individualName: name.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    set({
      instances: instances.map((i) =>
        i.boundItemId === itemId ? updated : i,
      ),
    });
    await storageProvider.instances.saveInstance(updated);
    await syncInstancesToObrItems([updated], sheetsById);
  },

  async setConcentrating(itemId, spell) {
    if (get().role !== "GM") return;
    const { instances, sheets } = get();
    const sheetsById = new Map(sheets.map((s) => [s.id, s]));
    const target = instances.find((i) => i.boundItemId === itemId);
    if (!target) return;
    const updated: TokenInstance = {
      ...target,
      concentratingOn: spell,
      updatedAt: new Date().toISOString(),
    };
    set({
      instances: instances.map((i) =>
        i.boundItemId === itemId ? updated : i,
      ),
    });
    await storageProvider.instances.saveInstance(updated);
    await syncInstancesToObrItems([updated], sheetsById);
  },

  async consumeResource(itemId, featureId, delta) {
    if (get().role !== "GM") return;
    const { instances } = get();
    const target = instances.find((i) => i.boundItemId === itemId);
    if (!target) return;

    const currentUsed = target.consumedResources[featureId] ?? 0;
    const nextUsed = Math.max(0, currentUsed + delta);
    const updated: TokenInstance = {
      ...target,
      consumedResources: {
        ...target.consumedResources,
        [featureId]: nextUsed,
      },
      updatedAt: new Date().toISOString(),
    };

    set({
      instances: instances.map((i) =>
        i.boundItemId === itemId ? updated : i,
      ),
    });
    await storageProvider.instances.saveInstance(updated);
  },

  async updateSettings(next) {
    set({ settings: next });
    await storageProvider.settings.saveSettings(next);
    get().showToast("Configurações salvas.", "success");
  },

  async setInstanceInitiative(itemId, value) {
    const { instances, sheets, initiative } = get();
    const sheetsById = new Map(sheets.map((s) => [s.id, s]));
    const updatedInsts = instances.map((inst) =>
      inst.boundItemId === itemId ? { ...inst, initiative: value } : inst,
    );
    const targetInst = updatedInsts.find((i) => i.boundItemId === itemId);
    if (targetInst) {
      await storageProvider.instances.saveInstance(targetInst);
    }

    const order = updatedInsts
      .filter((i) => typeof i.initiative === "number")
      .map((i) => {
        const sh = sheetsById.get(i.templateId);
        return {
          itemId: i.boundItemId,
          initiative: i.initiative as number,
          dexTiebreaker: sh ? getAbilityModifier(sh.abilities.dex) : 0,
        };
      })
      .sort(
        (a, b) =>
          b.initiative - a.initiative || b.dexTiebreaker - a.dexTiebreaker,
      );

    const nextInitiative: InitiativeState = {
      ...initiative,
      active: order.length > 0 ? initiative.active : false,
      order,
      turnIndex: Math.min(initiative.turnIndex, Math.max(0, order.length - 1)),
    };

    set({ instances: updatedInsts, initiative: nextInitiative });
    if (OBR.isAvailable) {
      await OBR.scene.setMetadata({
        [METADATA_KEYS.INITIATIVE_STATE]: nextInitiative,
      });
    }
  },

  async rollAllInitiatives() {
    const { instances, sheets } = get();
    const sheetsById = new Map(sheets.map((s) => [s.id, s]));
    const updatedList: TokenInstance[] = [];

    const nextInstances = instances.map((inst) => {
      const sh = sheetsById.get(inst.templateId);
      const dexMod = sh ? getAbilityModifier(sh.abilities.dex) : 0;
      const bonus = sh?.initiativeBonus ?? 0;
      const roll = Math.floor(Math.random() * 20) + 1 + dexMod + bonus;
      const upd = { ...inst, initiative: roll };
      updatedList.push(upd);
      return upd;
    });

    await storageProvider.instances.saveInstancesBulk(updatedList);

    const order = nextInstances
      .map((i) => {
        const sh = sheetsById.get(i.templateId);
        return {
          itemId: i.boundItemId,
          initiative: i.initiative ?? 0,
          dexTiebreaker: sh ? getAbilityModifier(sh.abilities.dex) : 0,
        };
      })
      .sort(
        (a, b) =>
          b.initiative - a.initiative || b.dexTiebreaker - a.dexTiebreaker,
      );

    const nextInitiative: InitiativeState = {
      active: order.length > 0,
      round: 1,
      turnIndex: 0,
      order,
    };

    set({ instances: nextInstances, initiative: nextInitiative });
    if (OBR.isAvailable) {
      await OBR.scene.setMetadata({
        [METADATA_KEYS.INITIATIVE_STATE]: nextInitiative,
      });
    }
  },

  async nextTurn() {
    const { initiative, instances, sheets } = get();
    if (initiative.order.length === 0) return;

    const currentEntry = initiative.order[initiative.turnIndex];
    const nextIndex = (initiative.turnIndex + 1) % initiative.order.length;
    const isNewRound = nextIndex === 0;
    const nextRound = isNewRound ? initiative.round + 1 : initiative.round;
    const nextEntry = initiative.order[nextIndex];

    const sheetsById = new Map(sheets.map((s) => [s.id, s]));
    const changedInstances: TokenInstance[] = [];

    const nextInstances = instances.map((inst) => {
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
      return current;
    });

    if (changedInstances.length > 0) {
      await storageProvider.instances.saveInstancesBulk(changedInstances);
      await syncInstancesToObrItems(changedInstances, sheetsById);
    }

    const nextInitiative: InitiativeState = {
      ...initiative,
      active: true,
      round: nextRound,
      turnIndex: nextIndex,
    };

    set({ instances: nextInstances, initiative: nextInitiative });
    if (OBR.isAvailable) {
      await OBR.scene.setMetadata({
        [METADATA_KEYS.INITIATIVE_STATE]: nextInitiative,
      });
    }
  },

  async resetInitiative() {
    const nextInitiative = structuredClone(DEFAULT_INITIATIVE);
    const updatedList = get().instances.map((i) => ({ ...i, initiative: null }));
    await storageProvider.instances.saveInstancesBulk(updatedList);
    set({ instances: updatedList, initiative: nextInitiative });
    if (OBR.isAvailable) {
      await OBR.scene.setMetadata({
        [METADATA_KEYS.INITIATIVE_STATE]: nextInitiative,
      });
    }
  },
}));
