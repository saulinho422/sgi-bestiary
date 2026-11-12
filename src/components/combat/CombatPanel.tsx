import { useMemo, useState } from "react";
import {
  Dices,
  Eye,
  EyeOff,
  Flame,
  Heart,
  Plus,
  RotateCcw,
  Shield,
  SkipForward,
  Sparkles,
  Swords,
  X,
} from "lucide-react";
import type { ConditionDurationUnit } from "@/domain/entities/tokenInstance";
import {
  DND5E_CONDITIONS,
  createConditionFromCatalog,
  createCustomCondition,
} from "@/domain/rules/conditionsCatalog";
import { useBestiaryStore } from "@/stores/useBestiaryStore";
import { cn } from "@/utils/cn";
import { Badge } from "../common/UiPrimitives";

export function CombatPanel() {
  const role = useBestiaryStore((s) => s.role);
  const sheets = useBestiaryStore((s) => s.sheets);
  const instances = useBestiaryStore((s) => s.instances);
  const initiative = useBestiaryStore((s) => s.initiative);
  const settings = useBestiaryStore((s) => s.settings);

  const applyHpMutation = useBestiaryStore((s) => s.applyHpMutation);
  const applyCondition = useBestiaryStore((s) => s.applyCondition);
  const removeCondition = useBestiaryStore((s) => s.removeCondition);
  const updateVisibility = useBestiaryStore((s) => s.updateVisibility);
  const setConcentrating = useBestiaryStore((s) => s.setConcentrating);
  const setInstanceInitiative = useBestiaryStore((s) => s.setInstanceInitiative);
  const rollAllInitiatives = useBestiaryStore((s) => s.rollAllInitiatives);
  const nextTurn = useBestiaryStore((s) => s.nextTurn);
  const resetInitiative = useBestiaryStore((s) => s.resetInitiative);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [massValue, setMassValue] = useState<string>("5");
  const [conditionTargetIds, setConditionTargetIds] = useState<string[] | null>(
    null,
  );
  const [selectedConditionId, setSelectedConditionId] = useState("poisoned");
  const [customCondName, setCustomCondName] = useState("");
  const [durationUnit, setDurationUnit] =
    useState<ConditionDurationUnit>("indefinite");
  const [durationRounds, setDurationRounds] = useState<number>(3);
  const [showInitiative, setShowInitiative] = useState(true);

  const sheetsById = useMemo(
    () => new Map(sheets.map((s) => [s.id, s])),
    [sheets],
  );

  const orderedInstances = useMemo(() => {
    if (!initiative.active || initiative.order.length === 0) {
      return instances;
    }
    const orderIdx = new Map(
      initiative.order.map((o, idx) => [o.itemId, idx]),
    );
    return [...instances].sort((a, b) => {
      const ia = orderIdx.get(a.boundItemId) ?? 9999;
      const ib = orderIdx.get(b.boundItemId) ?? 9999;
      return ia - ib;
    });
  }, [instances, initiative]);

  const activeTurnItemId =
    initiative.active && initiative.order[initiative.turnIndex]?.itemId;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const targetIds = Array.from(selectedIds);
  const parsedMass = Math.max(0, parseInt(massValue, 10) || 0);

  if (role !== "GM") {
    return (
      <div className="rounded-lg border border-stone-300 bg-white/80 p-4 text-center text-xs text-stone-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        {initiative.active && initiative.order.length > 0 ? (
          <div className="space-y-2 text-left">
            <div className="font-bold">
              Combate em andamento • Rodada {initiative.round}
            </div>
            <p className="text-[11px] opacity-80">
              Use a aba <strong>Cena</strong> para acompanhar os status visíveis e editar seus personagens autorizados.
            </p>
          </div>
        ) : (
          "O gerenciamento tático em massa é restrito ao Mestre."
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 text-xs">
      {/* Módulo Opcional de Iniciativa */}
      <div className="rounded-lg border border-stone-300/80 bg-white/90 p-2 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={() => setShowInitiative((s) => !s)}
            className="inline-flex items-center gap-1.5 font-bold text-stone-800 dark:text-slate-100"
          >
            <Swords className="h-3.5 w-3.5 text-amber-500" />
            <span>
              Turnos & Iniciativa
              {initiative.active ? ` • Rodada ${initiative.round}` : ""}
            </span>
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void rollAllInitiatives()}
              disabled={instances.length === 0}
              className="inline-flex items-center gap-1 rounded bg-stone-800 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-stone-900 disabled:opacity-40 dark:bg-slate-700"
            >
              <Dices className="h-3 w-3" /> Rolar
            </button>
            <button
              type="button"
              onClick={() => void nextTurn()}
              disabled={initiative.order.length === 0}
              className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
            >
              <SkipForward className="h-3 w-3" /> Próximo
            </button>
            {initiative.active && (
              <button
                type="button"
                onClick={() => void resetInitiative()}
                title="Zerar iniciativa"
                className="rounded p-1 text-stone-500 hover:bg-stone-200 dark:hover:bg-slate-800"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Painel de Ações em Massa (Magias em Área) */}
      <div className="rounded-lg border border-amber-500/40 bg-amber-50/70 p-2 dark:bg-slate-900/90">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setSelectedIds(
                  selectedIds.size === instances.length
                    ? new Set()
                    : new Set(instances.map((i) => i.boundItemId)),
                )
              }
              className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] font-medium dark:border-slate-700 dark:bg-slate-800"
            >
              {selectedIds.size === instances.length && instances.length > 0
                ? "Desmarcar"
                : "Todos"}
            </button>
            <button
              type="button"
              onClick={() =>
                setSelectedIds(
                  new Set(
                    instances
                      .filter((i) => i.category === "monster")
                      .map((i) => i.boundItemId),
                  ),
                )
              }
              className="rounded border border-red-400/50 bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-300"
            >
              Inimigos
            </button>
            <span className="font-semibold text-amber-800 dark:text-amber-300">
              {selectedIds.size} alvo(s)
            </span>
          </div>

          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              value={massValue}
              onChange={(e) => setMassValue(e.target.value)}
              aria-label="Valor em massa"
              className="w-14 rounded border border-stone-300 bg-white px-1.5 py-0.5 text-center font-mono dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="button"
              disabled={targetIds.length === 0 || parsedMass <= 0}
              onClick={() =>
                void applyHpMutation(targetIds, {
                  type: "damage",
                  amount: parsedMass,
                })
              }
              className="inline-flex items-center gap-0.5 rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              title="Aplicar dano aos selecionados"
            >
              <Flame className="h-3 w-3" /> Dano
            </button>
            <button
              type="button"
              disabled={targetIds.length === 0 || parsedMass <= 0}
              onClick={() =>
                void applyHpMutation(targetIds, {
                  type: "heal",
                  amount: parsedMass,
                })
              }
              className="inline-flex items-center gap-0.5 rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              title="Curar selecionados"
            >
              <Heart className="h-3 w-3" /> Cura
            </button>
            <button
              type="button"
              disabled={targetIds.length === 0}
              onClick={() =>
                void applyHpMutation(targetIds, {
                  type: "temp-hp",
                  amount: parsedMass,
                  mode: settings.ui.tempHpRule,
                })
              }
              className="rounded bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-40"
              title="Definir PV Temporários"
            >
              +Temp
            </button>
            <button
              type="button"
              disabled={targetIds.length === 0}
              onClick={() => setConditionTargetIds(targetIds)}
              className="rounded bg-purple-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-purple-700 disabled:opacity-40"
              title="Aplicar condição em massa"
            >
              +Condição
            </button>
            <button
              type="button"
              disabled={targetIds.length === 0}
              onClick={() =>
                void applyHpMutation(targetIds, { type: "restore" })
              }
              className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] hover:bg-stone-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
              title="Restaurar PV"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
            <button
              type="button"
              disabled={targetIds.length === 0}
              onClick={() =>
                void updateVisibility(targetIds, {
                  publicExactHp: false,
                  publicArmorClass: false,
                })
              }
              className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] hover:bg-stone-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
              title="Ocultar PV exatos e CA dos selecionados"
            >
              <EyeOff className="h-3 w-3" />
            </button>
            <button
              type="button"
              disabled={targetIds.length === 0}
              onClick={() =>
                void updateVisibility(targetIds, {
                  publicExactHp: true,
                  publicArmorClass: true,
                })
              }
              className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] hover:bg-stone-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
              title="Revelar PV exatos e CA dos selecionados"
            >
              <Eye className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Combatentes */}
      {orderedInstances.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 p-5 text-center text-stone-500 dark:border-slate-700 dark:text-slate-400">
          Nenhum combatente na cena.
        </div>
      ) : (
        <div className="space-y-1.5">
          {orderedInstances.map((inst) => {
            const sheet = sheetsById.get(inst.templateId);
            const name = inst.individualName || sheet?.name || "Criatura";
            const isActiveTurn = activeTurnItemId === inst.boundItemId;
            const statusText =
              inst.currentHp <= 0
                ? "Caído"
                : inst.currentHp <= inst.maxHp * 0.5
                  ? "Ferido"
                  : "Normal";

            return (
              <div
                key={inst.boundItemId}
                className={cn(
                  "rounded-lg border p-2 transition",
                  isActiveTurn
                    ? "border-amber-500 bg-amber-50/70 shadow-sm dark:bg-amber-950/25"
                    : "border-stone-300/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/80",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(inst.boundItemId)}
                      onChange={() => toggleSelect(inst.boundItemId)}
                      aria-label={`Selecionar ${name}`}
                    />
                    {showInitiative && (
                      <input
                        type="number"
                        value={inst.initiative ?? ""}
                        placeholder="Init"
                        onChange={(e) =>
                          void setInstanceInitiative(
                            inst.boundItemId,
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                        className="w-11 rounded border border-stone-300 bg-white px-1 py-0.5 text-center text-[11px] font-semibold dark:border-slate-700 dark:bg-slate-950"
                      />
                    )}
                    <span className="truncate font-semibold">{name}</span>
                    <Badge
                      variant={
                        inst.currentHp <= 0
                          ? "monster"
                          : inst.currentHp <= inst.maxHp * 0.5
                            ? "warning"
                            : "success"
                      }
                    >
                      {statusText}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-300">
                      <Shield className="h-3 w-3" /> {inst.armorClass}
                    </span>
                    <span className="font-mono text-[11px] font-bold">
                      {inst.currentHp}/{inst.maxHp}
                      {inst.tempHp > 0 && (
                        <span className="ml-1 text-sky-500">+{inst.tempHp}</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Condições ativas e concentração */}
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        void setConcentrating(
                          inst.boundItemId,
                          inst.concentratingOn ? null : "Magia",
                        )
                      }
                      title={
                        inst.concentratingOn
                          ? "Encerrar concentração"
                          : "Marcar Concentração"
                      }
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        inst.concentratingOn
                          ? "bg-amber-600 text-white"
                          : "border border-stone-300 text-stone-500 dark:border-slate-700",
                      )}
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                      Conc
                    </button>

                    {inst.conditions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          void removeCondition([inst.boundItemId], c.id)
                        }
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
                      onClick={() => setConditionTargetIds([inst.boundItemId])}
                      className="inline-flex items-center gap-0.5 rounded border border-dashed border-stone-400 px-1.5 py-0.5 text-[10px] hover:bg-stone-100 dark:border-slate-600 dark:hover:bg-slate-800"
                    >
                      <Plus className="h-2.5 w-2.5" /> Condição
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        void applyHpMutation([inst.boundItemId], {
                          type: "damage",
                          amount: 1,
                        })
                      }
                      className="rounded bg-red-600/80 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-red-700"
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void applyHpMutation([inst.boundItemId], {
                          type: "damage",
                          amount: 5,
                        })
                      }
                      className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-red-700"
                    >
                      -5
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void applyHpMutation([inst.boundItemId], {
                          type: "heal",
                          amount: 5,
                        })
                      }
                      className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700"
                    >
                      +5
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog de Aplicação de Condições */}
      {conditionTargetIds && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-stone-300 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-sm font-bold">
              Aplicar Condição ({conditionTargetIds.length} alvo(s))
            </h3>

            <div className="mt-2.5 space-y-2.5">
              <div>
                <label className="mb-1 block text-[11px] font-medium">
                  Condição do Catálogo D&D 5e
                </label>
                <select
                  value={selectedConditionId}
                  onChange={(e) => setSelectedConditionId(e.target.value)}
                  className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                >
                  {DND5E_CONDITIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.code}] {c.name}
                    </option>
                  ))}
                  <option value="__custom__">+ Condição Personalizada...</option>
                </select>
              </div>

              {selectedConditionId === "__custom__" ? (
                <input
                  type="text"
                  value={customCondName}
                  onChange={(e) => setCustomCondName(e.target.value)}
                  placeholder="Nome da condição personalizada (ex: Marcado)"
                  className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              ) : (
                <p className="rounded bg-stone-100 p-2 text-[11px] text-stone-600 dark:bg-slate-800 dark:text-slate-300">
                  {DND5E_CONDITIONS.find((c) => c.id === selectedConditionId)
                    ?.description2014}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[11px] font-medium">
                    Duração
                  </label>
                  <select
                    value={durationUnit}
                    onChange={(e) =>
                      setDurationUnit(e.target.value as ConditionDurationUnit)
                    }
                    className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="indefinite">Remoção manual</option>
                    <option value="rounds">Rodadas</option>
                    <option value="minutes">1 minuto</option>
                    <option value="until-next-turn">Até próximo turno</option>
                    <option value="until-end-of-turn">Até fim do turno</option>
                    <option value="concentration">Concentração</option>
                  </select>
                </div>
                {durationUnit === "rounds" && (
                  <div>
                    <label className="mb-0.5 block text-[11px] font-medium">
                      Nº Rodadas
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={durationRounds}
                      onChange={(e) =>
                        setDurationRounds(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConditionTargetIds(null)}
                className="rounded border border-stone-300 px-3 py-1 text-xs dark:border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targets = conditionTargetIds;
                  const cond =
                    selectedConditionId === "__custom__"
                      ? createCustomCondition({
                          name: customCondName || "Personalizada",
                          durationUnit,
                          duration:
                            durationUnit === "rounds" ? durationRounds : null,
                        })
                      : createConditionFromCatalog(selectedConditionId, {
                          durationUnit,
                          duration:
                            durationUnit === "rounds" ? durationRounds : null,
                        });
                  setConditionTargetIds(null);
                  setCustomCondName("");
                  await applyCondition(targets, cond);
                }}
                className="rounded bg-purple-600 px-3 py-1 text-xs font-semibold text-white hover:bg-purple-700"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
