import OBR, { type Image } from "@owlbear-rodeo/sdk";
import type { BestiarySettings } from "@/domain/entities/settings";
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
} from "@/integrations/storage/dexieRepository";
import { SEED_SHEETS } from "@/integrations/storage/seedData";
import {
  ensureSceneScopeId,
  isCharacterOrMountImage,
  openBindModal,
  openSheetModal,
  syncInstancesToObrItems,
} from "@/integrations/owlbear/obrBridge";
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

function projectionEqualIgnoringTimestamp(
  a: PublicTokenProjection | null,
  b: PublicTokenProjection,
): boolean {
  if (!a) return false;
  const { syncedAt: _sa, ...restA } = a;
  const { syncedAt: _sb, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
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

export class SgiBackgroundDaemon {
  private renderer = new TacticalHudRenderer();
  private sceneCleanup: (() => void) | null = null;
  private runningScene = false;
  private sheetsById = new Map<string, CreatureSheet>();
  private instancesByItemId = new Map<string, TokenInstance>();
  private mappingsBySig = new Map<string, ImageTemplateMapping>();
  private settings!: BestiarySettings;
  private role: "GM" | "PLAYER" = "PLAYER";
  private sceneId = "default";
  private sceneDpi = 150;
  private pendingMetadataWrite = false;

  async start(): Promise<void> {
    await ensureSeedLibraryLoaded(SEED_SHEETS);

    const theme = OBR.isAvailable ? await OBR.theme.getTheme() : { mode: "DARK" as const };
    if (!contextMenusRegistered) {
      await registerContextMenus(theme.mode);
    }

    OBR.theme.onChange((nextTheme) => {
      void registerContextMenus(nextTheme.mode);
    });

    OBR.scene.onReadyChange((isReady) => {
      if (isReady) {
        void this.attachScene();
      } else {
        this.detachScene();
      }
    });

    if (await OBR.scene.isReady()) {
      await this.attachScene();
    }
  }

  private async reloadLocalCaches(): Promise<void> {
    const [sheets, instances, mappings, settings] = await Promise.all([
      storageProvider.library.listSheets(),
      storageProvider.instances.listInstancesByScene(this.sceneId),
      storageProvider.mappings.listMappings(),
      storageProvider.settings.getSettings(),
    ]);

    this.sheetsById = new Map(sheets.map((s) => [s.id, s]));
    this.instancesByItemId = new Map(instances.map((i) => [i.boundItemId, i]));
    this.mappingsBySig = new Map(mappings.map((m) => [m.signature, m]));
    this.settings = settings;
  }

  private async attachScene(): Promise<void> {
    if (this.runningScene) return;
    this.runningScene = true;

    this.sceneId = await ensureSceneScopeId();
    this.role = await OBR.player.getRole();
    this.sceneDpi = await OBR.scene.grid.getDpi();
    await this.reloadLocalCaches();

    const initialItems = await OBR.scene.items.getItems(isCharacterOrMountImage);
    await this.processSceneItems(initialItems, true);

    const unsubItems = OBR.scene.items.onChange((allItems) => {
      const images = allItems.filter(isCharacterOrMountImage);
      void this.processSceneItems(images, false);
    });

    const unsubGrid = OBR.scene.grid.onChange((grid) => {
      this.sceneDpi = grid.dpi;
      void this.reconcileHudFromCurrentScene(true);
    });

    const unsubPlayer = OBR.player.onChange((player) => {
      if (player.role !== this.role) {
        this.role = player.role;
        void this.reconcileHudFromCurrentScene(true);
      }
    });

    const unsubDb = subscribeDbSync((topic) => {
      void this.handleDbSyncTopic(topic);
    });

    const unsubPlayerEdit = OBR.broadcast.onMessage(
      BROADCAST_CHANNELS.PLAYER_EDIT,
      (event) => {
        if (this.role !== "GM") return;
        const msg = event.data as PlayerEditMessage | undefined;
        if (msg) void this.handleAuthorizedPlayerEdit(msg);
      },
    );

    const unsubRoomMeta = OBR.room.onMetadataChange(() => {
      void this.reconcileHudFromCurrentScene(false);
    });

    const unsubSceneMeta = OBR.scene.onMetadataChange(() => {
      void this.reconcileHudFromCurrentScene(false);
    });

    this.sceneCleanup = () => {
      unsubItems();
      unsubGrid();
      unsubPlayer();
      unsubDb();
      unsubPlayerEdit();
      unsubRoomMeta();
      unsubSceneMeta();
      this.renderer.resetCache();
      this.runningScene = false;
    };
  }

  private detachScene(): void {
    this.sceneCleanup?.();
    this.sceneCleanup = null;
    this.runningScene = false;
  }

  private async handleDbSyncTopic(
    topic: "sheets" | "instances" | "mappings" | "settings",
  ): Promise<void> {
    await this.reloadLocalCaches();
    if (this.role === "GM" && topic === "instances") {
      // Projeta atualizações locais feitas pela UI do Mestre para os itens do OBR
      const items = await OBR.scene.items.getItems(isCharacterOrMountImage);
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
    await this.reconcileHudFromCurrentScene(topic === "settings");
  }

  private async handleAuthorizedPlayerEdit(msg: PlayerEditMessage): Promise<void> {
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
    this.instancesByItemId.set(updated.boundItemId, updated);
    await storageProvider.instances.saveInstance(updated);
    await syncInstancesToObrItems([updated], this.sheetsById);
    await this.reconcileHudFromCurrentScene(false);
  }

  private async processSceneItems(
    images: Image[],
    forceFullCleanup: boolean,
  ): Promise<void> {
    if (this.role === "GM") {
      await this.reconcileGmInstancesWithItems(images);
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

    await this.renderer.reconcile({
      views,
      sceneDpi: this.sceneDpi,
      settings: this.settings.hud,
      forceFullCleanup,
    });
  }

  private async reconcileGmInstancesWithItems(images: Image[]): Promise<void> {
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

    if (toSave.length > 0) {
      await storageProvider.instances.saveInstancesBulk(toSave);
    }
    if (toProject.length > 0 && !this.pendingMetadataWrite) {
      this.pendingMetadataWrite = true;
      try {
        await syncInstancesToObrItems(toProject, this.sheetsById);
      } finally {
        this.pendingMetadataWrite = false;
      }
    }
  }

  private async reconcileHudFromCurrentScene(
    forceFullCleanup: boolean,
  ): Promise<void> {
    if (!OBR.isAvailable || !this.runningScene) return;
    const images = await OBR.scene.items.getItems(isCharacterOrMountImage);
    await this.processSceneItems(images, forceFullCleanup);
  }
}
