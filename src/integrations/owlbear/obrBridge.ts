import OBR, {
  buildImage,
  isImage,
  type Image,
  type Item,
  type Metadata,
} from "@owlbear-rodeo/sdk";
import type { ImageAssetMeta, CreatureSheet } from "@/domain/entities/sheet";
import type { TokenInstance } from "@/domain/entities/tokenInstance";
import type { CreatureSize } from "@/domain/types/rpgSystem";
import {
  computeImageSignature,
  createTokenInstanceFromSheet,
} from "@/services/instanceService";
import { projectTokenForPlayers } from "@/domain/rules/visibilityProjection";
import { storageProvider } from "@/integrations/storage/dexieRepository";
import { resolveExtensionUrl, resolveMediaAssetUrl } from "@/utils/assetUrls";
import { getPluginId, METADATA_KEYS } from "@/utils/pluginId";

export function isObrAvailable(): boolean {
  return OBR.isAvailable;
}

export function isCharacterOrMountImage(item: Item): item is Image {
  return (
    isImage(item) && (item.layer === "CHARACTER" || item.layer === "MOUNT")
  );
}

export function getGridSquaresForSize(size: CreatureSize): number {
  switch (size) {
    case "LARGE":
      return 2;
    case "HUGE":
      return 3;
    case "GARGANTUAN":
      return 4;
    default:
      return 1;
  }
}

export function resolveSheetImageAsset(
  sheet: CreatureSheet,
): {
  url: string;
  width: number;
  height: number;
  mime: string;
  gridDpi: number;
  gridOffset: { x: number; y: number };
} {
  const fallbackUrl = resolveExtensionUrl(`tokens/${sheet.kind}.svg`);

  const ref = sheet.tokenImage ?? sheet.portrait;
  if (typeof ref === "string" && ref.trim()) {
    // Owlbear Rodeo exige URL HTTP/HTTPS acessível para buildImage em cena compartilhada;
    // caminhos locais iniciados por "/" são ancorados no subdiretório configurado no Vite.
    const url = resolveMediaAssetUrl(ref, { absolute: true });
    return {
      url,
      width: 256,
      height: 256,
      mime: url.endsWith(".svg") ? "image/svg+xml" : "image/png",
      gridDpi: 256,
      gridOffset: { x: 128, y: 128 },
    };
  }
  if (ref && typeof ref === "object") {
    const meta = ref as ImageAssetMeta;
    const url = resolveMediaAssetUrl(meta.url, { absolute: true });
    const width = meta.width ?? 256;
    const height = meta.height ?? 256;
    return {
      url,
      width,
      height,
      mime: meta.mime ?? "image/png",
      gridDpi: meta.gridDpi ?? width,
      gridOffset: meta.gridOffset ?? { x: width / 2, y: height / 2 },
    };
  }

  return {
    url: fallbackUrl,
    width: 256,
    height: 256,
    mime: "image/svg+xml",
    gridDpi: 256,
    gridOffset: { x: 128, y: 128 },
  };
}

export async function ensureSceneScopeId(): Promise<string> {
  if (!OBR.isAvailable) return "local-sandbox";
  try {
    const metadata = await OBR.scene.getMetadata();
    const existing = metadata[METADATA_KEYS.SCENE_SETTINGS] as
      | { sceneId?: string }
      | undefined;
    if (existing?.sceneId) return existing.sceneId;

    const role = await OBR.player.getRole();
    const roomId = OBR.room.id || "room";
    if (role === "GM") {
      const newSceneId = `${roomId}:${crypto.randomUUID()}`;
      await OBR.scene.setMetadata({
        [METADATA_KEYS.SCENE_SETTINGS]: {
          ...(existing ?? {}),
          sceneId: newSceneId,
        },
      });
      return newSceneId;
    }
    return `${roomId}:default`;
  } catch {
    return "default";
  }
}

export async function pickImageFromObrAssets(
  defaultSearch?: string,
): Promise<ImageAssetMeta | null> {
  if (!OBR.isAvailable) return null;
  const downloads = await OBR.assets.downloadImages(
    false,
    defaultSearch,
    "CHARACTER",
  );
  if (!downloads || downloads.length === 0) return null;
  const first = downloads[0];
  return {
    url: first.image.url,
    name: first.name,
    mime: first.image.mime,
    width: first.image.width,
    height: first.image.height,
    gridDpi: first.grid.dpi,
    gridOffset: first.grid.offset,
    signature: `${first.image.url.split("?")[0]}|${first.image.width}x${first.image.height}`,
  };
}

/**
 * Gera posições organizadas em matriz/espiral a partir do centro do viewport,
 * evitando sobreposição de tokens invocados em lote.
 */
export function computeNonOverlappingSpawnPositions(params: {
  center: { x: number; y: number };
  count: number;
  cellSizePx: number;
  squaresPerCreature: number;
  existingPositions: Array<{ x: number; y: number }>;
}): Array<{ x: number; y: number }> {
  const { center, count, cellSizePx, squaresPerCreature, existingPositions } = params;
  const step = Math.max(48, cellSizePx * Math.max(1, squaresPerCreature));
  const cols = Math.ceil(Math.sqrt(count));
  const positions: Array<{ x: number; y: number }> = [];
  const occupied = [...existingPositions];

  const isTooClose = (candidate: { x: number; y: number }) =>
    occupied.some(
      (occ) =>
        Math.abs(occ.x - candidate.x) < step * 0.65 &&
        Math.abs(occ.y - candidate.y) < step * 0.65,
    );

  let slot = 0;
  let safety = 0;
  while (positions.length < count && safety < count * 20 + 50) {
    const row = Math.floor(slot / cols);
    const col = slot % cols;
    const candidate = {
      x: center.x + (col - (cols - 1) / 2) * step,
      y: center.y + (row - Math.floor(count / cols) / 2) * step,
    };
    if (!isTooClose(candidate)) {
      positions.push(candidate);
      occupied.push(candidate);
    }
    slot++;
    safety++;
  }
  return positions;
}

export async function spawnCreaturesOnScene(params: {
  sheet: CreatureSheet;
  count: number;
  baseName?: string;
}): Promise<{ instances: TokenInstance[]; itemIds: string[] }> {
  const count = Math.max(1, Math.min(50, Math.trunc(params.count)));
  const sceneId = await ensureSceneScopeId();
  const asset = resolveSheetImageAsset(params.sheet);
  const squares = getGridSquaresForSize(params.sheet.size);

  if (!OBR.isAvailable) {
    const instances: TokenInstance[] = [];
    const itemIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const itemId = `sandbox-token-${crypto.randomUUID()}`;
      const label =
        count > 1
          ? `${params.baseName || params.sheet.name} ${i + 1}`
          : params.baseName || params.sheet.name;
      const instance = createTokenInstanceFromSheet({
        sheet: params.sheet,
        boundItemId: itemId,
        sceneId,
        individualName: label,
      });
      instances.push(instance);
      itemIds.push(itemId);
    }
    await storageProvider.instances.saveInstancesBulk(instances);
    return { instances, itemIds };
  }

  const ready = await OBR.scene.isReady();
  if (!ready) {
    throw new Error("Abra uma cena no Owlbear Rodeo antes de invocar criaturas.");
  }

  const [dpi, vw, vh, existingSceneItems] = await Promise.all([
    OBR.scene.grid.getDpi(),
    OBR.viewport.getWidth(),
    OBR.viewport.getHeight(),
    OBR.scene.items.getItems(isCharacterOrMountImage),
  ]);

  const viewportCenter = await OBR.viewport.inverseTransformPoint({
    x: vw * 0.5,
    y: vh * 0.5,
  });

  const rawPositions = computeNonOverlappingSpawnPositions({
    center: viewportCenter,
    count,
    cellSizePx: dpi,
    squaresPerCreature: squares,
    existingPositions: existingSceneItems.map((it) => it.position),
  });

  const existingSameTemplate = (
    await storageProvider.instances.listInstancesByScene(sceneId)
  ).filter((inst) => inst.templateId === params.sheet.id).length;

  const builtItems: Image[] = [];
  const createdInstances: TokenInstance[] = [];

  for (let i = 0; i < count; i++) {
    const snapped = await OBR.scene.grid.snapPosition(
      rawPositions[i],
      0.5,
      false,
      true,
    );
    const num = existingSameTemplate + i + 1;
    const label =
      count > 1 || existingSameTemplate > 0
        ? `${params.baseName || params.sheet.name} ${num}`
        : params.baseName || params.sheet.name;

    const scaleFactor =
      (squares * dpi) / Math.max(1, asset.width) * (asset.gridDpi / dpi);
    const finalScale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;

    const itemId = crypto.randomUUID();
    const instance = createTokenInstanceFromSheet({
      sheet: params.sheet,
      boundItemId: itemId,
      sceneId,
      individualName: label,
    });
    const projection = projectTokenForPlayers(instance, params.sheet);

    const imgItem = buildImage(
      {
        url: asset.url,
        width: asset.width,
        height: asset.height,
        mime: asset.mime,
      },
      {
        dpi: asset.gridDpi,
        offset: asset.gridOffset,
      },
    )
      .id(itemId)
      .name(label)
      .layer("CHARACTER")
      .position(snapped)
      .scale({ x: finalScale, y: finalScale })
      .metadata({
        [METADATA_KEYS.TOKEN]: projection,
      })
      .build();

    builtItems.push(imgItem);
    createdInstances.push(instance);
  }

  await storageProvider.instances.saveInstancesBulk(createdInstances);
  await OBR.scene.items.addItems(builtItems);
  await OBR.player.select(builtItems.map((i) => i.id));

  return {
    instances: createdInstances,
    itemIds: builtItems.map((i) => i.id),
  };
}

export async function bindItemsToSheet(params: {
  items: Image[];
  sheet: CreatureSheet;
  rememberImageMapping?: boolean;
}): Promise<TokenInstance[]> {
  const { items, sheet, rememberImageMapping } = params;
  const sceneId = await ensureSceneScopeId();
  const existing = await storageProvider.instances.listInstancesByScene(sceneId);
  const existingSame = existing.filter((e) => e.templateId === sheet.id).length;

  const created: TokenInstance[] = [];
  const projectionById = new Map<string, ReturnType<typeof projectTokenForPlayers>>();

  items.forEach((item, index) => {
    const suffix = items.length > 1 || existingSame > 0 ? ` ${existingSame + index + 1}` : "";
    const instance = createTokenInstanceFromSheet({
      sheet,
      boundItemId: item.id,
      sceneId,
      individualName: item.name && item.name !== "Image" ? item.name : `${sheet.name}${suffix}`,
    });
    created.push(instance);
    projectionById.set(item.id, projectTokenForPlayers(instance, sheet));
  });

  await storageProvider.instances.saveInstancesBulk(created);

  if (rememberImageMapping && items[0]) {
    const signature = computeImageSignature(items[0]);
    await storageProvider.mappings.saveMapping({
      signature,
      imageUrl: items[0].image.url,
      imageName: items[0].name,
      templateId: sheet.id,
      autoRecognize: true,
      updatedAt: new Date().toISOString(),
    });
  }

  if (OBR.isAvailable) {
    await OBR.scene.items.updateItems(
      items.map((i) => i.id),
      (drafts) => {
        for (const draft of drafts) {
          const proj = projectionById.get(draft.id);
          if (proj) {
            draft.metadata[METADATA_KEYS.TOKEN] = proj;
          }
        }
      },
    );
  }

  return created;
}

export async function unbindItemsFromSheet(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const sceneId = await ensureSceneScopeId();
  for (const id of itemIds) {
    await storageProvider.instances.deleteInstance(id, sceneId);
  }

  if (OBR.isAvailable) {
    await OBR.scene.items.updateItems(itemIds, (drafts) => {
      for (const draft of drafts) {
        if (draft.metadata && METADATA_KEYS.TOKEN in draft.metadata) {
          delete draft.metadata[METADATA_KEYS.TOKEN];
        }
      }
    });
  }
}

export async function syncInstancesToObrItems(
  instances: TokenInstance[],
  sheetsById: Map<string, CreatureSheet>,
): Promise<void> {
  if (!OBR.isAvailable || instances.length === 0) return;

  const payloadByItemId = new Map<string, ReturnType<typeof projectTokenForPlayers>>();
  for (const inst of instances) {
    const sheet = sheetsById.get(inst.templateId);
    payloadByItemId.set(inst.boundItemId, projectTokenForPlayers(inst, sheet));
  }

  const ids = Array.from(payloadByItemId.keys());
  await OBR.scene.items.updateItems(ids, (drafts) => {
    for (const draft of drafts) {
      const nextProj = payloadByItemId.get(draft.id);
      if (nextProj) {
        draft.metadata[METADATA_KEYS.TOKEN] = nextProj;
      }
    }
  });
}

export async function focusTokenOnMap(itemId: string): Promise<void> {
  if (!OBR.isAvailable) return;
  await OBR.player.select([itemId]);
  const bounds = await OBR.scene.items.getItemBounds([itemId]);
  const pad = 160;
  await OBR.viewport.animateToBounds({
    min: { x: bounds.min.x - pad, y: bounds.min.y - pad },
    max: { x: bounds.max.x + pad, y: bounds.max.y + pad },
    center: bounds.center,
    width: bounds.width + pad * 2,
    height: bounds.height + pad * 2,
  });
}

export async function openSheetModal(params: {
  sheetId?: string;
  itemId?: string;
  mode?: "view" | "edit";
}): Promise<void> {
  if (!OBR.isAvailable) return;
  const query = new URLSearchParams();
  query.set("view", "sheet");
  if (params.sheetId) query.set("sheetId", params.sheetId);
  if (params.itemId) query.set("itemId", params.itemId);
  if (params.mode) query.set("mode", params.mode);

  await OBR.modal.open({
    id: getPluginId("sheet-modal"),
    url: resolveExtensionUrl(`src/modal/modal.html?${query.toString()}`),
    width: 920,
    height: 700,
  });
}

export async function openBindModal(itemIds: string[]): Promise<void> {
  if (!OBR.isAvailable || itemIds.length === 0) return;
  const query = new URLSearchParams();
  query.set("view", "bind");
  query.set("itemIds", itemIds.join(","));

  await OBR.modal.open({
    id: getPluginId("bind-modal"),
    url: resolveExtensionUrl(`src/modal/modal.html?${query.toString()}`),
    width: 560,
    height: 620,
  });
}

export async function closeModalById(id: string): Promise<void> {
  if (!OBR.isAvailable) return;
  await OBR.modal.close(id);
}

export async function notifyObr(
  message: string,
  variant: "DEFAULT" | "ERROR" | "INFO" | "SUCCESS" | "WARNING" = "INFO",
): Promise<void> {
  if (!OBR.isAvailable) return;
  try {
    await OBR.notification.show(message, variant);
  } catch {
    // ignora caso notificações estejam indisponíveis
  }
}

export function copySceneSettingsMetadataPatch(
  existingSceneMetadata: Metadata,
  patch: Record<string, unknown>,
): Metadata {
  const prev =
    (existingSceneMetadata[METADATA_KEYS.SCENE_SETTINGS] as Record<
      string,
      unknown
    >) ?? {};
  return {
    [METADATA_KEYS.SCENE_SETTINGS]: {
      ...prev,
      ...patch,
    },
  };
}
