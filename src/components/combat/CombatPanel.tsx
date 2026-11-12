import { useEffect, useMemo, useState } from "react";
import {
  Dices,
  Eye,
  EyeOff,
  Flame,
  Heart,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Swords,
  Trash2,
  UserPlus,
} from "lucide-react";
import type { ConditionDurationUnit } from "@/domain/entities/tokenInstance";
import {
  DND5E_CONDITIONS,
  createConditionFromCatalog,
  createCustomCondition,
} from "@/domain/rules/conditionsCatalog";
import { isObrAvailable, openSheetModal } from "@/integrations/owlbear/obrBridge";
import { sortEncounterParticipants } from "@/services/combatService";
import { useBestiaryStore } from "@/stores/useBestiaryStore";
import { CombatTurnCard } from "./CombatTurnCard";

export function CombatPanel({
  rollMode = "normal",
  rollVisibility = "public",
  onNavigateToScene,
  onOpenSheetInline,
}: {
  rollMode?: "normal" | "advantage" | "disadvantage";
  rollVisibility?: "public" | "gm-only";
  onNavigateToScene?: () => void;
  onOpenSheetInline?: (sheetId: string, itemId: string) => void;
}) {
  const role = useBestiaryStore((s) => s.role);
  const sheets = useBestiaryStore((s) => s.sheets);
  const instances = useBestiaryStore((s) => s.instances);
  const encounters = useBestiaryStore((s) => s.encounters);
  const activeEncounterId = useBestiaryStore((s) => s.activeEncounterId);
  const initiative = useBestiaryStore((s) => s.initiative);
  const settings = useBestiaryStore((s) => s.settings);

  const createEncounter = useBestiaryStore((s) => s.createEncounter);
  const selectEncounter = useBestiaryStore((s) => s.selectEncounter);
  const deleteEncounter = useBestiaryStore((s) => s.deleteEncounter);
  const addParticipantsToCombat = useBestiaryStore(
    (s) => s.addParticipantsToCombat,
  );
  const removeParticipantsFromCombat = useBestiaryStore(
    (s) => s.removeParticipantsFromCombat,
  );
  const adjustParticipantOrder = useBestiaryStore(
    (s) => s.adjustParticipantOrder,
  );
  const applyHpMutation = useBestiaryStore((s) => s.applyHpMutation);
  const applyCondition = useBestiaryStore((s) => s.applyCondition);
  const removeCondition = useBestiaryStore((s) => s.removeCondition);
  const updateVisibility = useBestiaryStore((s) => s.updateVisibility);
  const setConcentrating = useBestiaryStore((s) => s.setConcentrating);
  const consumeResource = useBestiaryStore((s) => s.consumeResource);
  const setInstanceInitiative = useBestiaryStore((s) => s.setInstanceInitiative);
  const rollAllInitiatives = useBestiaryStore((s) => s.rollAllInitiatives);
  const startCombat = useBestiaryStore((s) => s.startCombat);
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
  const [manualExpandOverrides, setManualExpandOverrides] = useState<
    Record<string, boolean>
  >({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set());

  const sheetsById = useMemo(
    () => new Map(sheets.map((s) => [s.id, s])),
    [sheets],
  );
  const instancesByItemId = useMemo(
    () => new Map(instances.map((i) => [i.boundItemId, i])),
    [instances],
  );

  const activeEncounter = useMemo(() => {
    if (encounters.length === 0) return null;
    if (activeEncounterId) {
      return encounters.find((e) => e.id === activeEncounterId) ?? encounters[0];
    }
    return encounters[0];
  }, [encounters, activeEncounterId]);

  const sortedParticipants = useMemo(() => {
    if (!activeEncounter) return [];
    const ordered = sortEncounterParticipants(
      activeEncounter.participants,
      instancesByItemId,
      sheetsById,
    );
    return ordered.filter((p) => instancesByItemId.has(p.itemId));
  }, [activeEncounter, instancesByItemId, sheetsById]);

  const participantItemIds = useMemo(
    () => new Set(sortedParticipants.map((p) => p.itemId)),
    [sortedParticipants],
  );

  // Limpa seleções de quem não faz mais parte do combate
  useEffect(() => {
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (participantItemIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [participantItemIds]);

  // Critério 2: Ao mudar de turno, recolhe o card anterior e expande automaticamente o ativo
  useEffect(() => {
    setManualExpandOverrides({});
  }, [
    activeEncounter?.id,
    activeEncounter?.active,
    activeEncounter?.activeParticipantItemId,
    activeEncounter?.round,
  ]);

  const availableToAdd = useMemo(
    () => instances.filter((inst) => !participantItemIds.has(inst.boundItemId)),
    [instances, participantItemIds],
  );

  const activeTurnItemId =
    activeEncounter?.active && activeEncounter.activeParticipantItemId
      ? activeEncounter.activeParticipantItemId
      : null;

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
      {/* Cabeçalho Turnos & Iniciativa + Seleção de Encontro */}
      <div className="space-y-2 rounded-lg border border-stone-300/80 bg-white/90 p-2 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 font-bold text-stone-800 dark:text-slate-100">
            <Swords className="h-3.5 w-3.5 text-amber-500" />
            <span>
              Turnos & Iniciativa
              {activeEncounter?.active
                ? ` • Rodada ${activeEncounter.round}`
                : ""}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => void rollAllInitiatives({ rerollExisting: false })}
              disabled={sortedParticipants.length === 0}
              title="Rolar iniciativa para monstros e NPCs sem iniciativa definida"
              className="inline-flex items-center gap-1 rounded bg-stone-800 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-stone-900 disabled:opacity-40 dark:bg-slate-700"
            >
              <Dices className="h-3 w-3" /> Rolar
            </button>
            <button
              type="button"
              onClick={() => void rollAllInitiatives({ rerollExisting: true })}
              disabled={sortedParticipants.length === 0}
              title="Rerolar iniciativa de todos os monstros e NPCs do combate"
              className="inline-flex items-center gap-1 rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] font-medium hover:bg-stone-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <RefreshCw className="h-3 w-3" /> Rerolar
            </button>

            {!activeEncounter?.active ? (
              <button
                type="button"
                onClick={() => void startCombat()}
                disabled={sortedParticipants.length === 0}
                className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                <Play className="h-3 w-3" /> Iniciar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void nextTurn()}
                disabled={sortedParticipants.length === 0}
                className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
              >
                <SkipForward className="h-3 w-3" /> Próximo
              </button>
            )}

            {sortedParticipants.length > 0 && (
              <button
                type="button"
                onClick={() => void resetInitiative()}
                title="Zerar iniciativas deste combate"
                className="rounded p-1 text-stone-500 hover:bg-stone-200 dark:hover:bg-slate-800"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Seletor de encontros múltiplos & inclusão direta */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-stone-200/70 pt-1.5 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1">
            {encounters.length > 0 && (
              <select
                value={activeEncounter?.id ?? ""}
                onChange={(e) => void selectEncounter(e.target.value)}
                aria-label="Selecionar encontro"
                className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] font-medium dark:border-slate-700 dark:bg-slate-950"
              >
                {encounters.map((enc) => (
                  <option key={enc.id} value={enc.id}>
                    {enc.name} ({enc.participants.length})
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => void createEncounter()}
              title="Criar novo encontro vazio para outro mapa da cena"
              className="inline-flex items-center gap-0.5 rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] font-medium hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <Plus className="h-3 w-3" /> Novo combate
            </button>
            {activeEncounter && encounters.length > 1 && (
              <button
                type="button"
                onClick={() => void deleteEncounter(activeEncounter.id)}
                title="Excluir este encontro (mantém tokens na cena)"
                className="rounded p-1 text-red-600 hover:bg-red-500/10"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setPickerSelection(new Set());
              setPickerOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded bg-red-700 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-800"
          >
            <UserPlus className="h-3 w-3" /> Adicionar participantes
          </button>
        </div>
      </div>

      {/* Painel de Ações em Massa (apenas quando há participantes no combate) */}
      {sortedParticipants.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50/70 p-2 dark:bg-slate-900/90">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(
                    selectedIds.size === sortedParticipants.length
                      ? new Set()
                      : new Set(sortedParticipants.map((p) => p.itemId)),
                  )
                }
                className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] font-medium dark:border-slate-700 dark:bg-slate-800"
              >
                {selectedIds.size === sortedParticipants.length &&
                sortedParticipants.length > 0
                  ? "Desmarcar"
                  : "Todos"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(
                    new Set(
                      sortedParticipants
                        .filter((p) => {
                          const inst = instancesByItemId.get(p.itemId);
                          return inst?.category === "monster";
                        })
                        .map((p) => p.itemId),
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

            <div className="flex flex-wrap items-center gap-1">
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
      )}

      {/* Lista de Participantes do Combate Ativo (ou Estado Vazio Explícito) */}
      {sortedParticipants.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed border-stone-300 p-6 text-center text-stone-500 dark:border-slate-700 dark:text-slate-400">
          <div className="space-y-1">
            <p className="font-semibold text-stone-700 dark:text-slate-200">
              Nenhum participante adicionado ao combate.
            </p>
            <p className="text-[11px]">
              Selecione criaturas na aba Cena para iniciar um encontro.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {instances.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPickerSelection(new Set());
                  setPickerOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
              >
                <UserPlus className="h-3.5 w-3.5" /> + Adicionar participantes
              </button>
            )}
            {onNavigateToScene && (
              <button
                type="button"
                onClick={onNavigateToScene}
                className="rounded border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Ir para Cena
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sortedParticipants.map((participant, idx) => {
            const inst = instancesByItemId.get(participant.itemId);
            if (!inst) return null;
            const sheet = sheetsById.get(inst.templateId);
            const isActiveTurn = activeTurnItemId === participant.itemId;
            const defaultExpanded = isActiveTurn;
            const isExpanded =
              manualExpandOverrides[participant.itemId] ?? defaultExpanded;

            const prevP = idx > 0 ? sortedParticipants[idx - 1] : undefined;
            const nextP =
              idx < sortedParticipants.length - 1
                ? sortedParticipants[idx + 1]
                : undefined;

            const hasSameInitAbove =
              participant.initiative !== null &&
              prevP?.initiative === participant.initiative;
            const hasSameInitBelow =
              participant.initiative !== null &&
              nextP?.initiative === participant.initiative;

            return (
              <CombatTurnCard
                key={participant.itemId}
                instance={inst}
                sheet={sheet}
                participant={participant}
                isActiveTurn={isActiveTurn}
                isExpanded={isExpanded}
                hasSameInitAbove={hasSameInitAbove}
                hasSameInitBelow={hasSameInitBelow}
                isSelected={selectedIds.has(participant.itemId)}
                rollMode={rollMode}
                rollVisibility={rollVisibility}
                tempHpRule={settings.ui.tempHpRule}
                onToggleSelect={() => toggleSelect(participant.itemId)}
                onToggleExpand={() =>
                  setManualExpandOverrides((prev) => ({
                    ...prev,
                    [participant.itemId]: !isExpanded,
                  }))
                }
                onSetInitiative={(val) =>
                  void setInstanceInitiative(participant.itemId, val)
                }
                onRollIndividualInitiative={() =>
                  void rollAllInitiatives({
                    rerollExisting: true,
                    onlyItemIds: [participant.itemId],
                  })
                }
                onAdjustTieOrder={(dir) =>
                  void adjustParticipantOrder(participant.itemId, dir)
                }
                onRemoveFromCombat={() =>
                  void removeParticipantsFromCombat([participant.itemId])
                }
                onOpenSheet={() => {
                  if (isObrAvailable()) {
                    void openSheetModal({
                      itemId: inst.boundItemId,
                      sheetId: inst.templateId,
                      mode: "view",
                    });
                  } else if (onOpenSheetInline) {
                    onOpenSheetInline(inst.templateId, inst.boundItemId);
                  }
                }}
                onHpMutation={(mutation) =>
                  void applyHpMutation([participant.itemId], mutation)
                }
                onConsumeResource={(featureId, delta) =>
                  void consumeResource(participant.itemId, featureId, delta)
                }
                onToggleConcentration={() =>
                  void setConcentrating(
                    participant.itemId,
                    inst.concentratingOn ? null : "Magia",
                  )
                }
                onRemoveCondition={(conditionId) =>
                  void removeCondition([participant.itemId], conditionId)
                }
                onOpenConditionModal={() =>
                  setConditionTargetIds([participant.itemId])
                }
              />
            );
          })}
        </div>
      )}

      {/* Dialog: Adicionar Participantes da Cena ao Combate */}
      {pickerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-stone-300 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-sm font-bold">
              Adicionar participantes ao combate
            </h3>
            <p className="mt-1 text-[11px] text-stone-500 dark:text-slate-400">
              Escolha quais criaturas da cena entrarão neste encontro.
            </p>

            {availableToAdd.length === 0 ? (
              <div className="mt-3 rounded border border-dashed border-stone-300 p-3 text-center text-[11px] text-stone-500 dark:border-slate-700 dark:text-slate-400">
                Todas as criaturas vinculadas da cena já estão neste combate (ou não há criaturas na cena).
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    onClick={() =>
                      setPickerSelection(
                        pickerSelection.size === availableToAdd.length
                          ? new Set()
                          : new Set(availableToAdd.map((i) => i.boundItemId)),
                      )
                    }
                    className="rounded border border-stone-300 px-2 py-0.5 font-medium dark:border-slate-700"
                  >
                    {pickerSelection.size === availableToAdd.length
                      ? "Desmarcar todos"
                      : "Selecionar todos"}
                  </button>
                  <span className="font-semibold">
                    {pickerSelection.size} selecionada(s)
                  </span>
                </div>

                <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {availableToAdd.map((inst) => {
                    const sheet = sheetsById.get(inst.templateId);
                    const label = inst.individualName || sheet?.name || "Criatura";
                    return (
                      <label
                        key={inst.boundItemId}
                        className="flex cursor-pointer items-center justify-between gap-2 rounded border border-stone-200 px-2 py-1.5 hover:bg-stone-50 dark:border-slate-800 dark:hover:bg-slate-800/70"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={pickerSelection.has(inst.boundItemId)}
                            onChange={() =>
                              setPickerSelection((prev) => {
                                const next = new Set(prev);
                                if (next.has(inst.boundItemId)) {
                                  next.delete(inst.boundItemId);
                                } else {
                                  next.add(inst.boundItemId);
                                }
                                return next;
                              })
                            }
                          />
                          <span className="truncate font-medium">{label}</span>
                        </div>
                        <span className="text-[10px] text-stone-500 dark:text-slate-400">
                          PV {inst.currentHp}/{inst.maxHp}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded border border-stone-300 px-3 py-1 text-xs dark:border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pickerSelection.size === 0}
                onClick={async () => {
                  const ids = Array.from(pickerSelection);
                  setPickerOpen(false);
                  await addParticipantsToCombat(ids);
                }}
                className="rounded bg-red-700 px-3 py-1 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-40"
              >
                Adicionar ({pickerSelection.size})
              </button>
            </div>
          </div>
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
                        setDurationRounds(
                          Math.max(1, Number(e.target.value) || 1),
                        )
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
