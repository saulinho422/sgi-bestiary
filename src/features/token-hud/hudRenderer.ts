import OBR, {
  type AttachmentBehavior,
  type Image,
  type Item,
} from "@owlbear-rodeo/sdk";
import {
  safeBuildCurve as buildCurve,
  safeBuildLabel as buildLabel,
  safeBuildShape as buildShape,
  safeBuildText as buildText,
} from "@/integrations/owlbear/itemBuilders";
import type { HudSettings } from "@/domain/entities/settings";
import type {
  PublicTokenProjection,
  TokenInstance,
} from "@/domain/entities/tokenInstance";
import { LOCAL_ITEM_PREFIX } from "@/utils/pluginId";
import {
  computeHudLayoutGeometry,
  createRoundedRectPoints,
  createShieldPolygonPoints,
  getFillPortion,
  getHealthBarColor,
} from "./hudMath";

const DISABLE_BEHAVIORS: AttachmentBehavior[] = [
  "ROTATION",
  "VISIBLE",
  "COPY",
  "SCALE",
];

const HUD_FONT = "Inter, Roboto, sans-serif";

export interface HudRenderableView {
  item: Image;
  displayName?: string;
  hpRatio?: number;
  currentHp?: number;
  maxHp?: number;
  tempHp?: number;
  armorClass?: number;
  conditions: Array<{
    id: string;
    code: string;
    color: string;
    name: string;
  }>;
  concentrating: boolean;
  showBar: boolean;
  showPercent: boolean;
  showExactHp: boolean;
  showTempHp: boolean;
  showAc: boolean;
  showConditions: boolean;
  showName: boolean;
}

export function buildHudViewForViewer(params: {
  item: Image;
  role: "GM" | "PLAYER";
  settings: HudSettings;
  gmInstance?: TokenInstance;
  gmTemplateName?: string;
  publicProjection?: PublicTokenProjection | null;
}): HudRenderableView | null {
  const { item, role, settings, gmInstance, gmTemplateName, publicProjection } =
    params;

  if (role === "GM" && gmInstance) {
    const maxHp = Math.max(1, gmInstance.maxHp);
    const ratio = Math.max(0, Math.min(1, gmInstance.currentHp / maxHp));
    return {
      item,
      displayName: gmInstance.individualName || gmTemplateName || item.name || "Criatura",
      hpRatio: ratio,
      currentHp: gmInstance.currentHp,
      maxHp,
      tempHp: gmInstance.tempHp,
      armorClass: gmInstance.armorClass,
      conditions: gmInstance.conditions.map((c) => ({
        id: c.id,
        code: c.code,
        color: c.color,
        name: c.name,
      })),
      concentrating: Boolean(gmInstance.concentratingOn),
      showBar:
        settings.showHealthBar &&
        settings.healthDisplayMode !== "none" &&
        settings.healthDisplayMode !== "condition-only",
      showPercent: settings.healthDisplayMode === "bar-percent",
      showExactHp: settings.healthDisplayMode === "bar-exact",
      showTempHp: settings.showTempHp && gmInstance.tempHp > 0,
      showAc: settings.showAcShield,
      showConditions: settings.showConditions,
      showName: settings.showNameTag,
    };
  }

  if (!publicProjection) return null;

  const vis = publicProjection.visibility;
  const barAllowed =
    settings.showHealthBar &&
    settings.healthDisplayMode !== "none" &&
    settings.healthDisplayMode !== "condition-only" &&
    (vis.publicHealthBar || vis.publicHealthPercent || vis.publicExactHp);

  return {
    item,
    displayName: vis.publicName ? publicProjection.publicName : undefined,
    hpRatio: publicProjection.hpRatio,
    currentHp: vis.publicExactHp ? publicProjection.currentHp : undefined,
    maxHp: vis.publicExactHp ? publicProjection.maxHp : undefined,
    tempHp: vis.publicTempHp ? publicProjection.tempHp : undefined,
    armorClass: vis.publicArmorClass ? publicProjection.armorClass : undefined,
    conditions: vis.publicConditions
      ? publicProjection.conditions.map((c) => ({
          id: c.id,
          code: c.code,
          color: c.color,
          name: c.name,
        }))
      : [],
    concentrating: vis.publicConditions && publicProjection.concentrating,
    showBar: barAllowed && publicProjection.hpRatio !== undefined,
    showPercent:
      barAllowed &&
      (settings.healthDisplayMode === "bar-percent" ||
        (!vis.publicExactHp && vis.publicHealthPercent)),
    showExactHp:
      barAllowed &&
      vis.publicExactHp &&
      settings.healthDisplayMode === "bar-exact",
    showTempHp:
      settings.showTempHp &&
      vis.publicTempHp &&
      (publicProjection.tempHp ?? 0) > 0,
    showAc:
      settings.showAcShield &&
      vis.publicArmorClass &&
      publicProjection.armorClass !== undefined,
    showConditions: settings.showConditions && vis.publicConditions,
    showName:
      settings.showNameTag &&
      vis.publicName &&
      Boolean(publicProjection.publicName),
  };
}

export function computeHudFingerprint(
  view: HudRenderableView,
  sceneDpi: number,
  settings: HudSettings,
): string {
  const { item } = view;
  return JSON.stringify({
    p: [item.position.x, item.position.y],
    s: [item.scale.x, item.scale.y],
    r: item.rotation,
    g: [item.grid.dpi, item.grid.offset.x, item.grid.offset.y],
    w: [item.image.width, item.image.height],
    v: item.visible,
    dpi: sceneDpi,
    view: {
      n: view.displayName,
      hr: view.hpRatio,
      ch: view.currentHp,
      mh: view.maxHp,
      th: view.tempHp,
      ac: view.armorClass,
      c: view.conditions.map((c) => `${c.code}:${c.color}`).join(","),
      conc: view.concentrating,
      flags: [
        view.showBar,
        view.showPercent,
        view.showExactHp,
        view.showTempHp,
        view.showAc,
        view.showConditions,
        view.showName,
      ],
    },
    cfg: settings,
  });
}

export function hudItemId(tokenId: string, part: string): string {
  return `${LOCAL_ITEM_PREFIX}${tokenId}.${part}`;
}

export function isSgiHudLocalItemId(itemId: string): boolean {
  return itemId.startsWith(LOCAL_ITEM_PREFIX);
}

/**
 * Extrai o ID do token associado a um item local de HUD pelo formato padrão
 * `com.sgi.bestiary.hud.<tokenId>.<part>`. Permite identificar órfãos mesmo se
 * `attachedTo` estiver ausente ou o cache interno estiver vazio/desatualizado.
 */
export function extractTokenIdFromHudItemId(itemId: string): string | null {
  if (!isSgiHudLocalItemId(itemId)) return null;
  const suffix = itemId.slice(LOCAL_ITEM_PREFIX.length);
  const lastDot = suffix.lastIndexOf(".");
  if (lastDot <= 0) return null;
  return suffix.slice(0, lastDot);
}

export function resolveTokenIdFromHudLocalItem(
  localItem: Pick<Item, "id" | "attachedTo">,
): string | null {
  return localItem.attachedTo ?? extractTokenIdFromHudItemId(localItem.id);
}

/**
 * Constrói os itens locais de HUD do Owlbear Rodeo para um único token.
 */
export function buildHudItemsForToken(
  view: HudRenderableView,
  sceneDpi: number,
  settings: HudSettings,
): Item[] {
  const { item } = view;
  const items: Item[] = [];
  const geo = computeHudLayoutGeometry(item, sceneDpi, settings);
  const opacity = Math.max(0.2, Math.min(1, settings.opacity));

  // 1. Barra de Vida (Fundo + Preenchimento + Segmento Azul de PV Temporários + Texto)
  if (view.showBar && view.hpRatio !== undefined) {
    const cornerRadius = geo.barHeight * 0.5;
    const fillPortion = getFillPortion(view.hpRatio, settings.segments);
    const barColor = getHealthBarColor(view.hpRatio, settings);

    items.push(
      buildCurve()
        .id(hudItemId(item.id, "hp-bg"))
        .attachedTo(item.id)
        .layer("ATTACHMENT")
        .locked(true)
        .disableHit(true)
        .disableAttachmentBehavior(DISABLE_BEHAVIORS)
        .visible(item.visible)
        .position(geo.barTopLeft)
        .zIndex(10000)
        .fillColor("#0f172a")
        .fillOpacity(Math.min(0.85, opacity))
        .strokeColor("#475569")
        .strokeOpacity(0.7)
        .strokeWidth(1)
        .tension(0)
        .closed(true)
        .points(createRoundedRectPoints(geo.barWidth, geo.barHeight, cornerRadius, 1))
        .build(),
    );

    if (fillPortion > 0) {
      const fillPoints = createRoundedRectPoints(
        geo.barWidth,
        geo.barHeight,
        cornerRadius,
        fillPortion,
      );
      if (fillPoints.length >= 3) {
        items.push(
          buildCurve()
            .id(hudItemId(item.id, "hp-fill"))
            .attachedTo(item.id)
            .layer("ATTACHMENT")
            .locked(true)
            .disableHit(true)
            .disableAttachmentBehavior(DISABLE_BEHAVIORS)
            .visible(item.visible)
            .position(geo.barTopLeft)
            .zIndex(10010)
            .fillColor(barColor)
            .fillOpacity(Math.min(0.88, opacity))
            .strokeWidth(0)
            .strokeOpacity(0)
            .tension(0)
            .closed(true)
            .points(fillPoints)
            .build(),
        );
      }
    }

    // Faixa azul independente para PV temporários (não mistura com maxHp)
    if (view.showTempHp && view.tempHp && view.tempHp > 0 && view.maxHp) {
      const tempRatio = Math.max(0.08, Math.min(0.65, view.tempHp / view.maxHp));
      const stripHeight = Math.max(3, Math.round(geo.barHeight * 0.24));
      const stripWidth = Math.max(10, geo.barWidth * tempRatio);
      items.push(
        buildShape()
          .id(hudItemId(item.id, "thp-strip"))
          .attachedTo(item.id)
          .layer("ATTACHMENT")
          .shapeType("RECTANGLE")
          .width(stripWidth)
          .height(stripHeight)
          .position({
            x: geo.barTopLeft.x + 2,
            y: geo.barTopLeft.y - stripHeight - 1,
          })
          .zIndex(10020)
          .fillColor(settings.colorThresholds.tempHpColor)
          .fillOpacity(0.95)
          .strokeWidth(0)
          .locked(true)
          .disableHit(true)
          .disableAttachmentBehavior(DISABLE_BEHAVIORS)
          .visible(item.visible)
          .build(),
      );
    }

    let hpLabel = "";
    if (view.showExactHp && view.currentHp !== undefined && view.maxHp !== undefined) {
      hpLabel =
        view.showTempHp && view.tempHp
          ? `${view.currentHp}/${view.maxHp} (+${view.tempHp})`
          : `${view.currentHp}/${view.maxHp}`;
    } else if (view.showPercent) {
      hpLabel = `${Math.round(view.hpRatio * 100)}%`;
    }

    if (hpLabel) {
      const fontSize = Math.max(10, Math.round(geo.barHeight * 0.78));
      items.push(
        buildText()
          .id(hudItemId(item.id, "hp-text"))
          .attachedTo(item.id)
          .layer("TEXT")
          .locked(true)
          .disableHit(true)
          .disableAttachmentBehavior(DISABLE_BEHAVIORS)
          .visible(item.visible)
          .position({
            x: geo.barTopLeft.x,
            y: geo.barTopLeft.y - 0.5,
          })
          .width(geo.barWidth)
          .height(geo.barHeight + 2)
          .plainText(hpLabel)
          .textType("PLAIN")
          .textAlign("CENTER")
          .textAlignVertical("MIDDLE")
          .fontSize(fontSize)
          .fontWeight(700)
          .fontFamily(HUD_FONT)
          .fillColor("#f8fafc")
          .fillOpacity(1)
          .strokeColor("#020617")
          .strokeWidth(2)
          .strokeOpacity(0.85)
          .zIndex(10030)
          .build(),
      );
    }
  }

  // 2. Escudo de CA
  if (view.showAc && view.armorClass !== undefined) {
    const shieldW = Math.round(24 * settings.iconScale);
    const shieldH = Math.round(26 * settings.iconScale);
    const topLeft = {
      x: geo.acCenter.x - shieldW * 0.5,
      y: geo.acCenter.y - shieldH * 0.5,
    };

    items.push(
      buildCurve()
        .id(hudItemId(item.id, "ac-bg"))
        .attachedTo(item.id)
        .layer("ATTACHMENT")
        .locked(true)
        .disableHit(true)
        .disableAttachmentBehavior(DISABLE_BEHAVIORS)
        .visible(item.visible)
        .position(topLeft)
        .zIndex(10040)
        .fillColor("#1e3a8a")
        .fillOpacity(Math.min(0.92, opacity))
        .strokeColor("#93c5fd")
        .strokeOpacity(0.95)
        .strokeWidth(1.5)
        .tension(0)
        .closed(true)
        .points(createShieldPolygonPoints(shieldW, shieldH))
        .build(),
      buildText()
        .id(hudItemId(item.id, "ac-text"))
        .attachedTo(item.id)
        .layer("TEXT")
        .locked(true)
        .disableHit(true)
        .disableAttachmentBehavior(DISABLE_BEHAVIORS)
        .visible(item.visible)
        .position({ x: topLeft.x, y: topLeft.y - 1 })
        .width(shieldW)
        .height(shieldH)
        .plainText(String(view.armorClass))
        .textType("PLAIN")
        .textAlign("CENTER")
        .textAlignVertical("MIDDLE")
        .fontSize(Math.round(12 * settings.iconScale))
        .fontWeight(700)
        .fontFamily(HUD_FONT)
        .fillColor("#ffffff")
        .fillOpacity(1)
        .zIndex(10045)
        .build(),
    );
  }

  // 3. Marcador separado de PV Temporários
  if (view.showTempHp && view.tempHp && view.tempHp > 0) {
    const badgeSize = Math.round(22 * settings.iconScale);
    const thpCenter = view.showAc ? geo.tempHpCenter : geo.acCenter;
    items.push(
      buildShape()
        .id(hudItemId(item.id, "thp-bg"))
        .attachedTo(item.id)
        .layer("ATTACHMENT")
        .shapeType("CIRCLE")
        .width(badgeSize)
        .height(badgeSize)
        .position(thpCenter)
        .zIndex(10040)
        .fillColor("#0284c7")
        .fillOpacity(0.92)
        .strokeColor("#bae6fd")
        .strokeWidth(1.4)
        .strokeOpacity(0.9)
        .locked(true)
        .disableHit(true)
        .disableAttachmentBehavior(DISABLE_BEHAVIORS)
        .visible(item.visible)
        .build(),
      buildText()
        .id(hudItemId(item.id, "thp-text"))
        .attachedTo(item.id)
        .layer("TEXT")
        .locked(true)
        .disableHit(true)
        .disableAttachmentBehavior(DISABLE_BEHAVIORS)
        .visible(item.visible)
        .position({
          x: thpCenter.x - badgeSize * 0.5,
          y: thpCenter.y - badgeSize * 0.5,
        })
        .width(badgeSize)
        .height(badgeSize)
        .plainText(`+${view.tempHp}`)
        .textType("PLAIN")
        .textAlign("CENTER")
        .textAlignVertical("MIDDLE")
        .fontSize(Math.round(10 * settings.iconScale))
        .fontWeight(700)
        .fontFamily(HUD_FONT)
        .fillColor("#ffffff")
        .zIndex(10046)
        .build(),
    );
  }

  // 4. Condições & Concentração (ícones + código textual acessível)
  if (view.showConditions) {
    const badges: Array<{ code: string; color: string }> = [];
    if (settings.showConcentrationBadge && view.concentrating) {
      badges.push({ code: "C", color: "#d97706" });
    }
    const maxBadges = 4;
    const visibleConds = view.conditions.slice(0, maxBadges);
    for (const c of visibleConds) {
      badges.push({ code: c.code.slice(0, 3), color: c.color });
    }
    if (view.conditions.length > maxBadges) {
      badges.push({
        code: `+${view.conditions.length - maxBadges}`,
        color: "#475569",
      });
    }

    const badgeD = Math.round(20 * settings.iconScale);
    const gap = 3;
    badges.forEach((b, idx) => {
      const cx = geo.conditionRowStart.x + badgeD * 0.5 + idx * (badgeD + gap);
      const cy = geo.conditionRowStart.y + badgeD * 0.5;
      items.push(
        buildShape()
          .id(hudItemId(item.id, `cond-bg-${idx}`))
          .attachedTo(item.id)
          .layer("ATTACHMENT")
          .shapeType("CIRCLE")
          .width(badgeD)
          .height(badgeD)
          .position({ x: cx, y: cy })
          .zIndex(10050)
          .fillColor(b.color)
          .fillOpacity(0.95)
          .strokeColor("#0f172a")
          .strokeWidth(1.5)
          .strokeOpacity(0.95)
          .locked(true)
          .disableHit(true)
          .disableAttachmentBehavior(DISABLE_BEHAVIORS)
          .visible(item.visible)
          .build(),
        buildText()
          .id(hudItemId(item.id, `cond-tx-${idx}`))
          .attachedTo(item.id)
          .layer("TEXT")
          .locked(true)
          .disableHit(true)
          .disableAttachmentBehavior(DISABLE_BEHAVIORS)
          .visible(item.visible)
          .position({ x: cx - badgeD * 0.5, y: cy - badgeD * 0.5 })
          .width(badgeD)
          .height(badgeD)
          .plainText(b.code)
          .textType("PLAIN")
          .textAlign("CENTER")
          .textAlignVertical("MIDDLE")
          .fontSize(Math.max(7, Math.round(8.5 * settings.iconScale)))
          .fontWeight(700)
          .fontFamily(HUD_FONT)
          .fillColor("#ffffff")
          .strokeColor("#020617")
          .strokeWidth(1.2)
          .zIndex(10055)
          .build(),
      );
    });
  }

  // 5. Nome do token
  if (view.showName && view.displayName) {
    items.push(
      buildLabel()
        .id(hudItemId(item.id, "name"))
        .attachedTo(item.id)
        .layer("TEXT")
        .locked(true)
        .disableHit(true)
        .disableAttachmentBehavior(DISABLE_BEHAVIORS)
        .visible(item.visible)
        .position(geo.namePosition)
        .plainText(view.displayName)
        .fontFamily(HUD_FONT)
        .fontSize(15)
        .fontWeight(600)
        .pointerHeight(0)
        .pointerDirection(geo.namePointerDirection)
        .backgroundColor("#0f172a")
        .backgroundOpacity(0.75)
        .fillColor("#f8fafc")
        .fillOpacity(0.95)
        .cornerRadius(6)
        .padding(4)
        .minViewScale(settings.zoomMinScale)
        .maxViewScale(1.4)
        .zIndex(10060)
        .build(),
    );
  }

  return items;
}

export interface TokenHudSnapshotEntry {
  fingerprint: string;
  itemIds: string[];
}

export interface ReconciliationPlan {
  deleteIds: string[];
  addItems: Item[];
  nextCache: Map<string, TokenHudSnapshotEntry>;
  changedTokenCount: number;
  removedTokenCount: number;
}

/**
 * Calcula reconciliação incremental pura: somente tokens novos/alterados/removidos
 * geram alterações em `OBR.scene.local`.
 */
export function planHudReconciliation(params: {
  views: HudRenderableView[];
  previousCache: Map<string, TokenHudSnapshotEntry>;
  sceneDpi: number;
  settings: HudSettings;
}): ReconciliationPlan {
  const { views, previousCache, sceneDpi, settings } = params;
  const deleteIds: string[] = [];
  const addItems: Item[] = [];
  const nextCache = new Map<string, TokenHudSnapshotEntry>();
  const activeIds = new Set<string>();

  let changedTokenCount = 0;
  let removedTokenCount = 0;

  for (const view of views) {
    const tokenId = view.item.id;
    activeIds.add(tokenId);
    const fingerprint = computeHudFingerprint(view, sceneDpi, settings);
    const prev = previousCache.get(tokenId);

    if (prev && prev.fingerprint === fingerprint) {
      nextCache.set(tokenId, prev);
      continue;
    }

    changedTokenCount++;
    if (prev) {
      deleteIds.push(...prev.itemIds);
    }

    const built = buildHudItemsForToken(view, sceneDpi, settings);
    if (built.length > 0) {
      addItems.push(...built);
      nextCache.set(tokenId, {
        fingerprint,
        itemIds: built.map((i) => i.id),
      });
    }
  }

  for (const [oldTokenId, entry] of previousCache.entries()) {
    if (!activeIds.has(oldTokenId)) {
      removedTokenCount++;
      deleteIds.push(...entry.itemIds);
    }
  }

  return {
    deleteIds,
    addItems,
    nextCache,
    changedTokenCount,
    removedTokenCount,
  };
}

export interface HudDebugEvent {
  timestamp: string;
  event:
    | "reconcile-abort-stale"
    | "orphan-cleanup"
    | "delete-items"
    | "add-items"
    | "discard-stale-add"
    | "reset-cache"
    | "clear-all-local";
  generation: number;
  details?: Record<string, unknown>;
}

export interface ReconcileHudParams {
  views: HudRenderableView[];
  sceneDpi: number;
  settings: HudSettings;
  forceFullCleanup?: boolean;
  /** Geração capturada antes de enfileirar; se mudar, a tarefa é descartada com segurança. */
  expectedGeneration?: number;
  /** Verificação leve se o snapshot já foi substituído por outro mais recente. */
  isStale?: () => boolean;
  /** Revalida contra os itens vivos na cena ativa antes de adicionar novos indicadores. */
  verifyActiveTokenIds?: () => Promise<Set<string> | null>;
}

export class TacticalHudRenderer {
  private cache = new Map<string, TokenHudSnapshotEntry>();
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;
  private debugLogger: ((entry: HudDebugEvent) => void) | null = null;
  private debugHistory: HudDebugEvent[] = [];

  setDebugLogger(logger: ((entry: HudDebugEvent) => void) | null): void {
    this.debugLogger = logger;
  }

  getDebugHistory(): HudDebugEvent[] {
    return [...this.debugHistory];
  }

  clearDebugHistory(): void {
    this.debugHistory = [];
  }

  getCachedTokenIds(): string[] {
    return Array.from(this.cache.keys());
  }

  getGeneration(): number {
    return this.generation;
  }

  private emitDebug(
    event: HudDebugEvent["event"],
    generation: number,
    details?: Record<string, unknown>,
  ): void {
    const entry: HudDebugEvent = {
      timestamp: new Date().toISOString(),
      event,
      generation,
      details,
    };
    this.debugHistory.push(entry);
    if (this.debugHistory.length > 60) {
      this.debugHistory.shift();
    }
    this.debugLogger?.(entry);
    if (
      typeof globalThis !== "undefined" &&
      (globalThis as Record<string, unknown>).__SGI_HUD_DEBUG__ === true
    ) {
      console.debug(`[SGI HUD][gen=${generation}] ${event}`, details ?? {});
    }
  }

  /**
   * Invalida todas as reconciliações em andamento e limpa o cache em memória.
   */
  resetCache(): number {
    this.generation += 1;
    this.cache.clear();
    this.emitDebug("reset-cache", this.generation);
    return this.generation;
  }

  /**
   * Remove todos os itens locais do SGI na cena atual (se pronta) e invalida o cache.
   */
  async clearAllLocalHudItems(): Promise<number> {
    const gen = this.resetCache();
    if (!OBR.isAvailable) return 0;
    try {
      if (!(await OBR.scene.isReady())) return 0;
      const locals = await OBR.scene.local.getItems((it) =>
        isSgiHudLocalItemId(it.id),
      );
      const ids = locals.map((i) => i.id);
      if (ids.length > 0) {
        await OBR.scene.local.deleteItems(ids);
      }
      this.emitDebug("clear-all-local", gen, { removedCount: ids.length });
      return ids.length;
    } catch {
      return 0;
    }
  }

  /**
   * Remove de `OBR.scene.local` todos os indicadores com prefixo do SGI cujo token
   * não esteja em `activeTokenIds` (independentemente do cache interno).
   * Nunca toca itens de outras extensões.
   */
  async cleanupOrphanedLocalItems(activeTokenIds?: Set<string>): Promise<number> {
    if (!OBR.isAvailable) return 0;
    try {
      if (!(await OBR.scene.isReady())) return 0;
    } catch {
      return 0;
    }

    const locals = await OBR.scene.local.getItems((item) =>
      isSgiHudLocalItemId(item.id),
    );
    const orphanIds: string[] = [];
    const orphanTokenIds = new Set<string>();

    for (const localItem of locals) {
      const tokenId = resolveTokenIdFromHudLocalItem(localItem);
      if (!activeTokenIds || !tokenId || !activeTokenIds.has(tokenId)) {
        orphanIds.push(localItem.id);
        if (tokenId) orphanTokenIds.add(tokenId);
      }
    }

    if (orphanIds.length > 0) {
      await OBR.scene.local.deleteItems(orphanIds);
      for (const orphanTok of orphanTokenIds) {
        this.cache.delete(orphanTok);
      }
      this.emitDebug("orphan-cleanup", this.generation, {
        removedCount: orphanIds.length,
        orphanTokenIds: Array.from(orphanTokenIds),
      });
    }
    return orphanIds.length;
  }

  private async defaultVerifyActiveTokenIds(): Promise<Set<string> | null> {
    if (!OBR.isAvailable) return null;
    try {
      if (!(await OBR.scene.isReady())) return null;
      const liveItems = await OBR.scene.items.getItems(
        (it) =>
          it.type === "IMAGE" &&
          (it.layer === "CHARACTER" || it.layer === "MOUNT"),
      );
      return new Set(liveItems.map((it) => it.id));
    } catch {
      return null;
    }
  }

  reconcile(params: ReconcileHudParams): Promise<ReconciliationPlan> {
    const run = async (): Promise<ReconciliationPlan> => {
      const capturedGen = params.expectedGeneration ?? this.generation;
      const isAborted = (): boolean =>
        capturedGen !== this.generation || Boolean(params.isStale?.());

      const emptyAbortPlan = (): ReconciliationPlan => ({
        deleteIds: [],
        addItems: [],
        nextCache: new Map(this.cache),
        changedTokenCount: 0,
        removedTokenCount: 0,
      });

      if (isAborted()) {
        this.emitDebug("reconcile-abort-stale", capturedGen, { stage: "start" });
        return emptyAbortPlan();
      }

      const desiredTokenIds = new Set(params.views.map((v) => v.item.id));

      if (!OBR.isAvailable) {
        const plan = planHudReconciliation({
          views: params.views,
          previousCache: this.cache,
          sceneDpi: params.sceneDpi,
          settings: params.settings,
        });
        this.cache = plan.nextCache;
        return plan;
      }

      if (!(await OBR.scene.isReady()) || isAborted()) {
        this.emitDebug("reconcile-abort-stale", capturedGen, {
          stage: "scene-not-ready",
        });
        return emptyAbortPlan();
      }

      // Sempre lê os itens locais do SGI para limpeza independente do cache interno
      const existingLocals = await OBR.scene.local.getItems((it) =>
        isSgiHudLocalItemId(it.id),
      );

      if (isAborted()) {
        this.emitDebug("reconcile-abort-stale", capturedGen, {
          stage: "after-local-read",
        });
        return emptyAbortPlan();
      }

      let workingPlan: ReconciliationPlan;
      const deleteIdSet = new Set<string>();

      if (params.forceFullCleanup) {
        for (const localItem of existingLocals) {
          deleteIdSet.add(localItem.id);
        }
        if (deleteIdSet.size > 0) {
          const toDelete = Array.from(deleteIdSet);
          await OBR.scene.local.deleteItems(toDelete);
          this.emitDebug("delete-items", capturedGen, {
            mode: "forceFullCleanup",
            count: toDelete.length,
          });
        }
        this.cache.clear();
        if (isAborted()) {
          this.emitDebug("reconcile-abort-stale", capturedGen, {
            stage: "after-full-delete",
          });
          return emptyAbortPlan();
        }
        workingPlan = planHudReconciliation({
          views: params.views,
          previousCache: this.cache,
          sceneDpi: params.sceneDpi,
          settings: params.settings,
        });
      } else {
        workingPlan = planHudReconciliation({
          views: params.views,
          previousCache: this.cache,
          sceneDpi: params.sceneDpi,
          settings: params.settings,
        });

        for (const id of workingPlan.deleteIds) {
          deleteIdSet.add(id);
        }

        // Token IDs que precisam ser reconstruídos neste ciclo
        const rebuildingTokenIds = new Set<string>();
        for (const view of params.views) {
          const fp = computeHudFingerprint(view, params.sceneDpi, params.settings);
          const prev = this.cache.get(view.item.id);
          if (!prev || prev.fingerprint !== fp) {
            rebuildingTokenIds.add(view.item.id);
          }
        }

        // Inspeção independente de cache em OBR.scene.local:
        // 1) Remove imediatamente qualquer item órfão cujo token não está em desiredTokenIds.
        // 2) Remove resíduos de tokens reconstruídos caso o cache estivesse desatualizado.
        const orphanLocalIds: string[] = [];
        for (const localItem of existingLocals) {
          const tokId = resolveTokenIdFromHudLocalItem(localItem);
          if (!tokId || !desiredTokenIds.has(tokId)) {
            deleteIdSet.add(localItem.id);
            orphanLocalIds.push(localItem.id);
            if (tokId) this.cache.delete(tokId);
          } else if (rebuildingTokenIds.has(tokId)) {
            deleteIdSet.add(localItem.id);
          }
        }

        if (orphanLocalIds.length > 0) {
          this.emitDebug("orphan-cleanup", capturedGen, {
            mode: "cache-independent-reconcile",
            count: orphanLocalIds.length,
          });
        }

        if (deleteIdSet.size > 0) {
          const toDelete = Array.from(deleteIdSet);
          await OBR.scene.local.deleteItems(toDelete);
          for (const cachedTokId of Array.from(this.cache.keys())) {
            if (!desiredTokenIds.has(cachedTokId)) {
              this.cache.delete(cachedTokId);
            }
          }
          this.emitDebug("delete-items", capturedGen, {
            mode: "incremental",
            count: toDelete.length,
          });
        }

        if (isAborted()) {
          this.emitDebug("reconcile-abort-stale", capturedGen, {
            stage: "after-incremental-delete",
          });
          return emptyAbortPlan();
        }
      }

      if (workingPlan.addItems.length === 0) {
        if (!isAborted()) {
          this.cache = workingPlan.nextCache;
        }
        return {
          ...workingPlan,
          deleteIds: Array.from(deleteIdSet),
        };
      }

      // Antes de adicionar qualquer HUD novo, revalida contra os tokens realmente vivos na cena!
      const liveValidIds = params.verifyActiveTokenIds
        ? await params.verifyActiveTokenIds()
        : await this.defaultVerifyActiveTokenIds();

      if (isAborted() || liveValidIds === null) {
        this.emitDebug("discard-stale-add", capturedGen, {
          reason: liveValidIds === null ? "scene-invalid" : "stale-generation",
          discardedAddCount: workingPlan.addItems.length,
        });
        return emptyAbortPlan();
      }

      const safeAddItems: Item[] = [];
      const rejectedTokenIds = new Set<string>();
      for (const candidate of workingPlan.addItems) {
        const tokId = resolveTokenIdFromHudLocalItem(candidate);
        if (tokId && liveValidIds.has(tokId)) {
          safeAddItems.push(candidate);
        } else {
          if (tokId) rejectedTokenIds.add(tokId);
        }
      }

      if (rejectedTokenIds.size > 0) {
        this.emitDebug("discard-stale-add", capturedGen, {
          reason: "token-missing-from-live-scene",
          rejectedTokenIds: Array.from(rejectedTokenIds),
        });
        for (const badTokId of rejectedTokenIds) {
          workingPlan.nextCache.delete(badTokId);
        }
        // Garante remoção de eventuais locais remanescentes dos tokens rejeitados
        const staleRemainingIds = existingLocals
          .filter((it) => {
            const tokId = resolveTokenIdFromHudLocalItem(it);
            return Boolean(tokId && rejectedTokenIds.has(tokId));
          })
          .map((it) => it.id)
          .filter((id) => !deleteIdSet.has(id));
        if (staleRemainingIds.length > 0) {
          await OBR.scene.local.deleteItems(staleRemainingIds);
          for (const id of staleRemainingIds) deleteIdSet.add(id);
        }
      }

      if (isAborted()) {
        this.emitDebug("discard-stale-add", capturedGen, {
          reason: "aborted-before-addItems",
          discardedAddCount: safeAddItems.length,
        });
        return emptyAbortPlan();
      }

      if (safeAddItems.length > 0) {
        await OBR.scene.local.addItems(safeAddItems);
        this.emitDebug("add-items", capturedGen, {
          count: safeAddItems.length,
        });
      }

      if (!isAborted()) {
        this.cache = workingPlan.nextCache;
      }

      return {
        ...workingPlan,
        deleteIds: Array.from(deleteIdSet),
        addItems: safeAddItems,
      };
    };

    const next = this.queue.then(run, run);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
