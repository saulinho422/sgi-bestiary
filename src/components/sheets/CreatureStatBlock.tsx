import { useState } from "react";
import {
  Dices,
  Download,
  Edit3,
  EyeOff,
  Flame,
  Heart,
  Shield,
  Sparkles,
  Swords,
  Zap,
} from "lucide-react";
import type { CreatureSheet, FeatureEntry } from "@/domain/entities/sheet";
import type { TokenInstance } from "@/domain/entities/tokenInstance";
import {
  ABILITY_KEYS,
  ABILITY_LABELS_PT,
  CREATURE_TYPE_LABELS_PT,
  DND5E_SKILLS,
  SIZE_LABELS_PT,
  formatSigned,
  getAbilityModifier,
  getInitiativeModifier,
  getPassivePerception,
  getRulesetNotes,
  getSavingThrowModifier,
  getSkillModifier,
} from "@/domain/rules/dnd5eRules";
import { formatSpeedSummary } from "@/domain/rules/visibilityProjection";
import { performRoll } from "@/integrations/dice/diceService";
import {
  downloadJsonFile,
  exportSingleSheetToJson,
  sanitizeSlugFilename,
} from "@/features/import-export/jsonExporter";
import { useBestiaryStore } from "@/stores/useBestiaryStore";
import { cn } from "@/utils/cn";
import { Badge, CollapsibleSection } from "../common/UiPrimitives";
import { getResolvedImageSrcFromRef } from "../common/ImagePickerField";

export function CreatureStatBlock({
  sheet,
  instance,
  viewerRole = "GM",
  defaultMode = "compact",
  rollMode = "normal",
  rollVisibility = "public",
  canEdit = true,
  onEdit,
  onConsumeResource,
  onHpCommand,
}: {
  sheet: CreatureSheet;
  instance?: TokenInstance;
  viewerRole?: "GM" | "PLAYER";
  defaultMode?: "compact" | "full";
  rollMode?: "normal" | "advantage" | "disadvantage";
  rollVisibility?: "public" | "gm-only";
  canEdit?: boolean;
  onEdit?: () => void;
  onConsumeResource?: (featureId: string, delta: number) => void;
  onHpCommand?: (cmd: string) => void;
}) {
  const [mode, setMode] = useState<"compact" | "full">(defaultMode);
  const [hpCmd, setHpCmd] = useState("");
  const showToast = useBestiaryStore((s) => s.showToast);

  const actorName = instance?.individualName || sheet.name;
  const portraitUrl =
    getResolvedImageSrcFromRef(sheet.portrait) ??
    getResolvedImageSrcFromRef(sheet.tokenImage);

  const rollExpr = async (label: string, expression: string) => {
    try {
      await performRoll({
        actorName,
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

  const sizeLabel = SIZE_LABELS_PT[sheet.size] ?? sheet.size;
  const typeLabel =
    CREATURE_TYPE_LABELS_PT[sheet.creatureType.toUpperCase()] ??
    sheet.creatureType;
  const passivePerc = getPassivePerception(sheet);
  const initMod = getInitiativeModifier(sheet);
  const effectiveAc = instance ? instance.armorClass : sheet.armorClass.value;
  const effectiveMaxHp = instance ? instance.maxHp : sheet.hitPoints.maximum;
  const effectiveCurrentHp = instance
    ? instance.currentHp
    : sheet.hitPoints.current ?? sheet.hitPoints.maximum;
  const effectiveTempHp = instance
    ? instance.tempHp
    : sheet.hitPoints.temporary ?? 0;

  const proficientSaves = ABILITY_KEYS.filter((k) =>
    sheet.savingThrows.some((s) => s.ability === k && (s.proficient || (s.bonus ?? 0) !== 0)),
  );

  const proficientSkills = DND5E_SKILLS.filter((sk) =>
    sheet.skills.some(
      (e) =>
        e.id === sk.id &&
        (e.proficient || e.expertise || e.halfProficiency || (e.bonus ?? 0) !== 0),
    ),
  );

  const renderFeatureBlock = (
    title: string,
    list: FeatureEntry[],
    icon?: React.ReactNode,
  ) => {
    if (list.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 border-b border-red-800/40 pb-0.5 text-xs font-bold uppercase tracking-wider text-red-900 dark:border-red-500/40 dark:text-red-300">
          {icon}
          <span>{title}</span>
        </div>
        <div className="space-y-2">
          {list.map((feat) => {
            const used = instance?.consumedResources[feat.id] ?? 0;
            const maxUses = feat.maxUses ?? null;
            const remaining =
              maxUses !== null ? Math.max(0, maxUses - used) : null;

            return (
              <div
                key={feat.id}
                className="rounded-md border border-stone-200/80 bg-white/70 p-2 text-xs dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-stone-900 dark:text-slate-100">
                      {feat.name}
                    </span>
                    {feat.usageFrequency && (
                      <Badge variant="default">{feat.usageFrequency}</Badge>
                    )}
                    {feat.concentration && (
                      <Badge variant="warning">Concentração</Badge>
                    )}
                    {typeof feat.saveDc === "number" && feat.saveAbility && (
                      <Badge variant="accent">
                        CD {feat.saveDc} {ABILITY_LABELS_PT[feat.saveAbility].short}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {maxUses !== null && maxUses > 0 && (
                      <div className="flex items-center gap-1 rounded border border-stone-300 px-1.5 py-0.5 text-[11px] dark:border-slate-700">
                        <span>
                          Usos: {remaining}/{maxUses}
                        </span>
                        {onConsumeResource && (
                          <>
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
                          </>
                        )}
                      </div>
                    )}

                    {typeof feat.attackBonus === "number" && (
                      <button
                        type="button"
                        onClick={() =>
                          rollExpr(
                            `${feat.name} (Ataque)`,
                            `1d20${formatSigned(feat.attackBonus!)}`,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded bg-red-700 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-red-800"
                        title="Rolar jogada de ataque"
                      >
                        <Swords className="h-3 w-3" />
                        {formatSigned(feat.attackBonus)}
                      </button>
                    )}

                    {feat.damage?.map((dmg, dIdx) => (
                      <button
                        key={dIdx}
                        type="button"
                        onClick={() =>
                          rollExpr(
                            `${feat.name} (${dmg.type || "dano"})`,
                            dmg.formula,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded bg-amber-700 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-800"
                        title={`Rolar dano ${dmg.type}`}
                      >
                        <Flame className="h-3 w-3" />
                        {dmg.formula}
                      </button>
                    ))}
                  </div>
                </div>

                {feat.description && (
                  <p className="mt-1 whitespace-pre-line text-[12px] leading-snug text-stone-700 dark:text-slate-300">
                    {feat.description}
                  </p>
                )}

                {feat.extraRules && (
                  <p className="mt-1 text-[11px] italic text-stone-500 dark:text-slate-400">
                    {feat.extraRules}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3 text-stone-900 dark:text-slate-100">
      {/* Cabeçalho estilo Stat Block */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-red-800/70 pb-2.5 dark:border-red-500/60">
        <div className="flex items-start gap-2.5">
          {portraitUrl && (
            <img
              src={portraitUrl}
              alt={actorName}
              className="h-14 w-14 shrink-0 rounded-lg border border-stone-300 object-cover dark:border-slate-700"
            />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-lg font-extrabold tracking-tight text-red-900 dark:text-red-300">
                {actorName}
              </h2>
              <Badge variant={sheet.kind}>
                {sheet.kind === "monster"
                  ? "Monstro"
                  : sheet.kind === "npc"
                    ? "NPC"
                    : "Personagem"}
              </Badge>
              <Badge variant="default">
                {sheet.ruleset === "dnd5e-2024" ? "2024" : "2014"}
              </Badge>
            </div>
            {sheet.alias && (
              <div className="text-xs italic text-stone-600 dark:text-slate-400">
                {sheet.alias}
              </div>
            )}
            <div className="text-xs italic text-stone-600 dark:text-slate-300">
              {typeLabel} {sizeLabel}
              {sheet.subtype ? ` (${sheet.subtype})` : ""}, {sheet.alignment}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-md border border-stone-300 bg-stone-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMode("compact")}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-semibold",
                mode === "compact"
                  ? "bg-white text-stone-950 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-stone-600 dark:text-slate-400",
              )}
            >
              Compacto
            </button>
            <button
              type="button"
              onClick={() => setMode("full")}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-semibold",
                mode === "full"
                  ? "bg-white text-stone-950 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-stone-600 dark:text-slate-400",
              )}
            >
              Completo
            </button>
          </div>

          {canEdit && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Editar
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              downloadJsonFile(
                `${sanitizeSlugFilename(sheet.name)}.json`,
                exportSingleSheetToJson(sheet),
              )
            }
            title="Exportar ficha JSON"
            className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-medium hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            JSON
          </button>
        </div>
      </div>

      {/* Controles rápidos de instância (quando vinculada a token) */}
      {instance && onHpCommand && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-50/70 p-2 dark:bg-slate-900/80">
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 font-bold text-red-700 dark:text-red-400">
              <Heart className="h-3.5 w-3.5" />
              {effectiveCurrentHp}/{effectiveMaxHp}
            </span>
            {effectiveTempHp > 0 && (
              <span className="rounded bg-sky-600/20 px-1.5 py-0.5 font-semibold text-sky-700 dark:text-sky-300">
                +{effectiveTempHp} Temp
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-bold text-blue-700 dark:text-blue-300">
              <Shield className="h-3.5 w-3.5" />
              CA {effectiveAc}
            </span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!hpCmd.trim()) return;
              onHpCommand(hpCmd.trim());
              setHpCmd("");
            }}
            className="flex items-center gap-1"
          >
            <button
              type="button"
              onClick={() => onHpCommand("-5")}
              className="rounded bg-red-600/90 px-1.5 py-0.5 text-[11px] font-bold text-white hover:bg-red-700"
            >
              -5
            </button>
            <button
              type="button"
              onClick={() => onHpCommand("-1")}
              className="rounded bg-red-600/80 px-1.5 py-0.5 text-[11px] font-bold text-white hover:bg-red-700"
            >
              -1
            </button>
            <input
              type="text"
              value={hpCmd}
              onChange={(e) => setHpCmd(e.target.value)}
              placeholder="-8 / +5 / 15"
              className="w-24 rounded border border-stone-300 bg-white px-1.5 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="submit"
              className="rounded bg-stone-800 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-stone-900 dark:bg-slate-700"
            >
              Aplicar
            </button>
            <button
              type="button"
              onClick={() => onHpCommand("+5")}
              className="rounded bg-emerald-600/90 px-1.5 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-700"
            >
              +5
            </button>
          </form>
        </div>
      )}

      {/* Bloco 2: CA, PV, Deslocamento, Iniciativa */}
      <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-stone-300/80 bg-white/75 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-900/70 sm:grid-cols-2">
        <div>
          <span className="font-bold text-red-900 dark:text-red-300">
            Classe de Armadura:{" "}
          </span>
          <span className="font-semibold">{effectiveAc}</span>
          {sheet.armorClass.description && (
            <span className="text-stone-600 dark:text-slate-400">
              {" "}
              ({sheet.armorClass.description})
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-red-900 dark:text-red-300">
            Pontos de Vida:{" "}
          </span>
          <span className="font-semibold">{effectiveMaxHp}</span>
          {sheet.hitPoints.formula && (
            <button
              type="button"
              onClick={() => rollExpr("Dados de Vida", sheet.hitPoints.formula)}
              className="inline-flex items-center gap-0.5 rounded bg-stone-200/80 px-1.5 py-0.5 text-[11px] hover:bg-stone-300 dark:bg-slate-800 dark:hover:bg-slate-700"
              title="Rolar fórmula de PV"
            >
              <Dices className="h-3 w-3" />({sheet.hitPoints.formula})
            </button>
          )}
        </div>
        <div>
          <span className="font-bold text-red-900 dark:text-red-300">
            Deslocamento:{" "}
          </span>
          <span>{formatSpeedSummary(sheet)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-red-900 dark:text-red-300">
            Iniciativa:{" "}
          </span>
          <button
            type="button"
            onClick={() =>
              rollExpr("Iniciativa", `1d20${formatSigned(initMod)}`)
            }
            className="inline-flex items-center gap-1 rounded bg-stone-200/80 px-1.5 py-0.5 font-semibold hover:bg-amber-200 dark:bg-slate-800 dark:hover:bg-amber-900/40"
            title="Rolar Iniciativa"
          >
            <Zap className="h-3 w-3 text-amber-500" />
            {formatSigned(initMod)}
          </button>
          <span className="text-stone-500 dark:text-slate-400">
            • Prof: +{sheet.proficiencyBonus}
          </span>
        </div>
      </div>

      {/* Bloco 3: Seis Atributos Clicáveis */}
      <div className="grid grid-cols-6 gap-1.5">
        {ABILITY_KEYS.map((key) => {
          const score = sheet.abilities[key];
          const mod = getAbilityModifier(
            score,
            sheet.abilityModifiersOverride?.[key],
          );
          return (
            <button
              key={key}
              type="button"
              onClick={() =>
                rollExpr(
                  `Teste de ${ABILITY_LABELS_PT[key].full}`,
                  `1d20${formatSigned(mod)}`,
                )
              }
              title={`Rolar teste de ${ABILITY_LABELS_PT[key].full}`}
              className="flex flex-col items-center rounded-lg border border-stone-300/80 bg-white/80 px-1 py-1.5 text-center transition hover:border-amber-500 hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-900/80 dark:hover:border-amber-500 dark:hover:bg-slate-800"
            >
              <span className="text-[10px] font-bold uppercase text-red-900 dark:text-red-300">
                {ABILITY_LABELS_PT[key].short}
              </span>
              <span className="text-sm font-extrabold">
                {formatSigned(mod)}
              </span>
              <span className="text-[11px] text-stone-500 dark:text-slate-400">
                ({score})
              </span>
            </button>
          );
        })}
      </div>

      {/* Bloco 4 & 5: Resistências, Perícias, Sentidos, Idiomas, ND */}
      <div className="space-y-1 rounded-lg border border-stone-300/80 bg-white/75 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-900/70">
        {proficientSaves.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-red-900 dark:text-red-300">
              Testes de Resistência:
            </span>
            {proficientSaves.map((ab) => {
              const mod = getSavingThrowModifier(sheet, ab);
              return (
                <button
                  key={ab}
                  type="button"
                  onClick={() =>
                    rollExpr(
                      `Resistência de ${ABILITY_LABELS_PT[ab].full}`,
                      `1d20${formatSigned(mod)}`,
                    )
                  }
                  className="rounded bg-stone-200/80 px-1.5 py-0.5 font-medium hover:bg-amber-200 dark:bg-slate-800 dark:hover:bg-amber-900/40"
                >
                  {ABILITY_LABELS_PT[ab].short} {formatSigned(mod)}
                </button>
              );
            })}
          </div>
        )}

        {proficientSkills.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-red-900 dark:text-red-300">
              Perícias:
            </span>
            {proficientSkills.map((sk) => {
              const mod = getSkillModifier(sheet, sk.id);
              return (
                <button
                  key={sk.id}
                  type="button"
                  onClick={() =>
                    rollExpr(sk.label, `1d20${formatSigned(mod)}`)
                  }
                  className="rounded bg-stone-200/80 px-1.5 py-0.5 font-medium hover:bg-amber-200 dark:bg-slate-800 dark:hover:bg-amber-900/40"
                >
                  {sk.label} {formatSigned(mod)}
                </button>
              );
            })}
          </div>
        )}

        {mode === "full" && (
          <>
            {sheet.damageVulnerabilities.length > 0 && (
              <div>
                <strong className="text-red-900 dark:text-red-300">
                  Vulnerabilidades:{" "}
                </strong>
                {sheet.damageVulnerabilities.join(", ")}
              </div>
            )}
            {sheet.damageResistances.length > 0 && (
              <div>
                <strong className="text-red-900 dark:text-red-300">
                  Resistências a Dano:{" "}
                </strong>
                {sheet.damageResistances.join(", ")}
              </div>
            )}
            {sheet.damageImmunities.length > 0 && (
              <div>
                <strong className="text-red-900 dark:text-red-300">
                  Imunidades a Dano:{" "}
                </strong>
                {sheet.damageImmunities.join(", ")}
              </div>
            )}
            {sheet.conditionImmunities.length > 0 && (
              <div>
                <strong className="text-red-900 dark:text-red-300">
                  Imunidades a Condições:{" "}
                </strong>
                {sheet.conditionImmunities.join(", ")}
              </div>
            )}
          </>
        )}

        <div>
          <strong className="text-red-900 dark:text-red-300">Sentidos: </strong>
          {sheet.senses.length > 0 ? `${sheet.senses.join(", ")}, ` : ""}
          Percepção passiva {passivePerc}
        </div>

        <div className="flex flex-wrap justify-between gap-2">
          <div>
            <strong className="text-red-900 dark:text-red-300">Idiomas: </strong>
            {sheet.languages.length > 0 ? sheet.languages.join(", ") : "—"}
          </div>
          <div>
            <strong className="text-red-900 dark:text-red-300">
              {sheet.kind === "character" ? "Nível: " : "ND: "}
            </strong>
            {sheet.kind === "character"
              ? sheet.characterDetails?.level ?? 1
              : `${sheet.challengeRating} (${sheet.experiencePoints} XP)`}
          </div>
        </div>
      </div>

      {/* Blocos 6–10: Características, Ações, Bônus, Reações, Lendárias, Míticas */}
      {renderFeatureBlock("Características Especiais", sheet.traits)}
      {renderFeatureBlock("Ações", sheet.actions, <Swords className="h-3.5 w-3.5" />)}
      {renderFeatureBlock("Ações Bônus", sheet.bonusActions)}
      {renderFeatureBlock("Reações", sheet.reactions)}
      {renderFeatureBlock(
        `Ações Lendárias${sheet.legendaryActionCount ? ` (${sheet.legendaryActionCount}/rodada)` : ""}`,
        sheet.legendaryActions,
      )}
      {mode === "full" && (
        <>
          {renderFeatureBlock("Ações de Covil", sheet.lairActions)}
          {renderFeatureBlock("Habilidades Míticas", sheet.mythicActions)}
          {renderFeatureBlock(
            "Magias",
            sheet.spells,
            <Sparkles className="h-3.5 w-3.5" />,
          )}
          {renderFeatureBlock("Recursos Limitados", sheet.resources)}
          {renderFeatureBlock("Equipamentos", sheet.equipment)}
          {renderFeatureBlock("Habilidades Personalizadas", sheet.customFeatures)}
        </>
      )}

      {/* Bloco Personagem Completo (quando aplicável em modo completo) */}
      {mode === "full" && sheet.characterDetails && (
        <CollapsibleSection
          title="Detalhes de Personagem & Inventário"
          defaultOpen={sheet.kind === "character"}
        >
          <div className="space-y-2 text-xs">
            <div className="flex flex-wrap gap-3">
              <span>
                <strong>{sheet.ruleset === "dnd5e-2024" ? "Espécie" : "Raça"}:</strong>{" "}
                {sheet.characterDetails.species || "—"}
              </span>
              <span>
                <strong>Antecedente:</strong>{" "}
                {sheet.characterDetails.background || "—"}
              </span>
              <span>
                <strong>Classes:</strong>{" "}
                {sheet.characterDetails.classes
                  .map((c) => `${c.name}${c.subclass ? ` (${c.subclass})` : ""} ${c.level}`)
                  .join(" / ") || "—"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px]">
              <span>PC: {sheet.characterDetails.currency.cp}</span>
              <span>PP: {sheet.characterDetails.currency.sp}</span>
              <span>PE: {sheet.characterDetails.currency.ep}</span>
              <span>PO: {sheet.characterDetails.currency.gp}</span>
              <span>PL: {sheet.characterDetails.currency.pp}</span>
            </div>

            {sheet.characterDetails.inventory.length > 0 && (
              <div className="space-y-1">
                <div className="font-semibold">Inventário</div>
                <ul className="list-inside list-disc space-y-0.5">
                  {sheet.characterDetails.inventory.map((it) => (
                    <li key={it.id}>
                      {it.quantity}× {it.name}
                      {it.equipped ? " [Equipado]" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Bloco 11: Notas e Regras do Conjunto */}
      {mode === "full" && (
        <div className="space-y-2 text-xs">
          {sheet.description && (
            <div className="rounded-lg border border-stone-200 bg-white/60 p-2.5 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="mb-1 font-semibold text-stone-700 dark:text-slate-300">
                Descrição
              </div>
              <p className="whitespace-pre-line text-stone-600 dark:text-slate-400">
                {sheet.description}
              </p>
            </div>
          )}

          {sheet.notes.public && (
            <div className="rounded-lg border border-stone-200 bg-white/60 p-2.5 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="mb-1 font-semibold">Notas Públicas</div>
              <p className="whitespace-pre-line">{sheet.notes.public}</p>
            </div>
          )}

          {viewerRole === "GM" && sheet.notes.gm && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-50/70 p-2.5 dark:bg-amber-950/20">
              <div className="mb-1 flex items-center gap-1 font-semibold text-amber-800 dark:text-amber-300">
                <EyeOff className="h-3.5 w-3.5" /> Notas Privadas do Mestre
              </div>
              <p className="whitespace-pre-line text-amber-950 dark:text-amber-100">
                {sheet.notes.gm}
              </p>
            </div>
          )}

          <CollapsibleSection
            title={`Diferenças do conjunto de regras (${sheet.ruleset})`}
            defaultOpen={false}
          >
            <ul className="list-inside list-disc space-y-1 text-[11px] text-stone-600 dark:text-slate-400">
              {getRulesetNotes(sheet.ruleset).map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}
