import type { CreatureSheet, VisibilityPolicy } from "../entities/sheet";
import type { PublicTokenProjection, TokenInstance } from "../entities/tokenInstance";
import { DND5E_SYSTEM_DEFINITION } from "./dnd5eRules";
import type { SheetCategory } from "../types/rpgSystem";

export function getDefaultVisibilityForCategory(
  category: SheetCategory,
): VisibilityPolicy {
  return { ...DND5E_SYSTEM_DEFINITION.defaultVisibilityByCategory[category] };
}

export function formatSpeedSummary(sheet: CreatureSheet): string {
  const unit = sheet.speed.unit || "m";
  const parts: string[] = [];
  if (sheet.speed.walk !== null && sheet.speed.walk !== undefined) {
    parts.push(`${sheet.speed.walk} ${unit}`);
  }
  if (sheet.speed.fly) {
    parts.push(`voo ${sheet.speed.fly} ${unit}${sheet.speed.hover ? " (pairar)" : ""}`);
  }
  if (sheet.speed.swim) parts.push(`natação ${sheet.speed.swim} ${unit}`);
  if (sheet.speed.climb) parts.push(`escalada ${sheet.speed.climb} ${unit}`);
  if (sheet.speed.burrow) parts.push(`escavação ${sheet.speed.burrow} ${unit}`);
  if (sheet.speed.special) parts.push(sheet.speed.special);
  return parts.join(", ") || "—";
}

/**
 * Cria a projeção pública sanitizada que será armazenada nos metadados do Owlbear Rodeo.
 * NUNCA inclui notas privadas do mestre (notes.gm / gmNotes), CA oculta ou PV numéricos ocultos.
 */
export function projectTokenForPlayers(
  instance: TokenInstance,
  sheet?: CreatureSheet | null,
): PublicTokenProjection {
  const vis = instance.visibility;
  const maxHp = Math.max(1, instance.maxHp);
  const clampedHp = Math.max(0, Math.min(maxHp, instance.currentHp));

  const projection: PublicTokenProjection = {
    v: 1,
    instanceId: instance.instanceId,
    boundItemId: instance.boundItemId,
    templateId: instance.templateId,
    category: instance.category,
    visibility: { ...vis },
    conditions: vis.publicConditions
      ? instance.conditions
          .filter((c) => c.visibleToPlayers !== false)
          .map((c) => ({
            id: c.id,
            conditionId: c.conditionId,
            name: c.name,
            code: c.code,
            icon: c.icon,
            color: c.color,
            description: c.description,
            durationUnit: c.durationUnit,
            remainingRounds: c.remainingRounds,
          }))
      : [],
    concentrating: vis.publicConditions && Boolean(instance.concentratingOn),
    syncedAt: new Date().toISOString(),
  };

  if (vis.publicName) {
    projection.publicName =
      instance.individualName?.trim() || sheet?.name || "Criatura";
  }

  // Se o mestre ocultou PV exatos mas liberou barra/porcentagem, transmite APENAS a proporção [0..1]
  if (vis.publicHealthBar || vis.publicHealthPercent || vis.publicExactHp) {
    projection.hpRatio = Number((clampedHp / maxHp).toFixed(4));
  }

  if (vis.publicExactHp) {
    projection.currentHp = clampedHp;
    projection.maxHp = maxHp;
  }

  if (vis.publicTempHp) {
    projection.tempHp = Math.max(0, instance.tempHp);
  }

  if (vis.publicArmorClass) {
    projection.armorClass = instance.armorClass;
  }

  if (vis.publicSummarySheet && sheet) {
    projection.summarySnapshot = {
      name: vis.publicName ? instance.individualName || sheet.name : "Criatura Desconhecida",
      size: sheet.size,
      creatureType: sheet.creatureType,
      challengeRating: sheet.challengeRating,
      speedSummary: formatSpeedSummary(sheet),
      description: sheet.description,
      publicNotes: sheet.notes.public,
    };
  }

  if (vis.publicFullSheet && sheet) {
    // Deep clone explícito garantindo remoção absoluta de notes.gm
    const sanitized = structuredClone(sheet);
    sanitized.notes = {
      public: sheet.notes.public,
      gm: "",
    };
    projection.fullSheetSnapshot = sanitized as PublicTokenProjection["fullSheetSnapshot"];
  }

  return projection;
}
