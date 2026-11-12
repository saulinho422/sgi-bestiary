import { create } from "zustand";
import OBR, { type Image } from "@owlbear-rodeo/sdk";
import {
  DEFAULT_SETTINGS,
  type BestiarySettings,
} from "@/domain/entities/settings";
import type { CreatureSheet, VisibilityPolicy } from "@/domain/entities/sheet";
import type {
  ActiveCondition,
  CombatEncounter,
  InitiativeState,
  PublicTokenProjection,
  TokenInstance,
} from "@/domain/entities/tokenInstance";
import {
  addParticipantsToEncounter,
  adjustParticipantTieOrder,
  advanceEncounterTurn,
  buildInitiativeStateFromEncounter,
  createCombatEncounter,
  reconcileEncounterWithValidItems,
  removeParticipantsFromEncounter,
  resetEncounterInitiatives,
  rollEncounterInitiatives,
  setParticipantInitiative,
  startEncounterCombat,
} from "@/services/combatService";
import {
  addConditionToInstance,
  applySheetUpdateToInstance,
  mutateInstanceStats,
  readPublicProjectionFromItem,
  removeConditionFromInstance,
  updateInstanceVisibility,
  type InstanceHpMutation,
} from "@/services/instanceService";
import { pruneOrphanRecordsForScene } from "@/services/sceneSyncService";
import {
  ensureSeedLibraryLoaded,
  storageProvider,
  subscribeDbSync,
} from "@/integrations/storage/dexieRepository";
import { SEED_SHEETS } from "@/integrations/storage/seedData";
import {
  bindItemsToSheet,
  deleteObrSceneItems,
  ensureSceneScopeId,
  isCharacterOrMountImage,
  spawnCreaturesOnScene,
  syncActiveEncounterToSceneMetadata,
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
  encounters: CombatEncounter[];
  activeEncounterId: string | null;
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
  refreshEncounters: () => Promise<void>;
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
  deleteTokensFromScene: (itemIds: string[]) => Promise<void>;
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

  createEncounter: (
    name?: string,
    initialParticipantIds?: string[],
  ) => Promise<CombatEncounter>;
  selectEncounter: (encounterId: string) => Promise<void>;
  deleteEncounter: (encounterId: string) => Promise<void>;
  addParticipantsToCombat: (itemIds: string[]) => Promise<void>;
  removeParticipantsFromCombat: (itemIds: string[]) => Promise<void>;
  setInstanceInitiative: (itemId: string, value: number | null) => Promise<void>;
  adjustParticipantOrder: (itemId: string, direction: "up" | "down") => Promise<void>;
  rollAllInitiatives: (options?: {
    rerollExisting?: boolean;
    onlyItemIds?: string[];
  }) => Promise<void>;
  startCombat: () => Promise<void>;
  nextTurn: () => Promise<void>;
  resetInitiative: () => Promise<void>;
}

const DEFAULT_INITIATIVE: InitiativeState = {
  active: false,
  round: 1,
  turnIndex: 0,
  order: [],
};

function computeSummaryForEncounter(
  encounter: CombatEncounter | null | undefined,
  instances: TokenInstance[],
  sheets: CreatureSheet[],
): InitiativeState {
  return buildInitiativeStateFromEncounter(
    encounter,
    new Map(instances.map((i) => [i.boundItemId, i])),
    new Map(sheets.map((s) => [s.id, s])),
  );
}

function getActiveEncounter(
  encounters: CombatEncounter[],
  activeEncounterId: string | null,
): CombatEncounter | null {
  if (encounters.length === 0) return null;
  if (activeEncounterId) {
    const found = encounters.find((e) => e.id === activeEncounterId);
    if (found) return found;
  }
  return encounters[0] ?? null;
}

export const useBestiaryStore = create<BestiaryStoreState>((set, get) => ({
  initialized: false,
  obrConnected: false,
  sceneReady: false,
  sceneId: "local-sandbox",
  role: "GM",
  sheets: [],
  instances: [],
  encounters: [],
  activeEncounterId: null,
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

  async refreshEncounters() {
    const { sceneId, role, instances, sheets } = get();
    if (role !== "GM") return;
    const [encounters, activeId] = await Promise.all([
      storageProvider.encounters.listEncountersByScene(sceneId),
      storageProvider.encounters.getActiveEncounterId(sceneId),
    ]);
    const active = getActiveEncounter(encounters, activeId);
    set({
      encounters,
      activeEncounterId: active?.id ?? null,
      initiative: computeSummaryForEncounter(active, instances, sheets),
    });
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
      if (topic === "encounters") void get().refreshEncounters();
      if (topic === "settings") {
        void storageProvider.settings
          .getSettings()
          .then((s) => set({ settings: s }));
      }
    });

    if (!OBR.isAvailable) {
      const [instances, encounters, activeId] = await Promise.all([
        storageProvider.instances.listInstancesByScene("local-sandbox"),
        storageProvider.encounters.listEncountersByScene("local-sandbox"),
        storageProvider.encounters.getActiveEncounterId("local-sandbox"),
      ]);
      const active = getActiveEncounter(encounters, activeId);
      set({
        initialized: true,
        obrConnected: false,
        sceneReady: true,
        sceneId: "local-sandbox",
        role: "GM",
        sheets,
        instances,
        encounters,
        activeEncounterId: active?.id ?? null,
        initiative: computeSummaryForEncounter(active, instances, sheets),
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
        set({
          sceneReady: false,
          sceneImages: [],
          instances: [],
          encounters: [],
          activeEncounterId: null,
          initiative: structuredClone(DEFAULT_INITIATIVE),
        });
        return;
      }

      const [role, sceneId, items, selection, sceneMeta] = await Promise.all([
        OBR.player.getRole(),
        ensureSceneScopeId(),
        OBR.scene.items.getItems(isCharacterOrMountImage),
        OBR.player.getSelection(),
        OBR.scene.getMetadata(),
      ]);

      if (!(await OBR.scene.isReady())) {
        return;
      }

      const projMap: Record<string, PublicTokenProjection> = {};
      for (const item of items) {
        const proj = readPublicProjectionFromItem(item);
        if (proj) projMap[item.id] = proj;
      }

      const currentSheets = await storageProvider.library.listSheets();
      const sheetsById = new Map(currentSheets.map((s) => [s.id, s]));

      let instances: TokenInstance[] = [];
      let encounters: CombatEncounter[] = [];
      let activeEncounterId: string | null = null;

      if (role === "GM") {
        const validItemIds = new Set(items.map((i) => i.id));
        const pruned = await pruneOrphanRecordsForScene({
          sceneId,
          validItemIds,
          sheetsById,
        });
        instances = pruned.survivingInstances;
        encounters = pruned.encounters;

        const remoteCombat = sceneMeta[METADATA_KEYS.COMBAT_STATE] as
          | CombatEncounter
          | null
          | undefined;
        if (
          encounters.length === 0 &&
          remoteCombat &&
          remoteCombat.sceneId === sceneId
        ) {
          const instancesByItemId = new Map(
            instances.map((i) => [i.boundItemId, i]),
          );
          const { encounter: cleanedRemote } = reconcileEncounterWithValidItems(
            remoteCombat,
            validItemIds,
            instancesByItemId,
            sheetsById,
          );
          await storageProvider.encounters.saveEncounter(cleanedRemote);
          await storageProvider.encounters.setActiveEncounterId(
            sceneId,
            cleanedRemote.id,
          );
          encounters = [cleanedRemote];
        }

        const storedActiveId =
          await storageProvider.encounters.getActiveEncounterId(sceneId);
        const activeEnc = getActiveEncounter(encounters, storedActiveId);
        activeEncounterId = activeEnc?.id ?? null;

        const initSummary = computeSummaryForEncounter(
          activeEnc,
          instances,
          currentSheets,
        );

        set({
          initialized: true,
          sceneReady: true,
          role,
          sceneId,
          sheets: currentSheets,
          sceneImages: items,
          publicProjectionsByItemId: projMap,
          instances,
          encounters,
          activeEncounterId,
          selectedItemIds: selection ?? [],
          initiative: initSummary,
        });
        return;
      }

      const initMeta = sceneMeta[METADATA_KEYS.INITIATIVE_STATE] as
        | InitiativeState
        | undefined;

      set({
        initialized: true,
        sceneReady: true,
        role,
        sceneId,
        sheets: currentSheets,
        sceneImages: items,
        publicProjectionsByItemId: projMap,
        instances: [],
        encounters: [],
        activeEncounterId: null,
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

          if (get().role === "GM" && get().sceneReady) {
            const expectedSceneId = get().sceneId;
            void (async () => {
              if (!(await OBR.scene.isReady())) return;
              const liveSceneId = await ensureSceneScopeId();
              if (liveSceneId !== expectedSceneId || !get().sceneReady) return;

              const sheetsById = new Map(get().sheets.map((s) => [s.id, s]));
              const pruned = await pruneOrphanRecordsForScene({
                sceneId: expectedSceneId,
                validItemIds: new Set(images.map((i) => i.id)),
                sheetsById,
              });

              const activeEnc = getActiveEncounter(
                pruned.encounters,
                get().activeEncounterId,
              );
              const initSummary = computeSummaryForEncounter(
                activeEnc,
                pruned.survivingInstances,
                get().sheets,
              );

              set({
                instances: pruned.survivingInstances,
                encounters: pruned.encounters,
                activeEncounterId: activeEnc?.id ?? null,
                initiative: initSummary,
              });

              if (pruned.encountersChanged) {
                await syncActiveEncounterToSceneMetadata(
                  activeEnc,
                  new Map(pruned.survivingInstances.map((i) => [i.boundItemId, i])),
                  sheetsById,
                );
              }
            })();
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
          if (get().role === "PLAYER") {
            const initMeta = meta[METADATA_KEYS.INITIATIVE_STATE] as
              | InitiativeState
              | undefined;
            if (initMeta) {
              set({ initiative: initMeta });
            }
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
    if (itemIds.length === 0) return;
    const { instances, encounters, activeEncounterId, sheets } = get();
    const removeSet = new Set(itemIds);
    const remainingInstances = instances.filter(
      (i) => !removeSet.has(i.boundItemId),
    );
    const instancesByItemId = new Map(
      remainingInstances.map((i) => [i.boundItemId, i]),
    );
    const sheetsById = new Map(sheets.map((s) => [s.id, s]));

    await unbindItemsFromSheet(itemIds);

    const updatedEncounters: CombatEncounter[] = [];
    for (const enc of encounters) {
      const { encounter: cleaned, removedCount } = removeParticipantsFromEncounter(
        enc,
        itemIds,
        instancesByItemId,
        sheetsById,
      );
      updatedEncounters.push(cleaned);
      if (removedCount > 0) {
        await storageProvider.encounters.saveEncounter(cleaned);
      }
    }

    const activeEnc = getActiveEncounter(updatedEncounters, activeEncounterId);
    set({
      instances: remainingInstances,
      encounters: updatedEncounters,
      initiative: computeSummaryForEncounter(activeEnc, remainingInstances, sheets),
    });

    await syncActiveEncounterToSceneMetadata(
      activeEnc,
      instancesByItemId,
      sheetsById,
    );

    get().showToast(
      itemIds.length === 1
        ? "Vínculo removido do token (token mantido no mapa)."
        : `${itemIds.length} tokens desvinculados (mantidos no mapa).`,
      "info",
    );
  },

  async deleteTokensFromScene(itemIds) {
    if (itemIds.length === 0) return;
    const { sceneId, instances, sceneImages, encounters, activeEncounterId, sheets } =
      get();
    const removeSet = new Set(itemIds);
    const remainingInstances = instances.filter(
      (i) => !removeSet.has(i.boundItemId),
    );
    const remainingImages = sceneImages.filter((img) => !removeSet.has(img.id));
    const instancesByItemId = new Map(
      remainingInstances.map((i) => [i.boundItemId, i]),
    );
    const sheetsById = new Map(sheets.map((s) => [s.id, s]));

    for (const id of itemIds) {
      await storageProvider.instances.deleteInstance(id, sceneId);
    }

    const updatedEncounters: CombatEncounter[] = [];
    for (const enc of encounters) {
      const { encounter: cleaned, removedCount } = removeParticipantsFromEncounter(
        enc,
        itemIds,
        instancesByItemId,
        sheetsById,
      );
      updatedEncounters.push(cleaned);
      if (removedCount > 0) {
        await storageProvider.encounters.saveEncounter(cleaned);
      }
    }

    const activeEnc = getActiveEncounter(updatedEncounters, activeEncounterId);
    set({
      instances: remainingInstances,
      sceneImages: remainingImages,
      encounters: updatedEncounters,
      initiative: computeSummaryForEncounter(activeEnc, remainingInstances, sheets),
    });

    await deleteObrSceneItems(itemIds);
    await syncActiveEncounterToSceneMetadata(
      activeEnc,
      instancesByItemId,
      sheetsById,
    );

    get().showToast(
      itemIds.length === 1
        ? "Token excluído da cena (ficha mantida na Biblioteca)."
        : `${itemIds.length} tokens excluídos da cena.`,
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

  async createEncounter(name, initialParticipantIds = []) {
    const { sceneId, encounters, instances, sheets } = get();
    const instancesByItemId = new Map(instances.map((i) => [i.boundItemId, i]));
    const sheetsById = new Map(sheets.map((s) => [s.id, s]));

    const base = createCombatEncounter({
      sceneId,
      name: name?.trim() || `Encontro ${encounters.length + 1}`,
    });
    const { encounter: created } =
      initialParticipantIds.length > 0
        ? addParticipantsToEncounter(
            base,
            initialParticipantIds,
            instancesByItemId,
            sheetsById,
          )
        : { encounter: base };

    await storageProvider.encounters.saveEncounter(created);
    await storageProvider.encounters.setActiveEncounterId(sceneId, created.id);

    const nextEncounters = [...encounters, created];
    set({
      encounters: nextEncounters,
      activeEncounterId: created.id,
      initiative: computeSummaryForEncounter(created, instances, sheets),
    });

    await syncActiveEncounterToSceneMetadata(created, instancesByItemId, sheetsById);
    get().showToast(`Combate "${created.name}" criado.`, "success");
    return created;
  },

  async selectEncounter(encounterId) {
    const { sceneId, encounters, instances, sheets } = get();
    const found = encounters.find((e) => e.id === encounterId);
    if (!found) return;
    await storageProvider.encounters.setActiveEncounterId(sceneId, found.id);
    set({
      activeEncounterId: found.id,
      initiative: computeSummaryForEncounter(found, instances, sheets),
    });
    await syncActiveEncounterToSceneMetadata(
      found,
      new Map(instances.map((i) => [i.boundItemId, i])),
      new Map(sheets.map((s) => [s.id, s])),
    );
  },

  async deleteEncounter(encounterId) {
    const { sceneId, encounters, activeEncounterId, instances, sheets } = get();
    await storageProvider.encounters.deleteEncounter(encounterId);
    const remaining = encounters.filter((e) => e.id !== encounterId);
    const nextActive =
      activeEncounterId === encounterId
        ? remaining[0] ?? null
        : getActiveEncounter(remaining, activeEncounterId);

    await storageProvider.encounters.setActiveEncounterId(
      sceneId,
      nextActive?.id ?? null,
    );
    set({
      encounters: remaining,
      activeEncounterId: nextActive?.id ?? null,
      initiative: computeSummaryForEncounter(nextActive, instances, sheets),
    });
    await syncActiveEncounterToSceneMetadata(
      nextActive,
      new Map(instances.map((i) => [i.boundItemId, i])),
      new Map(sheets.map((s) => [s.id, s])),
    );
  },

  async addParticipantsToCombat(itemIds) {
    if (itemIds.length === 0) return;
    const { sceneId, encounters, activeEncounterId, instances, sheets } = get();
    const instancesByItemId = new Map(instances.map((i) => [i.boundItemId, i]));
    const sheetsById = new Map(sheets.map((s) => [s.id, s]));

    let target = getActiveEncounter(encounters, activeEncounterId);
    let createdNew = false;
    if (!target) {
      target = createCombatEncounter({
        sceneId,
        name: "Encontro 1",
      });
      createdNew = true;
    }

    const { encounter: updated, addedCount } = addParticipantsToEncounter(
      target,
      itemIds,
      instancesByItemId,
      sheetsById,
    );

    if (addedCount === 0 && !createdNew) {
      get().showToast("Criatura(s) já estão neste combate.", "info");
      return;
    }

    await storageProvider.encounters.saveEncounter(updated);
    if (createdNew) {
      await storageProvider.encounters.setActiveEncounterId(sceneId, updated.id);
    }

    const nextEncounters = createdNew
      ? [...encounters, updated]
      : encounters.map((e) => (e.id === updated.id ? updated : e));

    set({
      encounters: nextEncounters,
      activeEncounterId: updated.id,
      initiative: computeSummaryForEncounter(updated, instances, sheets),
    });

    await syncActiveEncounterToSceneMetadata(updated, instancesByItemId, sheetsById);
    get().showToast(
      addedCount === 1
        ? "1 participante adicionado ao combate."
        : `${addedCount} participantes adicionados ao combate.`,
      "success",
    );
  },

  async removeParticipantsFromCombat(itemIds) {
    if (itemIds.length === 0) return;
    const { encounters, activeEncounterId, instances, sheets } = get();
    const target = getActiveEncounter(encounters, activeEncounterId);
    if (!target) return;

    const instancesByItemId = new Map(instances.map((i) => [i.boundItemId, i]));
    const sheetsById = new Map(sheets.map((s) => [s.id, s]));

    const { encounter: updated, removedCount } = removeParticipantsFromEncounter(
      target,
      itemIds,
      instancesByItemId,
      sheetsById,
    );
    if (removedCount === 0) return;

    await storageProvider.encounters.saveEncounter(updated);
    const nextEncounters = encounters.map((e) =>
      e.id === updated.id ? updated : e,
    );

    set({
      encounters: nextEncounters,
      initiative: computeSummaryForEncounter(updated, instances, sheets),
    });

    await syncActiveEncounterToSceneMetadata(updated, instancesByItemId, sheetsById);
    get().showToast(
      removedCount === 1
        ? "Participante removido do combate (token mantido na cena)."
        : `${removedCount} participantes removidos do combate.`,
      "info",
    );
  },

  async setInstanceInitiative(itemId, value) {
    const { encounters, activeEncounterId, instances, sheets } = get();
    const target = getActiveEncounter(encounters, activeEncounterId);
    if (!target) return;

    const updated = setParticipantInitiative(target, itemId, value);
    await storageProvider.encounters.saveEncounter(updated);

    const nextEncounters = encounters.map((e) =>
      e.id === updated.id ? updated : e,
    );
    const initSummary = computeSummaryForEncounter(updated, instances, sheets);

    set({
      encounters: nextEncounters,
      initiative: initSummary,
    });

    await syncActiveEncounterToSceneMetadata(
      updated,
      new Map(instances.map((i) => [i.boundItemId, i])),
      new Map(sheets.map((s) => [s.id, s])),
    );
  },

  async adjustParticipantOrder(itemId, direction) {
    const { encounters, activeEncounterId, instances, sheets } = get();
    const target = getActiveEncounter(encounters, activeEncounterId);
    if (!target) return;

    const instancesByItemId = new Map(instances.map((i) => [i.boundItemId, i]));
    const sheetsById = new Map(sheets.map((s) => [s.id, s]));
    const updated = adjustParticipantTieOrder(
      target,
      itemId,
      direction,
      instancesByItemId,
      sheetsById,
    );
    if (updated === target) return;

    await storageProvider.encounters.saveEncounter(updated);
    set({
      encounters: encounters.map((e) => (e.id === updated.id ? updated : e)),
      initiative: computeSummaryForEncounter(updated, instances, sheets),
    });

    await syncActiveEncounterToSceneMetadata(updated, instancesByItemId, sheetsById);
  },

  async rollAllInitiatives(options) {
    const { encounters, activeEncounterId, instances, sheets } = get();
    const target = getActiveEncounter(encounters, activeEncounterId);
    if (!target || target.participants.length === 0) return;

    const instancesByItemId = new Map(instances.map((i) => [i.boundItemId, i]));
    const sheetsById = new Map(sheets.map((s) => [s.id, s]));

    const { encounter: updated, rolledItemIds, skippedCharacterIds } =
      rollEncounterInitiatives(target, instancesByItemId, sheetsById, options);

    if (rolledItemIds.length > 0) {
      await storageProvider.encounters.saveEncounter(updated);
      set({
        encounters: encounters.map((e) => (e.id === updated.id ? updated : e)),
        initiative: computeSummaryForEncounter(updated, instances, sheets),
      });
      await syncActiveEncounterToSceneMetadata(updated, instancesByItemId, sheetsById);
      get().showToast(
        skippedCharacterIds.length > 0
          ? `Iniciativa rolada para ${rolledItemIds.length} monstro(s)/NPC(s). ${skippedCharacterIds.length} PJ(s) aguardam valor manual.`
          : `Iniciativa rolada para ${rolledItemIds.length} participante(s).`,
        "success",
      );
    } else if (skippedCharacterIds.length > 0) {
      get().showToast(
        "PJs usam iniciativa manual. Informe os valores diretamente nos cards.",
        "info",
      );
    } else {
      get().showToast(
        "Monstros e NPCs já possuem iniciativa definida. Use Rerolar para sortear novamente.",
        "info",
      );
    }
  },

  async startCombat() {
    const { encounters, activeEncounterId, instances, sheets } = get();
    const target = getActiveEncounter(encounters, activeEncounterId);
    if (!target || target.participants.length === 0) return;

    const instancesByItemId = new Map(instances.map((i) => [i.boundItemId, i]));
    const sheetsById = new Map(sheets.map((s) => [s.id, s]));

    const updated = startEncounterCombat(target, instancesByItemId, sheetsById);
    await storageProvider.encounters.saveEncounter(updated);

    set({
      encounters: encounters.map((e) => (e.id === updated.id ? updated : e)),
      initiative: computeSummaryForEncounter(updated, instances, sheets),
    });
    await syncActiveEncounterToSceneMetadata(updated, instancesByItemId, sheetsById);
  },

  async nextTurn() {
    const { encounters, activeEncounterId, instances, sheets } = get();
    const target = getActiveEncounter(encounters, activeEncounterId);
    if (!target || target.participants.length === 0) return;

    const sheetsById = new Map(sheets.map((s) => [s.id, s]));
    const { encounter: updatedEncounter, changedInstances } = advanceEncounterTurn(
      target,
      instances,
      sheetsById,
    );

    let nextInstances = instances;
    if (changedInstances.length > 0) {
      const changedMap = new Map(
        changedInstances.map((ci) => [ci.boundItemId, ci]),
      );
      nextInstances = instances.map((i) => changedMap.get(i.boundItemId) ?? i);
      await storageProvider.instances.saveInstancesBulk(changedInstances);
      await syncInstancesToObrItems(changedInstances, sheetsById);
    }

    await storageProvider.encounters.saveEncounter(updatedEncounter);
    const nextEncounters = encounters.map((e) =>
      e.id === updatedEncounter.id ? updatedEncounter : e,
    );

    set({
      instances: nextInstances,
      encounters: nextEncounters,
      initiative: computeSummaryForEncounter(
        updatedEncounter,
        nextInstances,
        sheets,
      ),
    });

    await syncActiveEncounterToSceneMetadata(
      updatedEncounter,
      new Map(nextInstances.map((i) => [i.boundItemId, i])),
      sheetsById,
    );
  },

  async resetInitiative() {
    const { encounters, activeEncounterId, instances, sheets } = get();
    const target = getActiveEncounter(encounters, activeEncounterId);
    if (!target) return;

    const updated = resetEncounterInitiatives(target);
    await storageProvider.encounters.saveEncounter(updated);

    set({
      encounters: encounters.map((e) => (e.id === updated.id ? updated : e)),
      initiative: computeSummaryForEncounter(updated, instances, sheets),
    });

    await syncActiveEncounterToSceneMetadata(
      updated,
      new Map(instances.map((i) => [i.boundItemId, i])),
      new Map(sheets.map((s) => [s.id, s])),
    );
  },
}));
