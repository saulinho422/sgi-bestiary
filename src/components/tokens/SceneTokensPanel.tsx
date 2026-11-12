import { useEffect, useMemo, useState } from "react";
import {
  Crosshair,
  Eye,
  EyeOff,
  FileText,
  Heart,
  Link2,
  Shield,
  Swords,
  Trash2,
  Unlink,
} from "lucide-react";
import type { Image } from "@owlbear-rodeo/sdk";
import type { VisibilityPolicy } from "@/domain/entities/sheet";
import type { TokenInstance } from "@/domain/entities/tokenInstance";
import {
  focusTokenOnMap,
  isObrAvailable,
  openSheetModal,
} from "@/integrations/owlbear/obrBridge";
import { getActivePendingSpawnIds } from "@/services/sceneSyncService";
import { useBestiaryStore } from "@/stores/useBestiaryStore";
import { cn } from "@/utils/cn";
import { Badge } from "../common/UiPrimitives";

export function SceneTokensPanel({
  onOpenSheetInline,
  onNavigateToCombat,
}: {
  onOpenSheetInline?: (sheetId: string, itemId: string) => void;
  onNavigateToCombat?: () => void;
}) {
  const role = useBestiaryStore((s) => s.role);
  const obrConnected = useBestiaryStore((s) => s.obrConnected);
  const sceneReady = useBestiaryStore((s) => s.sceneReady);
  const sheets = useBestiaryStore((s) => s.sheets);
  const instances = useBestiaryStore((s) => s.instances);
  const encounters = useBestiaryStore((s) => s.encounters);
  const activeEncounterId = useBestiaryStore((s) => s.activeEncounterId);
  const sceneImages = useBestiaryStore((s) => s.sceneImages);
  const publicProjections = useBestiaryStore((s) => s.publicProjectionsByItemId);
  const bindTokens = useBestiaryStore((s) => s.bindTokens);
  const unbindTokens = useBestiaryStore((s) => s.unbindTokens);
  const deleteTokensFromScene = useBestiaryStore((s) => s.deleteTokensFromScene);
  const addParticipantsToCombat = useBestiaryStore(
    (s) => s.addParticipantsToCombat,
  );
  const applyHpMutation = useBestiaryStore((s) => s.applyHpMutation);
  const updateVisibility = useBestiaryStore((s) => s.updateVisibility);

  const [filterKind, setFilterKind] = useState<"all" | "enemies" | "allies">("all");
  const [sortBy, setSortBy] = useState<"name" | "hp" | "initiative">("name");
  const [selectedForCombatIds, setSelectedForCombatIds] = useState<Set<string>>(
    new Set(),
  );
  const [bindingImage, setBindingImage] = useState<Image | null>(null);
  const [selectedBindSheetId, setSelectedBindSheetId] = useState<string>("");
  const [rememberMapping, setRememberMapping] = useState(false);
  const [visibilityOpenFor, setVisibilityOpenFor] = useState<string | null>(null);
  const [inlineCmdById, setInlineCmdById] = useState<Record<string, string>>({});

  const sheetsById = useMemo(
    () => new Map(sheets.map((s) => [s.id, s])),
    [sheets],
  );

  const activeEncounter = useMemo(() => {
    if (encounters.length === 0) return null;
    if (activeEncounterId) {
      return encounters.find((e) => e.id === activeEncounterId) ?? encounters[0];
    }
    return encounters[0];
  }, [encounters, activeEncounterId]);

  const inCombatItemIds = useMemo(
    () => new Set(activeEncounter?.participants.map((p) => p.itemId) ?? []),
    [activeEncounter],
  );

  const participantInitByItemId = useMemo(
    () =>
      new Map(
        activeEncounter?.participants.map((p) => [p.itemId, p.initiative]) ?? [],
      ),
    [activeEncounter],
  );

  const sceneImageIds = useMemo(
    () => new Set(sceneImages.map((img) => img.id)),
    [sceneImages],
  );

  const linkedRows = useMemo(() => {
    if (role === "GM") {
      const pendingIds = getActivePendingSpawnIds();
      const validInstances =
        obrConnected && sceneReady
          ? instances.filter(
              (inst) =>
                sceneImageIds.has(inst.boundItemId) ||
                pendingIds.has(inst.boundItemId),
            )
          : instances;

      return validInstances
        .map((inst) => {
          const sheet = sheetsById.get(inst.templateId);
          const item = sceneImages.find((img) => img.id === inst.boundItemId);
          return {
            itemId: inst.boundItemId,
            name: inst.individualName || sheet?.name || item?.name || "Criatura",
            category: inst.category,
            templateId: inst.templateId,
            currentHp: inst.currentHp as number | undefined,
            maxHp: inst.maxHp as number | undefined,
            hpRatio: inst.currentHp / Math.max(1, inst.maxHp),
            tempHp: inst.tempHp as number | undefined,
            ac: inst.armorClass as number | undefined,
            conditions: inst.conditions.map((c) => ({
              id: c.id,
              code: c.code,
              name: c.name,
              color: c.color,
            })),
            initiative:
              participantInitByItemId.get(inst.boundItemId) ??
              inst.initiative ??
              null,
            inCombat: inCombatItemIds.has(inst.boundItemId),
            visibility: inst.visibility,
            gmInstance: inst,
          };
        })
        .filter((r) => {
          if (filterKind === "enemies") return r.category === "monster";
          if (filterKind === "allies") return r.category !== "monster";
          return true;
        })
        .sort((a, b) => {
          if (sortBy === "hp") return (a.hpRatio ?? 0) - (b.hpRatio ?? 0);
          if (sortBy === "initiative") {
            return (b.initiative ?? -999) - (a.initiative ?? -999);
          }
          return a.name.localeCompare(b.name, "pt-BR");
        });
    }

    // Jogadores veem APENAS projeções públicas autorizadas
    return Object.values(publicProjections)
      .filter((proj) => {
        const img = sceneImages.find((i) => i.id === proj.boundItemId);
        return img ? img.visible : true;
      })
      .map((proj) => ({
        itemId: proj.boundItemId,
        name: proj.visibility.publicName
          ? proj.publicName || "Criatura"
          : "Criatura Desconhecida",
        category: proj.category,
        templateId: proj.templateId,
        currentHp: proj.currentHp,
        maxHp: proj.maxHp,
        hpRatio: proj.hpRatio,
        tempHp: proj.tempHp,
        ac: proj.armorClass,
        conditions: proj.conditions,
        initiative: null as number | null,
        inCombat: false,
        visibility: proj.visibility,
        gmInstance: undefined as TokenInstance | undefined,
      }));
  }, [
    role,
    obrConnected,
    sceneReady,
    instances,
    sceneImageIds,
    sheetsById,
    sceneImages,
    participantInitByItemId,
    inCombatItemIds,
    publicProjections,
    filterKind,
    sortBy,
  ]);

  const linkedItemIds = useMemo(
    () => new Set(linkedRows.map((r) => r.itemId)),
    [linkedRows],
  );

  // Limpa da seleção tokens removidos da cena
  useEffect(() => {
    setSelectedForCombatIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (linkedItemIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [linkedItemIds]);

  const unlinkedImages = useMemo(
    () => sceneImages.filter((img) => !linkedItemIds.has(img.id)),
    [sceneImages, linkedItemIds],
  );

  const toggleSelectForCombat = (itemId: string) => {
    setSelectedForCombatIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const selectedAddableCount = useMemo(
    () =>
      Array.from(selectedForCombatIds).filter((id) => !inCombatItemIds.has(id))
        .length,
    [selectedForCombatIds, inCombatItemIds],
  );

  return (
    <div className="space-y-2.5 text-xs">
      {/* Filtros & Ordenação */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1">
          {(
            [
              ["all", "Todos"],
              ["enemies", "Inimigos"],
              ["allies", "Aliados/PJs"],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilterKind(k)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-medium",
                filterKind === k
                  ? "bg-stone-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-stone-200/80 text-stone-700 dark:bg-slate-800 dark:text-slate-300",
              )}
            >
              {lbl}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          aria-label="Ordenar cena"
          className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="name">Nome</option>
          <option value="hp">Menor PV %</option>
          <option value="initiative">Iniciativa</option>
        </select>
      </div>

      {/* Barra de Seleção para Combate (Mestre) */}
      {role === "GM" && linkedRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-amber-500/35 bg-amber-50/70 px-2 py-1.5 dark:bg-slate-900/90">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const allVisibleIds = linkedRows.map((r) => r.itemId);
                const allSelected =
                  allVisibleIds.length > 0 &&
                  allVisibleIds.every((id) => selectedForCombatIds.has(id));
                setSelectedForCombatIds(
                  allSelected ? new Set() : new Set(allVisibleIds),
                );
              }}
              className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] font-medium dark:border-slate-700 dark:bg-slate-800"
            >
              {linkedRows.length > 0 &&
              linkedRows.every((r) => selectedForCombatIds.has(r.itemId))
                ? "Desmarcar"
                : "Selecionar todos"}
            </button>
            {selectedForCombatIds.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedForCombatIds(new Set())}
                className="text-[11px] text-stone-600 underline dark:text-slate-300"
              >
                Limpar
              </button>
            )}
            <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              {selectedForCombatIds.size} selecionada(s)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {inCombatItemIds.size > 0 && onNavigateToCombat && (
              <button
                type="button"
                onClick={onNavigateToCombat}
                className="rounded border border-stone-300 bg-white px-2 py-0.5 text-[11px] font-medium hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                Combate ({inCombatItemIds.size})
              </button>
            )}
            <button
              type="button"
              disabled={selectedForCombatIds.size === 0}
              onClick={async () => {
                const ids = Array.from(selectedForCombatIds);
                await addParticipantsToCombat(ids);
                setSelectedForCombatIds(new Set());
              }}
              className="inline-flex items-center gap-1 rounded bg-red-700 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-red-800 disabled:opacity-40"
            >
              <Swords className="h-3 w-3" />
              Adicionar ao combate
              {selectedAddableCount > 0 ? ` (${selectedAddableCount})` : ""}
            </button>
          </div>
        </div>
      )}

      {/* Criaturas Vinculadas */}
      {linkedRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 p-5 text-center text-stone-500 dark:border-slate-700 dark:text-slate-400">
          Nenhuma criatura vinculada na cena atual. Invoque pela{" "}
          <strong>Biblioteca</strong> ou vincule um token do mapa.
        </div>
      ) : (
        <div className="space-y-1.5">
          {linkedRows.map((row) => {
            const pct =
              row.hpRatio !== undefined ? Math.round(row.hpRatio * 100) : null;
            const canPlayerEdit =
              role === "GM" || row.visibility.playerCanEdit;
            const canViewSheet =
              role === "GM" ||
              row.visibility.publicSummarySheet ||
              row.visibility.publicFullSheet;

            return (
              <div
                key={row.itemId}
                className={cn(
                  "rounded-lg border p-2 transition",
                  selectedForCombatIds.has(row.itemId)
                    ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20"
                    : "border-stone-300/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/80",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    {role === "GM" && (
                      <input
                        type="checkbox"
                        checked={selectedForCombatIds.has(row.itemId)}
                        onChange={() => toggleSelectForCombat(row.itemId)}
                        aria-label={`Selecionar ${row.name} para combate`}
                        className="shrink-0"
                      />
                    )}
                    {isObrAvailable() && (
                      <button
                        type="button"
                        onClick={() => void focusTokenOnMap(row.itemId)}
                        title="Selecionar e centralizar no mapa"
                        className="rounded p-1 text-stone-500 hover:bg-stone-200 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        <Crosshair className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={!canViewSheet}
                      onClick={() => {
                        if (isObrAvailable()) {
                          void openSheetModal({
                            itemId: row.itemId,
                            sheetId: row.templateId,
                            mode: "view",
                          });
                        } else if (onOpenSheetInline) {
                          onOpenSheetInline(row.templateId, row.itemId);
                        }
                      }}
                      className="truncate text-left font-semibold hover:text-amber-600 disabled:cursor-default disabled:hover:text-inherit"
                    >
                      {row.name}
                    </button>

                    <Badge variant={row.category}>
                      {row.category === "monster"
                        ? "Monstro"
                        : row.category === "npc"
                          ? "NPC"
                          : "PJ"}
                    </Badge>

                    {row.inCombat && (
                      <Badge variant="success">No combate</Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {row.ac !== undefined && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-blue-600/15 px-1.5 py-0.5 text-[11px] font-bold text-blue-700 dark:text-blue-300">
                        <Shield className="h-3 w-3" /> {row.ac}
                      </span>
                    )}

                    {canViewSheet && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isObrAvailable()) {
                            void openSheetModal({
                              itemId: row.itemId,
                              sheetId: row.templateId,
                              mode: "view",
                            });
                          } else if (onOpenSheetInline) {
                            onOpenSheetInline(row.templateId, row.itemId);
                          }
                        }}
                        title="Abrir ficha"
                        className="rounded p-1 text-stone-600 hover:bg-stone-200 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {role === "GM" && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setVisibilityOpenFor((cur) =>
                              cur === row.itemId ? null : row.itemId,
                            )
                          }
                          title="Visibilidade dos jogadores"
                          className={cn(
                            "rounded p-1 hover:bg-stone-200 dark:hover:bg-slate-800",
                            !row.visibility.publicExactHp ||
                              !row.visibility.publicArmorClass
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-stone-600 dark:text-slate-300",
                          )}
                        >
                          {row.visibility.publicExactHp ? (
                            <Eye className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void unbindTokens([row.itemId])}
                          title="Desvincular ficha (mantém token no mapa)"
                          className="rounded p-1 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteTokensFromScene([row.itemId])}
                          title="Excluir token da cena (remove do mapa)"
                          className="rounded p-1 text-red-600 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Barra de vida + comando rápido */}
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-[140px] flex-1">
                    <div className="mb-0.5 flex items-center justify-between text-[11px]">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Heart className="h-3 w-3 text-red-500" />
                        {row.currentHp !== undefined && row.maxHp !== undefined
                          ? `${row.currentHp}/${row.maxHp}`
                          : pct !== null
                            ? `${pct}%`
                            : "PV ocultos"}
                        {row.tempHp !== undefined && row.tempHp > 0 && (
                          <span className="rounded bg-sky-600/20 px-1 text-[10px] font-bold text-sky-600 dark:text-sky-300">
                            +{row.tempHp}
                          </span>
                        )}
                      </span>
                      {row.conditions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {row.conditions.map((c) => (
                            <span
                              key={c.id}
                              title={c.name}
                              style={{ backgroundColor: c.color }}
                              className="rounded px-1 py-0.2 text-[9px] font-bold text-white"
                            >
                              {c.code}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {pct !== null && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800">
                        <div
                          className={cn(
                            "h-full transition-all",
                            pct <= 0
                              ? "bg-stone-500"
                              : pct >= 55
                                ? "bg-emerald-500"
                                : pct >= 25
                                  ? "bg-amber-500"
                                  : "bg-red-500",
                          )}
                          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {canPlayerEdit && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const cmd = (inlineCmdById[row.itemId] ?? "").trim();
                        if (!cmd) return;
                        void applyHpMutation([row.itemId], {
                          type: "command",
                          command: cmd,
                        });
                        setInlineCmdById((prev) => ({
                          ...prev,
                          [row.itemId]: "",
                        }));
                      }}
                      className="flex items-center gap-1"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          void applyHpMutation([row.itemId], {
                            type: "damage",
                            amount: 5,
                          })
                        }
                        className="rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-red-700"
                      >
                        -5
                      </button>
                      <input
                        type="text"
                        value={inlineCmdById[row.itemId] ?? ""}
                        onChange={(e) =>
                          setInlineCmdById((prev) => ({
                            ...prev,
                            [row.itemId]: e.target.value,
                          }))
                        }
                        placeholder="-8 / +5"
                        className="w-16 rounded border border-stone-300 bg-white px-1 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-950"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void applyHpMutation([row.itemId], {
                            type: "heal",
                            amount: 5,
                          })
                        }
                        className="rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700"
                      >
                        +5
                      </button>
                    </form>
                  )}
                </div>

                {/* Controle granular de visibilidade por token (Mestre) */}
                {role === "GM" && visibilityOpenFor === row.itemId && (
                  <div className="mt-2 grid grid-cols-2 gap-1 border-t border-stone-200 pt-2 text-[11px] dark:border-slate-800">
                    {(
                      [
                        ["publicName", "Nome público"],
                        ["publicHealthBar", "Barra de vida"],
                        ["publicExactHp", "PV numéricos"],
                        ["publicArmorClass", "Mostrar CA"],
                        ["publicTempHp", "Mostrar PV Temp"],
                        ["publicConditions", "Mostrar condições"],
                        ["publicSummarySheet", "Ficha resumida"],
                        ["publicFullSheet", "Ficha completa"],
                        ["playerCanEdit", "Jogador edita"],
                      ] as Array<[keyof VisibilityPolicy, string]>
                    ).map(([flag, lbl]) => (
                      <label key={flag} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={row.visibility[flag]}
                          onChange={(e) =>
                            void updateVisibility([row.itemId], {
                              [flag]: e.target.checked,
                            })
                          }
                        />
                        <span>{lbl}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tokens sem ficha no mapa */}
      {role === "GM" && unlinkedImages.length > 0 && (
        <div className="space-y-1.5 pt-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
            Tokens sem ficha na cena ({unlinkedImages.length})
          </div>
          {unlinkedImages.map((img) => (
            <div
              key={img.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-stone-300/70 bg-stone-50 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900/50"
            >
              <div className="flex min-w-0 items-center gap-2">
                <img
                  src={img.image.url}
                  alt={img.name}
                  className="h-7 w-7 rounded object-cover"
                />
                <span className="truncate font-medium">
                  {img.name || "Token sem nome"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBindingImage(img);
                  setSelectedBindSheetId(sheets[0]?.id ?? "");
                  setRememberMapping(false);
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
              >
                <Link2 className="h-3 w-3" /> Vincular
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal rápido de vinculação de token sem ficha */}
      {bindingImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-stone-300 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-sm font-bold">
              Vincular "{bindingImage.name || "Token"}"
            </h3>
            <div className="mt-2.5 space-y-2">
              <label className="block text-[11px] font-medium">
                Selecionar ficha da biblioteca
              </label>
              <select
                value={selectedBindSheetId}
                onChange={(e) => setSelectedBindSheetId(e.target.value)}
                className="w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                {sheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.kind.toUpperCase()} • CA {s.armorClass.value} • PV{" "}
                    {s.hitPoints.maximum})
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-1.5 text-[11px] text-stone-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={rememberMapping}
                  onChange={(e) => setRememberMapping(e.target.checked)}
                />
                <span>
                  Reconhecer automaticamente novos tokens com esta mesma imagem
                </span>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBindingImage(null)}
                className="rounded border border-stone-300 px-3 py-1 text-xs dark:border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const sheet = sheetsById.get(selectedBindSheetId);
                  const target = bindingImage;
                  setBindingImage(null);
                  if (sheet && target) {
                    await bindTokens([target], sheet, rememberMapping);
                  }
                }}
                className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Confirmar Vínculo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
