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

export class TacticalHudRenderer {
  private cache = new Map<string, TokenHudSnapshotEntry>();
  private queue: Promise<void> = Promise.resolve();

  resetCache(): void {
    this.cache.clear();
  }

  async cleanupOrphanedLocalItems(activeTokenIds?: Set<string>): Promise<number> {
    if (!OBR.isAvailable) return 0;
    const locals = await OBR.scene.local.getItems((item) =>
      isSgiHudLocalItemId(item.id),
    );
    const orphanIds = locals
      .filter((localItem) => {
        if (!activeTokenIds) return true;
        return !localItem.attachedTo || !activeTokenIds.has(localItem.attachedTo);
      })
      .map((i) => i.id);

    if (orphanIds.length > 0) {
      await OBR.scene.local.deleteItems(orphanIds);
    }
    return orphanIds.length;
  }

  reconcile(params: {
    views: HudRenderableView[];
    sceneDpi: number;
    settings: HudSettings;
    forceFullCleanup?: boolean;
  }): Promise<ReconciliationPlan> {
    const run = async (): Promise<ReconciliationPlan> => {
      const plan = planHudReconciliation({
        views: params.views,
        previousCache: this.cache,
        sceneDpi: params.sceneDpi,
        settings: params.settings,
      });

      if (OBR.isAvailable) {
        if (params.forceFullCleanup) {
          const allLocals = await OBR.scene.local.getItems((it) =>
            isSgiHudLocalItemId(it.id),
          );
          const allLocalIds = allLocals.map((i) => i.id);
          if (allLocalIds.length > 0) {
            await OBR.scene.local.deleteItems(allLocalIds);
          }
          // Força reconstrução limpa após full cleanup
          this.cache.clear();
          const freshPlan = planHudReconciliation({
            views: params.views,
            previousCache: this.cache,
            sceneDpi: params.sceneDpi,
            settings: params.settings,
          });
          if (freshPlan.addItems.length > 0) {
            await OBR.scene.local.addItems(freshPlan.addItems);
          }
          this.cache = freshPlan.nextCache;
          return freshPlan;
        }

        if (plan.deleteIds.length > 0) {
          await OBR.scene.local.deleteItems(plan.deleteIds);
        }
        if (plan.addItems.length > 0) {
          await OBR.scene.local.addItems(plan.addItems);
        }
      }

      this.cache = plan.nextCache;
      return plan;
    };

    const next = this.queue.then(run, run);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
