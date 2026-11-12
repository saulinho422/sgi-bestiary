import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Dices,
  ExternalLink,
  Flame,
  Plus,
  Shield,
  Sparkles,
  Swords,
  UserMinus,
  X,
} from "lucide-react";
import type { TempHpRuleMode } from "@/domain/entities/settings";
import type { CreatureSheet, FeatureEntry } from "@/domain/entities/sheet";
import type {
  CombatParticipant,
  TokenInstance,
} from "@/domain/entities/tokenInstance";
import { ABILITY_LABELS_PT, formatSigned } from "@/domain/rules/dnd5eRules";
import { performRoll } from "@/integrations/dice/diceService";
import type { InstanceHpMutation } from "@/services/instanceService";
import { useBestiaryStore } from "@/stores/useBestiaryStore";
import { cn } from "@/utils/cn";
import { Badge } from "../common/UiPrimitives";

export interface CombatTurnCardProps {
  instance: TokenInstance;
  sheet?: CreatureSheet;
  participant: CombatParticipant;
  isActiveTurn: boolean;
  isExpanded: boolean;
  hasSameInitAbove: boolean;
  hasSameInitBelow: boolean;
  isSelected: boolean;
  rollMode: "normal" | "advantage" | "disadvantage";
  rollVisibility: "public" | "gm-only";
  tempHpRule: TempHpRuleMode;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onSetInitiative: (value: number | null) => void;
  onRollIndividualInitiative: () => void;
  onAdjustTieOrder: (direction: "up" | "down") => void;
  onRemoveFromCombat: () => void;
  onOpenSheet: () => void;
  onHpMutation: (mutation: InstanceHpMutation) => void;
  onConsumeResource: (featureId: string, delta: number) => void;
  onToggleConcentration: () => void;
  onRemoveCondition: (conditionId: string) => void;
  onOpenConditionModal: () => void;
}

const RECHARGE_LABELS_PT: Record<string, string> = {
  "recharge-4-6": "Recarga 4–6",
  "recharge-5-6": "Recarga 5–6",
  "recharge-6": "Recarga 6",
  "short-rest": "Descanso Curto",
  "long-rest": "Descanso Longo",
  "per-day": "Por Dia",
  dawn: "Ao Amanhecer",
  turn: "Por Turno",
};

interface CategorizedFeature {
  feature: FeatureEntry;
  tag?: string;
}

function isAttackFeature(feat: FeatureEntry): boolean {
  return (
    typeof feat.attackBonus === "number" ||
    Boolean(feat.damage && feat.damage.length > 0)
  );
}

export function CombatTurnCard({
  instance,
  sheet,
  participant,
  isActiveTurn,
  isExpanded,
  hasSameInitAbove,
  hasSameInitBelow,
  isSelected,
  rollMode,
  rollVisibility,
  tempHpRule,
  onToggleSelect,
  onToggleExpand,
  onSetInitiative,
  onRollIndividualInitiative,
  onAdjustTieOrder,
  onRemoveFromCombat,
  onOpenSheet,
  onHpMutation,
  onConsumeResource,
  onToggleConcentration,
  onRemoveCondition,
  onOpenConditionModal,
}: CombatTurnCardProps) {
  const showToast = useBestiaryStore((s) => s.showToast);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const [initInput, setInitInput] = useState<string>(
    participant.initiative !== null ? String(participant.initiative) : "",
  );
  const [hpCmd, setHpCmd] = useState("");
  const [expandedFeatureIds, setExpandedFeatureIds] = useState<Set<string>>(
    new Set(),
  );
  const [showAbilities, setShowAbilities] = useState(false);
  const [showSpells, setShowSpells] = useState(false);

  useEffect(() => {
    setInitInput(
      participant.initiative !== null ? String(participant.initiative) : "",
    );
  }, [participant.initiative]);

  useEffect(() => {
    if (isActiveTurn) {
      cardRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [isActiveTurn]);

  const realCategory = sheet?.kind ?? instance.category;
  const isCharacter = realCategory === "character";
  const name = instance.individualName || sheet?.name || "Criatura";

  const statusText =
    instance.currentHp <= 0
      ? "Caído"
      : instance.currentHp <= instance.maxHp * 0.5
        ? "Ferido"
        : "Normal";

  const rollExpr = async (label: string, expression: string) => {
    try {
      await performRoll({
        actorName: name,
        label,
        expression,
        mode: rollMode,
        visibility: rollVisibility,
      });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Erro ao rolar expressão.",
        "error",
      );
    }
  };

  const toggleFeatureDetail = (id: string) => {
    setExpandedFeatureIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { attackEntries, abilityEntries, spellEntries } = useMemo(() => {
    if (!sheet) {
      return {
        attackEntries: [] as CategorizedFeature[],
        abilityEntries: [] as CategorizedFeature[],
        spellEntries: [] as FeatureEntry[],
      };
    }

    const attacks: CategorizedFeature[] = [];
    const abilities: CategorizedFeature[] = [];
    const seenAbilityIds = new Set<string>();

    const pushAbility = (feature: FeatureEntry, tag?: string) => {
      if (seenAbilityIds.has(feature.id)) return;
      seenAbilityIds.add(feature.id);
      abilities.push({ feature, tag });
    };

    for (const act of sheet.actions) {
      if (isAttackFeature(act)) attacks.push({ feature: act });
      else pushAbility(act, "Ação");
    }
    for (const bon of sheet.bonusActions) {
      if (isAttackFeature(bon)) attacks.push({ feature: bon, tag: "Bônus" });
      else pushAbility(bon, "Bônus");
    }
    for (const rea of sheet.reactions) {
      if (isAttackFeature(rea)) attacks.push({ feature: rea, tag: "Reação" });
      else pushAbility(rea, "Reação");
    }
    for (const leg of sheet.legendaryActions) {
      if (isAttackFeature(leg)) attacks.push({ feature: leg, tag: "Lendária" });
      else pushAbility(leg, "Lendária");
    }
    for (const tr of sheet.traits) pushAbility(tr);
    for (const res of sheet.resources) pushAbility(res, "Recurso");
    for (const myth of sheet.mythicActions) pushAbility(myth, "Mítica");
    for (const lair of sheet.lairActions) pushAbility(lair, "Covil");
    for (const cust of sheet.customFeatures) pushAbility(cust);

    return {
      attackEntries: attacks,
      abilityEntries: abilities,
      spellEntries: sheet.spells ?? [],
    };
  }, [sheet]);

  const handleInitChange = (raw: string) => {
    setInitInput(raw);
    const trimmed = raw.trim();
    if (trimmed === "") {
      onSetInitiative(null);
      return;
    }
    if (trimmed === "-") return;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && /^-?\d+$/.test(trimmed)) {
      onSetInitiative(Math.trunc(parsed));
    }
  };

  const renderFeatureResourceBadge = (feat: FeatureEntry) => {
    const used = instance.consumedResources[feat.id] ?? 0;
    const maxUses = feat.maxUses ?? null;
    const remaining = maxUses !== null ? Math.max(0, maxUses - used) : null;
    const rechargeText =
      feat.usageFrequency ||
      (feat.rechargeOn ? RECHARGE_LABELS_PT[feat.rechargeOn] : undefined);

    return (
      <div className="flex flex-wrap items-center gap-1">
        {rechargeText && <Badge variant="default">{rechargeText}</Badge>}
        {typeof feat.saveDc === "number" && feat.saveAbility && (
          <Badge variant="accent">
            CD {feat.saveDc} {ABILITY_LABELS_PT[feat.saveAbility].short}
          </Badge>
        )}
        {maxUses !== null && maxUses > 0 && (
          <div className="inline-flex items-center gap-1 rounded border border-stone-300 bg-white/80 px-1.5 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-900">
            <span>
              Usos: {remaining}/{maxUses}
            </span>
            <button
              type="button"
              onClick={() => onConsumeResource(feat.id, 1)}
              disabled={remaining === 0}
              className="rounded bg-stone-200 px-1 font-bold hover:bg-stone-300 disabled:opacity-40 dark:bg-slate-700"
              title="Gastar 1 uso"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => onConsumeResource(feat.id, -1)}
              disabled={used === 0}
              className="rounded bg-stone-200 px-1 font-bold hover:bg-stone-300 disabled:opacity-40 dark:bg-slate-700"
              title="Recuperar 1 uso"
            >
              +
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={cardRef}
      data-testid={`combat-card-${instance.boundItemId}`}
      data-active-turn={isActiveTurn ? "true" : "false"}
      data-expanded={isExpanded ? "true" : "false"}
      className={cn(
        "rounded-lg border p-2 transition",
        isActiveTurn
          ? "border-amber-500 bg-amber-50/75 shadow-sm ring-1 ring-amber-500/40 dark:bg-amber-950/25"
          : "border-stone-300/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/80",
      )}
    >
      {/* Cabeçalho compacto */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            aria-label={`Selecionar ${name}`}
          />

          {/* Controle de Iniciativa (PJ manual / Monstro & NPC automático ou manual) */}
          <div className="flex items-center gap-0.5">
            <input
              type="text"
              inputMode="numeric"
              value={initInput}
              placeholder={isCharacter ? "Manual" : "Pend."}
              aria-label={`Iniciativa de ${name}`}
              onChange={(e) => handleInitChange(e.target.value)}
              onBlur={() => {
                if (initInput.trim() === "-" || initInput.trim() === "") {
                  setInitInput(
                    participant.initiative !== null
                      ? String(participant.initiative)
                      : "",
                  );
                }
              }}
              className={cn(
                "w-12 rounded border px-1 py-0.5 text-center text-[11px] font-semibold",
                participant.initiative === null
                  ? "border-dashed border-amber-500/60 bg-amber-500/5 text-amber-700 dark:text-amber-300"
                  : "border-stone-300 bg-white dark:border-slate-700 dark:bg-slate-950",
              )}
            />
            {!isCharacter && (
              <button
                type="button"
                onClick={onRollIndividualInitiative}
                title={`Rolar iniciativa individual de ${name}`}
                className="rounded p-0.5 text-stone-500 hover:bg-stone-200 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <Dices className="h-3 w-3" />
              </button>
            )}
            {(hasSameInitAbove || hasSameInitBelow) && (
              <div className="flex flex-col leading-none">
                {hasSameInitAbove && (
                  <button
                    type="button"
                    onClick={() => onAdjustTieOrder("up")}
                    title="Subir no empate"
                    className="px-0.5 text-[9px] text-amber-600 hover:text-amber-400"
                  >
                    ▲
                  </button>
                )}
                {hasSameInitBelow && (
                  <button
                    type="button"
                    onClick={() => onAdjustTieOrder("down")}
                    title="Descer no empate"
                    className="px-0.5 text-[9px] text-amber-600 hover:text-amber-400"
                  >
                    ▼
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleExpand}
            className="flex min-w-0 flex-1 items-center gap-1 text-left"
            title={isExpanded ? "Recolher painel tático" : "Expandir painel tático"}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-stone-400" />
            )}
            <span className="truncate font-semibold">{name}</span>
          </button>

          <Badge variant={realCategory}>
            {realCategory === "monster"
              ? "Monstro"
              : realCategory === "npc"
                ? "NPC"
                : "PJ"}
          </Badge>

          {isActiveTurn && <Badge variant="warning">Turno Ativo</Badge>}

          {participant.initiative === null && (
            <span className="hidden text-[10px] italic text-amber-600 dark:text-amber-400 sm:inline">
              Iniciativa pendente
            </span>
          )}

          <Badge
            variant={
              instance.currentHp <= 0
                ? "monster"
                : instance.currentHp <= instance.maxHp * 0.5
                  ? "warning"
                  : "success"
            }
          >
            {statusText}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-300">
            <Shield className="h-3 w-3" /> {instance.armorClass}
          </span>
          <span className="font-mono text-[11px] font-bold">
            {instance.currentHp}/{instance.maxHp}
            {instance.tempHp > 0 && (
              <span className="ml-1 text-sky-500">+{instance.tempHp}</span>
            )}
          </span>
          <button
            type="button"
            onClick={onRemoveFromCombat}
            title="Remover do combate (mantém token na cena)"
            aria-label={`Remover ${name} do combate`}
            className="rounded p-1 text-stone-500 hover:bg-red-500/10 hover:text-red-600 dark:text-slate-400"
          >
            <UserMinus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Linha compacta de condições e ajuste rápido de PV */}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={onToggleConcentration}
            title={
              instance.concentratingOn
                ? "Encerrar concentração"
                : "Marcar Concentração"
            }
            className={cn(
              "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold",
              instance.concentratingOn
                ? "bg-amber-600 text-white"
                : "border border-stone-300 text-stone-500 dark:border-slate-700",
            )}
          >
            <Sparkles className="h-2.5 w-2.5" />
            Conc
          </button>

          {instance.conditions.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onRemoveCondition(c.id)}
              title={`${c.name}${c.remainingRounds ? ` (${c.remainingRounds} rod.)` : ""} — clique para remover`}
              style={{ backgroundColor: c.color }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
            >
              <span>
                {c.name}
                {c.remainingRounds ? ` (${c.remainingRounds})` : ""}
              </span>
              <X className="h-2.5 w-2.5" />
            </button>
          ))}

          <button
            type="button"
            onClick={onOpenConditionModal}
            className="inline-flex items-center gap-0.5 rounded border border-dashed border-stone-400 px-1.5 py-0.5 text-[10px] hover:bg-stone-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            <Plus className="h-2.5 w-2.5" /> Condição
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onHpMutation({ type: "damage", amount: 1 })}
            className="rounded bg-red-600/80 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-red-700"
          >
            -1
          </button>
          <button
            type="button"
            onClick={() => onHpMutation({ type: "damage", amount: 5 })}
            className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-red-700"
          >
            -5
          </button>
          <button
            type="button"
            onClick={() => onHpMutation({ type: "heal", amount: 5 })}
            className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700"
          >
            +5
          </button>
        </div>
      </div>

      {/* Painel Tático Expandido (Turno Atual ou Inspeção Manual) */}
      {isExpanded && (
        <div className="mt-2.5 space-y-2 border-t border-stone-300/80 pt-2 dark:border-slate-700/80">
          {/* Ajuste numérico rápido de PV / PV Temp */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-md bg-stone-100/80 p-1.5 dark:bg-slate-950/60">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = hpCmd.trim();
                if (!trimmed) return;
                onHpMutation({ type: "command", command: trimmed });
                setHpCmd("");
              }}
              className="flex flex-wrap items-center gap-1"
            >
              <span className="text-[10px] font-semibold text-stone-600 dark:text-slate-400">
                PV:
              </span>
              <input
                type="text"
                value={hpCmd}
                onChange={(e) => setHpCmd(e.target.value)}
                placeholder="-8 / +5 / 15"
                aria-label={`Ajuste rápido de PV para ${name}`}
                className="w-24 rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="submit"
                className="rounded bg-stone-800 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-stone-900 dark:bg-slate-700"
              >
                Aplicar
              </button>
            </form>

            <button
              type="button"
              onClick={() =>
                onHpMutation({
                  type: "temp-hp",
                  amount: (instance.tempHp || 0) + 5,
                  mode: tempHpRule,
                })
              }
              className="rounded bg-sky-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-sky-700"
              title="Conceder +5 PV Temporários"
            >
              +5 Temp
            </button>
          </div>

          {/* Ataques */}
          {attackEntries.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-800 dark:text-red-300">
                <Swords className="h-3 w-3" />
                <span>Ataques ({attackEntries.length})</span>
              </div>
              <div className="space-y-1">
                {attackEntries.map(({ feature, tag }) => {
                  const detailOpen = expandedFeatureIds.has(feature.id);
                  return (
                    <div
                      key={feature.id}
                      className="rounded border border-stone-200 bg-white/80 p-1.5 dark:border-slate-800 dark:bg-slate-900/70"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleFeatureDetail(feature.id)}
                          className="flex min-w-0 flex-1 items-center gap-1 text-left"
                        >
                          <span className="truncate font-semibold text-stone-900 dark:text-slate-100">
                            {feature.name}
                          </span>
                          {tag && <Badge variant="default">{tag}</Badge>}
                          {(feature.range || feature.reach) && (
                            <span className="text-[10px] text-stone-500 dark:text-slate-400">
                              •{" "}
                              {feature.range ??
                                `${feature.reach} m`}
                            </span>
                          )}
                        </button>

                        <div className="flex flex-wrap items-center gap-1">
                          {typeof feature.attackBonus === "number" && (
                            <button
                              type="button"
                              onClick={() =>
                                void rollExpr(
                                  `${feature.name} (Ataque)`,
                                  `1d20${formatSigned(feature.attackBonus!)}`,
                                )
                              }
                              className="inline-flex items-center gap-1 rounded bg-red-700 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-red-800"
                              title={`Rolar ataque ${formatSigned(feature.attackBonus)}`}
                            >
                              <Swords className="h-2.5 w-2.5" />
                              Atacar {formatSigned(feature.attackBonus)}
                            </button>
                          )}

                          {feature.damage?.map((dmg, dIdx) => (
                            <button
                              key={dIdx}
                              type="button"
                              onClick={() =>
                                void rollExpr(
                                  `${feature.name} (${dmg.type || "dano"})`,
                                  dmg.formula,
                                )
                              }
                              className="inline-flex items-center gap-1 rounded bg-amber-700 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-amber-800"
                              title={`Rolar dano ${dmg.type}`}
                            >
                              <Flame className="h-2.5 w-2.5" />
                              Dano {dmg.formula}
                              {dmg.type ? ` ${dmg.type}` : ""}
                            </button>
                          ))}
                        </div>
                      </div>

                      {renderFeatureResourceBadge(feature)}

                      {detailOpen && feature.description && (
                        <p className="mt-1 whitespace-pre-line text-[11px] leading-snug text-stone-600 dark:text-slate-300">
                          {feature.description}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Habilidades & Recursos (Colapsável) */}
          {abilityEntries.length > 0 && (
            <div className="rounded border border-stone-200/80 bg-white/60 dark:border-slate-800 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => setShowAbilities((v) => !v)}
                className="flex w-full items-center justify-between px-2 py-1 text-left text-[11px] font-bold text-stone-800 dark:text-slate-200"
              >
                <span>Habilidades & Recursos ({abilityEntries.length})</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    showAbilities && "rotate-180",
                  )}
                />
              </button>
              {showAbilities && (
                <div className="space-y-1 border-t border-stone-200/70 p-1.5 dark:border-slate-800">
                  {abilityEntries.map(({ feature, tag }) => {
                    const detailOpen = expandedFeatureIds.has(feature.id);
                    return (
                      <div
                        key={feature.id}
                        className="rounded border border-stone-200/70 bg-white/80 p-1.5 dark:border-slate-800 dark:bg-slate-950/50"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <button
                            type="button"
                            onClick={() => toggleFeatureDetail(feature.id)}
                            className="flex items-center gap-1 text-left font-semibold text-stone-900 dark:text-slate-100"
                          >
                            <ChevronRight
                              className={cn(
                                "h-3 w-3 shrink-0 transition-transform",
                                detailOpen && "rotate-90",
                              )}
                            />
                            <span>{feature.name}</span>
                            {tag && <Badge variant="default">{tag}</Badge>}
                          </button>
                          {renderFeatureResourceBadge(feature)}
                        </div>
                        {detailOpen && feature.description && (
                          <p className="mt-1 whitespace-pre-line text-[11px] leading-snug text-stone-600 dark:text-slate-300">
                            {feature.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Magias (Colapsável) */}
          {spellEntries.length > 0 && (
            <div className="rounded border border-stone-200/80 bg-white/60 dark:border-slate-800 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => setShowSpells((v) => !v)}
                className="flex w-full items-center justify-between px-2 py-1 text-left text-[11px] font-bold text-stone-800 dark:text-slate-200"
              >
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-purple-500" />
                  Magias ({spellEntries.length})
                  {sheet?.characterDetails?.spellcasting?.saveDc && (
                    <span className="font-normal text-stone-500 dark:text-slate-400">
                      • CD {sheet.characterDetails.spellcasting.saveDc}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    showSpells && "rotate-180",
                  )}
                />
              </button>
              {showSpells && (
                <div className="space-y-1 border-t border-stone-200/70 p-1.5 dark:border-slate-800">
                  {spellEntries.map((sp) => {
                    const detailOpen = expandedFeatureIds.has(sp.id);
                    return (
                      <div
                        key={sp.id}
                        className="rounded border border-stone-200/70 bg-white/80 p-1.5 dark:border-slate-800 dark:bg-slate-950/50"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <button
                            type="button"
                            onClick={() => toggleFeatureDetail(sp.id)}
                            className="flex flex-wrap items-center gap-1 text-left"
                          >
                            <span className="font-semibold">{sp.name}</span>
                            {typeof sp.spellLevel === "number" && (
                              <Badge variant="default">
                                {sp.spellLevel === 0 ? "Truque" : `Nív ${sp.spellLevel}`}
                              </Badge>
                            )}
                            {sp.concentration && (
                              <Badge variant="warning">Conc.</Badge>
                            )}
                            {sp.castingTime && (
                              <span className="text-[10px] text-stone-500 dark:text-slate-400">
                                {sp.castingTime}
                              </span>
                            )}
                          </button>
                          <div className="flex flex-wrap items-center gap-1">
                            {typeof sp.attackBonus === "number" && (
                              <button
                                type="button"
                                onClick={() =>
                                  void rollExpr(
                                    `${sp.name} (Ataque)`,
                                    `1d20${formatSigned(sp.attackBonus!)}`,
                                  )
                                }
                                className="rounded bg-red-700 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-red-800"
                              >
                                Atacar {formatSigned(sp.attackBonus)}
                              </button>
                            )}
                            {sp.damage?.map((dmg, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() =>
                                  void rollExpr(
                                    `${sp.name} (${dmg.type || "dano"})`,
                                    dmg.formula,
                                  )
                                }
                                className="rounded bg-amber-700 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-amber-800"
                              >
                                Dano {dmg.formula}
                              </button>
                            ))}
                          </div>
                        </div>
                        {detailOpen && sp.description && (
                          <p className="mt-1 whitespace-pre-line text-[11px] leading-snug text-stone-600 dark:text-slate-300">
                            {sp.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Rodapé do Card Expandido */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={onOpenSheet}
              className="inline-flex items-center gap-1 rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-medium hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <ExternalLink className="h-3 w-3" /> Abrir ficha completa
            </button>
            <button
              type="button"
              onClick={onRemoveFromCombat}
              className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-500/20 dark:text-red-300"
            >
              <UserMinus className="h-3 w-3" /> Remover do combate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
