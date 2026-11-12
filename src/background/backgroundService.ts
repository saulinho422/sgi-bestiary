import OBR, { type Image } from "@owlbear-rodeo/sdk";
import {
  DEFAULT_SETTINGS,
  type BestiarySettings,
} from "@/domain/entities/settings";
import type { CreatureSheet } from "@/domain/entities/sheet";
import type {
  ImageTemplateMapping,
  PublicTokenProjection,
  TokenInstance,
} from "@/domain/entities/tokenInstance";
import { projectTokenForPlayers } from "@/domain/rules/visibilityProjection";
import {
  addConditionToInstance,
  cloneInstanceForDuplicateToken,
  computeImageSignature,
  createTokenInstanceFromSheet,
  mutateInstanceStats,
  readPublicProjectionFromItem,
  removeConditionFromInstance,
  type InstanceHpMutation,
} from "@/services/instanceService";
import { createConditionFromCatalog } from "@/domain/rules/conditionsCatalog";
import {
  buildHudViewForViewer,
  TacticalHudRenderer,
  type HudRenderableView,
} from "@/features/token-hud/hudRenderer";
import {
  ensureSeedLibraryLoaded,
  storageProvider,
  subscribeDbSync,
  type DbSyncTopic,
} from "@/integrations/storage/dexieRepository";
import { SEED_SHEETS } from "@/integrations/storage/seedData";
import {
  ensureSceneScopeId,
  isCharacterOrMountImage,
  openBindModal,
  openSheetModal,
  syncActiveEncounterToSceneMetadata,
  syncInstancesToObrItems,
} from "@/integrations/owlbear/obrBridge";
import {
  getActivePendingSpawnIds,
  pruneOrphanRecordsForScene,
} from "@/services/sceneSyncService";
import { PublicTokenProjectionSchema } from "@/domain/schemas/instanceSchema";
import { BROADCAST_CHANNELS, getPluginId, METADATA_KEYS } from "@/utils/pluginId";
import { resolveExtensionUrl } from "@/utils/assetUrls";

export type PlayerEditMessage =
  | {
      type: "hp-mutation";
      itemId: string;
      mutation: InstanceHpMutation;
    }
  | {
      type: "add-condition";
      itemId: string;
      conditionId: string;
    }
  | {
      type: "remove-condition";
      itemId: string;
      conditionId: string;
    };

function stableCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableCanonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([k1], [k2]) => (k1 < k2 ? -1 : k1 > k2 ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableCanonicalJson(v)}`)
    .join(",")}}`;
}

function projectionEqualIgnoringTimestamp(
  a: PublicTokenProjection | null,
  b: PublicTokenProjection,
): boolean {
  if (!a) return false;
  const parsedB = PublicTokenProjectionSchema.safeParse(b);
  const normB = parsedB.success ? parsedB.data : b;
  const { syncedAt: _sa, ...restA } = a;
  const { syncedAt: _sb, ...restB } = normB;
  return stableCanonicalJson(restA) === stableCanonicalJson(restB);
}

let contextMenusRegistered = false;

export async function registerContextMenus(themeMode: "DARK" | "LIGHT" = "DARK"): Promise<void> {
  if (!OBR.isAvailable) return;

  // 1. Edição rápida embutida (HP, Temp HP, CA, Condições)
  await OBR.contextMenu.create({
    id: getPluginId("menu-quick-stats"),
    icons: [
      {
        icon: resolveExtensionUrl("icon.svg"),
        label: "SGI: Controle Rápido",
        filter: {
          every: [
            { key: "type", value: "IMAGE" },
            { key: "layer", value: "CHARACTER", coordinator: "||" },
            { key: "layer", value: "MOUNT" },
            { key: ["metadata", METADATA_KEYS.TOKEN], value: undefined, operator: "!=" },
          ],
          roles: ["GM"],
          max: 1,
        },
      },
      {
        icon: resolveExtensionUrl("icon.svg"),
        label: "SGI: Meus PV e Condições",
        filter: {
          every: [
            { key: "type", value: "IMAGE" },
            { key: "layer", value: "CHARACTER", coordinator: "||" },
            { key: "layer", value: "MOUNT" },
            { key: ["metadata", METADATA_KEYS.TOKEN, "visibility", "playerCanEdit"], value: true },
          ],
          permissions: ["UPDATE"],
          roles: ["PLAYER"],
          max: 1,
        },
      },
    ],
    embed: {
      url: resolveExtensionUrl(`src/contextMenu/context-menu.html?theme=${themeMode}`),
      height: 158,
    },
  });

  // 2. Abrir Ficha Completa / Resumida
  await OBR.contextMenu.create({
    id: getPluginId("menu-open-sheet"),
    icons: [
      {
        icon: resolveExtensionUrl("icons/sheet.svg"),
        label: "Abrir Ficha (SGI)",
        filter: {
          every: [
            { key: "type", value: "IMAGE" },
            { key: "layer", value: "CHARACTER", coordinator: "||" },
            { key: "layer", value: "MOUNT" },
            { key: ["metadata", METADATA_KEYS.TOKEN], value: undefined, operator: "!=" },
          ],
          roles: ["GM"],
          max: 1,
        },
      },
      {
        icon: resolveExtensionUrl("icons/sheet.svg"),
        label: "Ver Ficha",
        filter: {
          every: [
            { key: "type", value: "IMAGE" },
            { key: "layer", value: "CHARACTER", coordinator: "||" },
            { key: "layer", value: "MOUNT" },
            {
              key: ["metadata", METADATA_KEYS.TOKEN, "visibility", "publicSummarySheet"],
              value: true,
              coordinator: "||",
            },
            {
              key: ["metadata", METADATA_KEYS.TOKEN, "visibility", "publicFullSheet"],
              value: true,
            },
          ],
          roles: ["PLAYER"],
          max: 1,
        },
      },
    ],
    onClick(context) {
      const target = context.items[0];
      if (!target) return;
      const proj = readPublicProjectionFromItem(target);
      void openSheetModal({
        itemId: target.id,
        sheetId: proj?.templateId,
        mode: "view",
      });
    },
  });

  // 3. Vincular / Trocar Ficha da Biblioteca (Mestre)
  await OBR.contextMenu.create({
    id: getPluginId("menu-bind-sheet"),
    icons: [
      {
        icon: resolveExtensionUrl("icons/bind.svg"),
        label: "Vincular ficha (SGI)",
        filter: {
          every: [
            { key: "type", value: "IMAGE" },
            { key: "layer", value: "CHARACTER", coordinator: "||" },
            { key: "layer", value: "MOUNT" },
          ],
          roles: ["GM"],
          min: 1,
        },
      },
    ],
    onClick(context) {
      const ids = context.items.map((it) => it.id);
      if (ids.length === 0) return;
      void openBindModal(ids);
    },
  });

  contextMenusRegistered = true;
}

export interface SgiBackgroundDaemonOptions {
  renderer?: TacticalHudRenderer;
}

export class SgiBackgroundDaemon {
  private renderer: TacticalHudRenderer;
  private globalCleanups: Array<() => void> = [];
  private sceneCleanup: (() => void) | null = null;
  private attachInFlight: Promise<void> | null = null;
  private runningScene = false;
  private stopped = false;
  private sceneGeneration = 0;
  private latestItemsRevision = 0;
  private pendingForceFullCleanup = false;
  private sheetsById = new Map<string, CreatureSheet>();
  private instancesByItemId = new Map<string, TokenInstance>();
  private mappingsBySig = new Map<string, ImageTemplateMapping>();
  private settings: BestiarySettings = structuredClone(DEFAULT_SETTINGS);
  private role: "GM" | "PLAYER" = "PLAYER";
  private sceneId = "default";
  private sceneDpi = 150;
  private pendingMetadataWrite = false;
  private processQueue: Promise<void> = Promise.resolve();

  constructor(options: SgiBackgroundDaemonOptions = {}) {
    this.renderer = options.renderer ?? new TacticalHudRenderer();
  }

  getRenderer(): TacticalHudRenderer {
    return this.renderer;
  }

  private enqueueSceneWork(task: () => Promise<void>): Promise<void> {
    const next = this.processQueue.then(task, task);
    this.processQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async flushQueue(): Promise<void> {
    if (this.attachInFlight) {
      await this.attachInFlight;
    }
    await this.processQueue;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await ensureSeedLibraryLoaded(SEED_SHEETS);

    const theme = OBR.isAvailable ? await OBR.theme.getTheme() : { mode: "DARK" as const };
    if (!contextMenusRegistered) {
      await registerContextMenus(theme.mode);
    }

    if (this.stopped) return;

    const unsubTheme = OBR.theme.onChange((nextTheme) => {
      if (this.stopped) return;
      void registerContextMenus(nextTheme.mode);
    });
    this.globalCleanups.push(unsubTheme);

    const unsubReady = OBR.scene.onReadyChange((isReady) => {
      if (this.stopped) return;
      if (isReady) {
        void this.attachScene();
      } else {
        this.detachScene();
      }
    });
    this.globalCleanups.push(unsubReady);

    if (!this.stopped && (await OBR.scene.isReady())) {
      await this.attachScene();
    }
  }

  stop(): void {
    this.stopped = true;
    this.detachScene();
    const cleanups = this.globalCleanups.splice(0, this.globalCleanups.length);
    for (const unsub of cleanups) {
      unsub();
    }
  }

  private async reloadLocalCaches(capturedGen: number): Promise<boolean> {
    const [sheets, instances, mappings, settings] = await Promise.all([
      storageProvider.library.listSheets(),
      storageProvider.instances.listInstancesByScene(this.sceneId),
      storageProvider.mappings.listMappings(),
      storageProvider.settings.getSettings(),
    ]);

    if (this.stopped || capturedGen !== this.sceneGeneration) {
      return false;
    }

    this.sheetsById = new Map(sheets.map((s) => [s.id, s]));
    this.instancesByItemId = new Map(instances.map((i) => [i.boundItemId, i]));
    this.mappingsBySig = new Map(mappings.map((m) => [m.signature, m]));
    this.settings = settings;
    return true;
  }

  private async attachScene(): Promise<void> {
    if (this.stopped) return;
    if (this.attachInFlight) {
      await this.attachInFlight;
      if (this.runningScene || this.stopped) return;
    }
    if (this.runningScene) return;

    const run = this.performAttachScene();
    this.attachInFlight = run;
    try {
      await run;
    } finally {
      if (this.attachInFlight === run) {
        this.attachInFlight = null;
      }
    }
  }

  private async performAttachScene(): Promise<void> {
    if (this.stopped || !(await OBR.scene.isReady())) return;

    // Garante invalidação de qualquer ciclo/cena anterior antes de iniciar a nova cena
    this.sceneCleanup?.();
    this.sceneCleanup = null;
    this.instancesByItemId.clear();
    this.pendingForceFullCleanup = false;

    const gen = ++this.sceneGeneration;
    const revOnAttach = ++this.latestItemsRevision;
    const hudGen = this.renderer.resetCache();
    this.runningScene = true;

    const [scopeId, role, dpi] = await Promise.all([
      ensureSceneScopeId(),
      OBR.player.getRole(),
      OBR.scene.grid.getDpi(),
    ]);

    if (
      this.stopped ||
      gen !== this.sceneGeneration ||
      !(await OBR.scene.isReady())
    ) {
      if (gen === this.sceneGeneration) {
        this.runningScene = false;
      }
      return;
    }

    this.sceneId = scopeId;
    this.role = role;
    this.sceneDpi = dpi;

    const cachesLoaded = await this.reloadLocalCaches(gen);
    if (!cachesLoaded || !(await OBR.scene.isReady())) {
      if (gen === this.sceneGeneration) {
        this.runningScene = false;
      }
      return;
    }

    const unsubItems = OBR.scene.items.onChange((allItems) => {
      if (this.stopped || !this.runningScene || gen !== this.sceneGeneration) return;
      const images = allItems.filter(isCharacterOrMountImage);
      const rev = ++this.latestItemsRevision;
      void this.enqueueSceneWork(() =>
        this.processSceneItems(images, false, gen, rev, hudGen),
      );
    });

    const unsubGrid = OBR.scene.grid.onChange((grid) => {
      if (this.stopped || !this.runningScene || gen !== this.sceneGeneration) return;
      this.sceneDpi = grid.dpi;
      void this.enqueueSceneWork(() =>
        this.reconcileHudFromCurrentScene(true, gen, hudGen),
      );
    });

    const unsubPlayer = OBR.player.onChange((player) => {
      if (this.stopped || !this.runningScene || gen !== this.sceneGeneration) return;
      if (player.role !== this.role) {
        this.role = player.role;
        void this.enqueueSceneWork(async () => {
          if (this.stopped || !this.runningScene || gen !== this.sceneGeneration) {
            return;
          }
          await this.reloadLocalCaches(gen);
          await this.reconcileHudFromCurrentScene(true, gen, hudGen);
        });
      }
    });

    const unsubDb = subscribeDbSync((topic) => {
      if (this.stopped || !this.runningScene || gen !== this.sceneGeneration) return;
      void this.enqueueSceneWork(() =>
        this.handleDbSyncTopic(topic, gen, hudGen),
      );
    });

    const unsubPlayerEdit = OBR.broadcast.onMessage(
      BROADCAST_CHANNELS.PLAYER_EDIT,
      (event) => {
        if (
          this.stopped ||
          !this.runningScene ||
          gen !== this.sceneGeneration ||
          this.role !== "GM"
        ) {
          return;
        }
        const msg = event.data as PlayerEditMessage | undefined;
        if (msg) {
          void this.enqueueSceneWork(() =>
            this.handleAuthorizedPlayerEdit(msg, gen, hudGen),
          );
        }
      },
    );

    const unsubRoomMeta = OBR.room.onMetadataChange(() => {
      if (this.stopped || !this.runningScene || gen !== this.sceneGeneration) return;
      void this.enqueueSceneWork(() =>
        this.reconcileHudFromCurrentScene(false, gen, hudGen),
      );
    });

    const unsubSceneMeta = OBR.scene.onMetadataChange(() => {
      if (this.stopped || !this.runningScene || gen !== this.sceneGeneration) return;
      void this.enqueueSceneWork(() =>
        this.reconcileHudFromCurrentScene(false, gen, hudGen),
      );
    });

    const cleanup = () => {
      unsubItems();
      unsubGrid();
      unsubPlayer();
      unsubDb();
      unsubPlayerEdit();
      unsubRoomMeta();
      unsubSceneMeta();
    };

    if (this.stopped || gen !== this.sceneGeneration) {
      cleanup();
      return;
    }

    this.sceneCleanup = cleanup;

    const initialItems = await OBR.scene.items.getItems(isCharacterOrMountImage);
    if (this.stopped || gen !== this.sceneGeneration) {
      return;
    }

    // Se algum `items.onChange` disparou enquanto carregávamos `initialItems`,
    // garante ainda assim fullCleanup inicial na próxima reconciliação válida.
    if (revOnAttach !== this.latestItemsRevision) {
      this.pendingForceFullCleanup = true;
      return;
    }

    await this.enqueueSceneWork(() =>
      this.processSceneItems(initialItems, true, gen, revOnAttach, hudGen),
    );
  }

  private detachScene(): void {
    this.sceneGeneration += 1;
    this.latestItemsRevision += 1;
    this.runningScene = false;
    this.pendingForceFullCleanup = false;
    this.sceneCleanup?.();
    this.sceneCleanup = null;
    this.instancesByItemId.clear();
    this.renderer.resetCache();
  }

  private async handleDbSyncTopic(
    topic: DbSyncTopic,
    capturedGen: number,
    capturedHudGen: number,
  ): Promise<void> {
    if (
      this.stopped ||
      !this.runningScene ||
      capturedGen !== this.sceneGeneration
    ) {
      return;
    }

    const ok = await this.reloadLocalCaches(capturedGen);
    if (!ok || !this.runningScene || capturedGen !== this.sceneGeneration) return;

    if (topic === "encounters") {
      return;
    }

    if (this.role === "GM" && topic === "instances") {
      if (!(await OBR.scene.isReady())) return;
      if (capturedGen !== this.sceneGeneration || !this.runningScene) return;

      // Projeta atualizações locais feitas pela UI do Mestre para os itens do OBR
      const items = await OBR.scene.items.getItems(isCharacterOrMountImage);
      if (capturedGen !== this.sceneGeneration || !this.runningScene) return;

      const changedInstances: TokenInstance[] = [];
      for (const item of items) {
        const inst = this.instancesByItemId.get(item.id);
        if (!inst) continue;
        const proj = readPublicProjectionFromItem(item);
        const sheet = this.sheetsById.get(inst.templateId);
        const expected = projectTokenForPlayers(inst, sheet);
        if (!projectionEqualIgnoringTimestamp(proj, expected)) {
          changedInstances.push(inst);
        }
      }
      if (changedInstances.length > 0 && !this.pendingMetadataWrite) {
        this.pendingMetadataWrite = true;
        try {
          await syncInstancesToObrItems(changedInstances, this.sheetsById);
        } finally {
          this.pendingMetadataWrite = false;
        }
      }
    }

    await this.reconcileHudFromCurrentScene(
      topic === "settings",
      capturedGen,
      capturedHudGen,
    );
  }

  private async handleAuthorizedPlayerEdit(
    msg: PlayerEditMessage,
    capturedGen: number,
    capturedHudGen: number,
  ): Promise<void> {
    if (
      this.stopped ||
      !this.runningScene ||
      capturedGen !== this.sceneGeneration ||
      this.role !== "GM"
    ) {
      return;
    }

    const instance = this.instancesByItemId.get(msg.itemId);
    if (!instance || !instance.visibility.playerCanEdit) {
      // Segurança real: rejeita edições de tokens que não autorizam edição por jogadores
      return;
    }

    const sheet = this.sheetsById.get(instance.templateId);
    let updated: TokenInstance | null = null;

    if (msg.type === "hp-mutation") {
      updated = mutateInstanceStats(instance, msg.mutation, sheet);
    } else if (msg.type === "add-condition") {
      const cond = createConditionFromCatalog(msg.conditionId, {
        ruleset: sheet?.ruleset ?? "dnd5e-2014",
      });
      updated = addConditionToInstance(instance, cond);
    } else if (msg.type === "remove-condition") {
      updated = removeConditionFromInstance(instance, msg.conditionId);
    }

    if (!updated) return;
    if (capturedGen !== this.sceneGeneration || !this.runningScene) return;

    this.instancesByItemId.set(updated.boundItemId, updated);
    await storageProvider.instances.saveInstance(updated);
    if (capturedGen !== this.sceneGeneration || !this.runningScene) return;

    await syncInstancesToObrItems([updated], this.sheetsById);
    await this.reconcileHudFromCurrentScene(false, capturedGen, capturedHudGen);
  }

  private async processSceneItems(
    images: Image[],
    forceFullCleanup: boolean,
    capturedGen: number,
    capturedRev: number,
    capturedHudGen: number,
  ): Promise<void> {
    if (forceFullCleanup) {
      this.pendingForceFullCleanup = true;
    }

    const isStale = (): boolean =>
      this.stopped ||
      !this.runningScene ||
      capturedGen !== this.sceneGeneration ||
      capturedRev !== this.latestItemsRevision;

    if (isStale()) {
      return;
    }

    if (this.role === "GM") {
      await this.reconcileGmInstancesWithItems(images, capturedGen, capturedRev);
      if (isStale()) {
        return;
      }
    }

    const views: HudRenderableView[] = [];
    for (const img of images) {
      const publicProj = readPublicProjectionFromItem(img);
      const gmInstance =
        this.role === "GM" ? this.instancesByItemId.get(img.id) : undefined;
      const sheet = gmInstance
        ? this.sheetsById.get(gmInstance.templateId)
        : undefined;

      // Jogadores não devem enxergar HUD de tokens invisíveis no mapa
      if (this.role === "PLAYER" && !img.visible) {
        continue;
      }

      const view = buildHudViewForViewer({
        item: img,
        role: this.role,
        settings: this.settings.hud,
        gmInstance,
        gmTemplateName: sheet?.name,
        publicProjection: publicProj,
      });
      if (view) views.push(view);
    }

    if (isStale()) return;

    const effectiveForce = this.pendingForceFullCleanup;
    this.pendingForceFullCleanup = false;

    await this.renderer.reconcile({
      views,
      sceneDpi: this.sceneDpi,
      settings: this.settings.hud,
      forceFullCleanup: effectiveForce,
      expectedGeneration: capturedHudGen,
      isStale,
      verifyActiveTokenIds: async () => {
        if (isStale() || !(await OBR.scene.isReady()) || isStale()) {
          return null;
        }
        const liveImages = await OBR.scene.items.getItems(isCharacterOrMountImage);
        if (isStale()) return null;

        const liveValidIds = new Set<string>();
        for (const liveImg of liveImages) {
          if (this.role === "PLAYER") {
            if (liveImg.visible && readPublicProjectionFromItem(liveImg)) {
              liveValidIds.add(liveImg.id);
            }
          } else {
            if (
              this.instancesByItemId.has(liveImg.id) ||
              readPublicProjectionFromItem(liveImg)
            ) {
              liveValidIds.add(liveImg.id);
            }
          }
        }
        return liveValidIds;
      },
    });
  }

  private async reconcileGmInstancesWithItems(
    images: Image[],
    capturedGen: number,
    capturedRev: number,
  ): Promise<void> {
    const isStale = (): boolean =>
      this.stopped ||
      !this.runningScene ||
      capturedGen !== this.sceneGeneration ||
      capturedRev !== this.latestItemsRevision;

    if (isStale()) return;

    const toSave: TokenInstance[] = [];
    const toProject: TokenInstance[] = [];

    for (const img of images) {
      const proj = readPublicProjectionFromItem(img);

      // Caso 1: Token duplicado nativamente no Owlbear Rodeo! (boundItemId !== img.id)
      if (proj && proj.boundItemId !== img.id) {
        const sourceInst = this.instancesByItemId.get(proj.boundItemId);
        const sheet = this.sheetsById.get(proj.templateId);
        let cloned: TokenInstance | null = null;

        if (sourceInst) {
          cloned = cloneInstanceForDuplicateToken({
            sourceInstance: sourceInst,
            newBoundItemId: img.id,
            newName:
              sourceInst.individualName || sheet?.name
                ? `${sourceInst.individualName || sheet?.name} (Cópia)`
                : undefined,
            resetHp: this.settings.ui.autoDuplicateResetHp,
          });
        } else if (sheet) {
          cloned = createTokenInstanceFromSheet({
            sheet,
            boundItemId: img.id,
            sceneId: this.sceneId,
          });
        }

        if (cloned) {
          this.instancesByItemId.set(cloned.boundItemId, cloned);
          toSave.push(cloned);
          toProject.push(cloned);
          continue;
        }
      }

      // Caso 2: Token já vinculado
      if (proj && proj.boundItemId === img.id) {
        const existing = this.instancesByItemId.get(img.id);
        if (!existing) {
          // Recuperação após limpeza de cache / outro navegador usando template local se disponível
          const sheet = this.sheetsById.get(proj.templateId);
          if (sheet) {
            const recovered = createTokenInstanceFromSheet({
              sheet,
              boundItemId: img.id,
              sceneId: this.sceneId,
              individualName: proj.publicName,
            });
            recovered.instanceId = proj.instanceId;
            if (typeof proj.currentHp === "number") recovered.currentHp = proj.currentHp;
            if (typeof proj.maxHp === "number") recovered.maxHp = proj.maxHp;
            if (typeof proj.tempHp === "number") recovered.tempHp = proj.tempHp;
            if (typeof proj.armorClass === "number") recovered.armorClass = proj.armorClass;
            recovered.visibility = { ...proj.visibility };
            this.instancesByItemId.set(recovered.boundItemId, recovered);
            toSave.push(recovered);
          }
        } else {
          // Garante que a projeção no OBR reflita a instância autoritativa (sem loop infinito)
          const sheet = this.sheetsById.get(existing.templateId);
          const expected = projectTokenForPlayers(existing, sheet);
          if (!projectionEqualIgnoringTimestamp(proj, expected)) {
            toProject.push(existing);
          }
        }
        continue;
      }

      // Caso 3: Token novo sem metadados -> tenta reconhecimento explícito por assinatura de imagem
      if (!proj && this.settings.ui.autoRecognizeMappedImages) {
        const alreadyKnown = this.instancesByItemId.get(img.id);
        if (!alreadyKnown) {
          const sig = computeImageSignature(img);
          const mapping = this.mappingsBySig.get(sig);
          if (mapping?.autoRecognize) {
            const sheet = this.sheetsById.get(mapping.templateId);
            if (sheet) {
              const autoInst = createTokenInstanceFromSheet({
                sheet,
                boundItemId: img.id,
                sceneId: this.sceneId,
                individualName:
                  img.name && img.name !== "Image" ? img.name : sheet.name,
              });
              this.instancesByItemId.set(autoInst.boundItemId, autoInst);
              toSave.push(autoInst);
              toProject.push(autoInst);
            }
          }
        }
      }
    }

    if (isStale()) return;

    if (toSave.length > 0) {
      await storageProvider.instances.saveInstancesBulk(toSave);
      if (isStale()) return;
    }

    if (toProject.length > 0 && !this.pendingMetadataWrite) {
      this.pendingMetadataWrite = true;
      try {
        await syncInstancesToObrItems(toProject, this.sheetsById);
      } finally {
        this.pendingMetadataWrite = false;
      }
      if (isStale()) return;
    }

    // Reconcilia e limpa instâncias órfãs (tokens excluídos diretamente no mapa OBR)
    // Apenas quando a cena estiver pronta, atual e confirmada no mesmo escopo sceneId.
    if (!isStale() && (await OBR.scene.isReady()) && !isStale()) {
      const liveSceneId = await ensureSceneScopeId();
      if (!isStale() && liveSceneId === this.sceneId) {
        const validItemIds = new Set(images.map((img) => img.id));
        const activePending = getActivePendingSpawnIds();

        // Garante remoção no cache em memória mesmo se a UI já tiver excluído do IndexedDB
        for (const cachedId of Array.from(this.instancesByItemId.keys())) {
          if (!validItemIds.has(cachedId) && !activePending.has(cachedId)) {
            this.instancesByItemId.delete(cachedId);
          }
        }

        const pruneResult = await pruneOrphanRecordsForScene({
          sceneId: this.sceneId,
          validItemIds,
          sheetsById: this.sheetsById,
        });

        for (const orphanId of pruneResult.orphanItemIds) {
          this.instancesByItemId.delete(orphanId);
        }

        if (!isStale() && pruneResult.encountersChanged) {
          const activeId = await storageProvider.encounters.getActiveEncounterId(
            this.sceneId,
          );
          const activeEnc =
            pruneResult.encounters.find((e) => e.id === activeId) ??
            pruneResult.encounters[0] ??
            null;
          if (!isStale()) {
            await syncActiveEncounterToSceneMetadata(
              activeEnc,
              this.instancesByItemId,
              this.sheetsById,
            );
          }
        }
      }
    }
  }

  private async reconcileHudFromCurrentScene(
    forceFullCleanup: boolean,
    capturedGen: number,
    capturedHudGen: number,
  ): Promise<void> {
    if (
      this.stopped ||
      !OBR.isAvailable ||
      !this.runningScene ||
      capturedGen !== this.sceneGeneration
    ) {
      return;
    }
    if (!(await OBR.scene.isReady())) return;
    if (this.stopped || !this.runningScene || capturedGen !== this.sceneGeneration) {
      return;
    }

    const rev = ++this.latestItemsRevision;
    const images = await OBR.scene.items.getItems(isCharacterOrMountImage);
    if (
      this.stopped ||
      !this.runningScene ||
      capturedGen !== this.sceneGeneration ||
      rev !== this.latestItemsRevision
    ) {
      if (forceFullCleanup) {
        this.pendingForceFullCleanup = true;
      }
      return;
    }
    await this.processSceneItems(
      images,
      forceFullCleanup,
      capturedGen,
      rev,
      capturedHudGen,
    );
  }
}
