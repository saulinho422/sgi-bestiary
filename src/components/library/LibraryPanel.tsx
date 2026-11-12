import { useMemo, useState } from "react";
import {
  Copy,
  Download,
  Edit3,
  Eye,
  Heart,
  Maximize2,
  Plus,
  Search,
  Shield,
  Sparkles,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import type { CreatureSheet } from "@/domain/entities/sheet";
import {
  CREATURE_TYPE_LABELS_PT,
  parseCrToNumber,
} from "@/domain/rules/dnd5eRules";
import { createEmptySheet } from "@/domain/schemas/sheetSchema";
import type { Dnd5eRuleset, SheetCategory } from "@/domain/types/rpgSystem";
import {
  downloadJsonFile,
  exportSheetsBatchToJson,
  exportSingleSheetToJson,
  sanitizeSlugFilename,
} from "@/features/import-export/jsonExporter";
import { isObrAvailable, openSheetModal } from "@/integrations/owlbear/obrBridge";
import { useBestiaryStore } from "@/stores/useBestiaryStore";
import { cn } from "@/utils/cn";
import { Badge, ConfirmDialog } from "../common/UiPrimitives";
import { getResolvedImageSrcFromRef } from "../common/ImagePickerField";
import { CreatureStatBlock } from "../sheets/CreatureStatBlock";
import { SheetEditorForm } from "../sheets/SheetEditorForm";

export function LibraryPanel({
  rollMode,
  rollVisibility,
}: {
  rollMode: "normal" | "advantage" | "disadvantage";
  rollVisibility: "public" | "gm-only";
}) {
  const sheets = useBestiaryStore((s) => s.sheets);
  const instances = useBestiaryStore((s) => s.instances);
  const settings = useBestiaryStore((s) => s.settings);
  const role = useBestiaryStore((s) => s.role);
  const saveSheet = useBestiaryStore((s) => s.saveSheet);
  const deleteSheet = useBestiaryStore((s) => s.deleteSheet);
  const duplicateSheet = useBestiaryStore((s) => s.duplicateSheet);
  const toggleFavorite = useBestiaryStore((s) => s.toggleFavorite);
  const spawnCreatures = useBestiaryStore((s) => s.spawnCreatures);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | SheetCategory>("all");
  const [crFilter, setCrFilter] = useState<"all" | "low" | "mid" | "high" | "epic">("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "cr-asc" | "recent">("name-asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [viewingSheetId, setViewingSheetId] = useState<string | null>(null);
  const [editingSheet, setEditingSheet] = useState<CreatureSheet | null>(null);
  const [spawnTarget, setSpawnTarget] = useState<CreatureSheet | null>(null);
  const [spawnCount, setSpawnCount] = useState<number>(1);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<{
    ids: string[];
    label: string;
  } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = sheets.filter((s) => {
      if (categoryFilter !== "all" && s.kind !== categoryFilter) return false;
      if (onlyFavorites && !s.favorite) return false;

      if (crFilter !== "all") {
        const cr =
          s.kind === "character"
            ? s.characterDetails?.level ?? 1
            : parseCrToNumber(s.challengeRating);
        if (crFilter === "low" && cr > 1) return false;
        if (crFilter === "mid" && (cr <= 1 || cr > 4)) return false;
        if (crFilter === "high" && (cr <= 4 || cr > 10)) return false;
        if (crFilter === "epic" && cr <= 10) return false;
      }

      if (q) {
        const hay = [
          s.name,
          s.alias ?? "",
          s.creatureType,
          s.subtype ?? "",
          ...s.tags,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === "name-asc") return a.name.localeCompare(b.name, "pt-BR");
      if (sortBy === "name-desc") return b.name.localeCompare(a.name, "pt-BR");
      if (sortBy === "cr-asc") {
        const ca =
          a.kind === "character"
            ? a.characterDetails?.level ?? 1
            : parseCrToNumber(a.challengeRating);
        const cb =
          b.kind === "character"
            ? b.characterDetails?.level ?? 1
            : parseCrToNumber(b.challengeRating);
        return ca - cb;
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [sheets, search, categoryFilter, crFilter, onlyFavorites, sortBy]);

  const viewingSheet = viewingSheetId
    ? sheets.find((s) => s.id === viewingSheetId) ?? null
    : null;

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateNew = (kind: SheetCategory, ruleset: Dnd5eRuleset = "dnd5e-2014") => {
    setEditingSheet(createEmptySheet(kind, ruleset));
  };

  let content: React.ReactNode;

  if (editingSheet) {
    const hasActive = instances.some((i) => i.templateId === editingSheet.id);
    content = (
      <SheetEditorForm
        initialSheet={editingSheet}
        hasActiveInstances={hasActive}
        onSave={async (updated, syncMode) => {
          await saveSheet(updated, syncMode);
          setEditingSheet(null);
          setViewingSheetId(updated.id);
        }}
        onCancel={() => setEditingSheet(null)}
      />
    );
  } else if (viewingSheet) {
    content = (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewingSheetId(null)}
            className="rounded border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            ← Voltar à Biblioteca
          </button>
          <div className="flex items-center gap-1.5">
            {isObrAvailable() && (
              <button
                type="button"
                onClick={() =>
                  void openSheetModal({ sheetId: viewingSheet.id, mode: "view" })
                }
                className="inline-flex items-center gap-1 rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Janela Maior
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSpawnTarget(viewingSheet);
                setSpawnCount(1);
              }}
              className="inline-flex items-center gap-1 rounded bg-red-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-800"
            >
              <Users className="h-3.5 w-3.5" />
              Invocar
            </button>
          </div>
        </div>
        <CreatureStatBlock
          sheet={viewingSheet}
          viewerRole={role}
          defaultMode={settings.ui.defaultSheetMode}
          rollMode={rollMode}
          rollVisibility={rollVisibility}
          canEdit={role === "GM"}
          onEdit={() => setEditingSheet(viewingSheet)}
        />
      </div>
    );
  } else {
    content = (
      <div className="space-y-2.5 text-xs">
      {/* Barra de criação & busca */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="relative flex-1 min-w-[170px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, tipo, tag..."
            className="w-full rounded-md border border-stone-300 bg-white py-1 pl-7 pr-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleCreateNew("monster")}
            className="inline-flex items-center gap-1 rounded-md bg-red-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-800"
            title="Novo Monstro"
          >
            <Plus className="h-3 w-3" /> Monstro
          </button>
          <button
            type="button"
            onClick={() => handleCreateNew("npc")}
            className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
            title="Novo NPC"
          >
            <Plus className="h-3 w-3" /> NPC
          </button>
          <button
            type="button"
            onClick={() => handleCreateNew("character")}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700"
            title="Novo Personagem"
          >
            <Plus className="h-3 w-3" /> PJ
          </button>
        </div>
      </div>

      {/* Filtros & Ordenação */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              ["all", "Todos"],
              ["monster", "Monstros"],
              ["npc", "NPCs"],
              ["character", "PJs"],
            ] as const
          ).map(([cat, label]) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-medium",
                categoryFilter === cat
                  ? "bg-stone-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-stone-200/80 text-stone-700 hover:bg-stone-300 dark:bg-slate-800 dark:text-slate-300",
              )}
            >
              {label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setOnlyFavorites((f) => !f)}
            title="Filtrar favoritos"
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]",
              onlyFavorites
                ? "bg-amber-500/20 text-amber-600 dark:text-amber-300"
                : "bg-stone-200/70 text-stone-600 dark:bg-slate-800 dark:text-slate-400",
            )}
          >
            <Star className={cn("h-3 w-3", onlyFavorites && "fill-current")} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <select
            value={crFilter}
            onChange={(e) => setCrFilter(e.target.value as typeof crFilter)}
            aria-label="Filtrar por ND ou Nível"
            className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="all">ND/Nível: Todos</option>
            <option value="low">ND/Nível 0–1</option>
            <option value="mid">ND/Nível 2–4</option>
            <option value="high">ND/Nível 5–10</option>
            <option value="epic">ND/Nível 11+</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            aria-label="Ordenar fichas"
            className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="name-asc">A → Z</option>
            <option value="name-desc">Z → A</option>
            <option value="cr-asc">Menor ND/Nível</option>
            <option value="recent">Mais recentes</option>
          </select>
        </div>
      </div>

      {/* Barra de seleção múltipla */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-md border border-amber-500/40 bg-amber-50 px-2.5 py-1.5 dark:bg-amber-950/30">
          <span className="font-semibold">
            {selectedIds.size} selecionada(s)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const batch = sheets.filter((s) => selectedIds.has(s.id));
                downloadJsonFile(
                  `sgi-lote-${batch.length}.json`,
                  exportSheetsBatchToJson(batch),
                );
              }}
              className="inline-flex items-center gap-1 rounded bg-stone-800 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-stone-900"
            >
              <Download className="h-3 w-3" /> Exportar Lote
            </button>
            <button
              type="button"
              onClick={() =>
                setConfirmDeleteTarget({
                  ids: Array.from(selectedIds),
                  label: `${selectedIds.size} fichas selecionadas`,
                })
              }
              className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-red-700"
            >
              <Trash2 className="h-3 w-3" /> Excluir
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-[11px] underline"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* Lista densa e legível */}
      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-stone-500 dark:border-slate-700 dark:text-slate-400">
            Nenhuma ficha encontrada com os filtros atuais.
          </div>
        ) : (
          filtered.map((sheet) => {
            const thumb =
              getResolvedImageSrcFromRef(sheet.tokenImage) ??
              getResolvedImageSrcFromRef(sheet.portrait);
            const typePt =
              CREATURE_TYPE_LABELS_PT[sheet.creatureType.toUpperCase()] ??
              sheet.creatureType;

            return (
              <div
                key={sheet.id}
                className="group flex items-center gap-2 rounded-lg border border-stone-300/80 bg-white/90 px-2 py-1.5 transition hover:border-amber-500/70 dark:border-slate-800 dark:bg-slate-900/80"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(sheet.id)}
                  onChange={() => toggleSelection(sheet.id)}
                  aria-label={`Selecionar ${sheet.name}`}
                  className="shrink-0"
                />

                <div
                  onClick={() => setViewingSheetId(sheet.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-stone-300 bg-stone-100 dark:border-slate-700 dark:bg-slate-800">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={sheet.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Sparkles className="h-4 w-4 text-stone-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold text-stone-900 dark:text-slate-100">
                        {sheet.name}
                      </span>
                      <Badge variant={sheet.kind}>
                        {sheet.kind === "monster"
                          ? "Monstro"
                          : sheet.kind === "npc"
                            ? "NPC"
                            : "PJ"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500 dark:text-slate-400">
                      <span className="truncate">{typePt}</span>
                      <span>•</span>
                      <span>
                        {sheet.kind === "character"
                          ? `Nv ${sheet.characterDetails?.level ?? 1}`
                          : `ND ${sheet.challengeRating}`}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-300">
                        <Shield className="h-3 w-3" /> {sheet.armorClass.value}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400">
                        <Heart className="h-3 w-3" /> {sheet.hitPoints.maximum}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ações rápidas */}
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => void toggleFavorite(sheet.id)}
                    title={sheet.favorite ? "Remover favorito" : "Favoritar"}
                    className="rounded p-1 hover:bg-stone-200 dark:hover:bg-slate-800"
                  >
                    <Star
                      className={cn(
                        "h-3.5 w-3.5",
                        sheet.favorite
                          ? "fill-amber-400 text-amber-500"
                          : "text-stone-400",
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingSheetId(sheet.id)}
                    title="Visualizar ficha"
                    className="rounded p-1 text-stone-600 hover:bg-stone-200 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingSheet(sheet)}
                    title="Editar ficha"
                    className="rounded p-1 text-stone-600 hover:bg-stone-200 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSpawnTarget(sheet);
                      setSpawnCount(1);
                    }}
                    title="Invocar no mapa"
                    className="inline-flex items-center gap-0.5 rounded bg-red-700/90 px-1.5 py-1 text-[11px] font-semibold text-white hover:bg-red-800"
                  >
                    <Users className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void duplicateSheet(sheet.id)}
                    title="Duplicar ficha"
                    className="rounded p-1 text-stone-600 hover:bg-stone-200 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadJsonFile(
                        `${sanitizeSlugFilename(sheet.name)}.json`,
                        exportSingleSheetToJson(sheet),
                      )
                    }
                    title="Exportar JSON"
                    className="rounded p-1 text-stone-600 hover:bg-stone-200 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!settings.ui.confirmDelete) {
                        void deleteSheet(sheet.id);
                      } else {
                        setConfirmDeleteTarget({
                          ids: [sheet.id],
                          label: `"${sheet.name}"`,
                        });
                      }
                    }}
                    title="Excluir ficha"
                    className="rounded p-1 text-red-600 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      </div>
    );
  }

  return (
    <>
      {content}

      {/* Modal rápido de Invocação em Lote (disponível em todas as visualizações) */}
      {spawnTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-xs rounded-xl border border-stone-300 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-sm font-bold">
              Invocar {spawnTarget.name}
            </h3>
            <p className="mt-1 text-[11px] text-stone-500 dark:text-slate-400">
              Cada cópia receberá uma instância independente de PV, CA e condições.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 8].map((qty) => (
                <button
                  key={qty}
                  type="button"
                  onClick={() => setSpawnCount(qty)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-semibold",
                    spawnCount === qty
                      ? "border-red-600 bg-red-600 text-white"
                      : "border-stone-300 dark:border-slate-700",
                  )}
                >
                  {qty}×
                </button>
              ))}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <label className="text-xs font-medium">Quantidade:</label>
              <input
                type="number"
                min={1}
                max={50}
                value={spawnCount}
                onChange={(e) =>
                  setSpawnCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                }
                className="w-20 rounded border border-stone-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSpawnTarget(null)}
                className="rounded border border-stone-300 px-3 py-1 text-xs dark:border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = spawnTarget;
                  setSpawnTarget(null);
                  await spawnCreatures(target, spawnCount);
                }}
                className="rounded bg-red-700 px-3 py-1 text-xs font-semibold text-white hover:bg-red-800"
              >
                Invocar {spawnCount}×
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDeleteTarget)}
        title="Confirmar exclusão"
        message={`Deseja excluir permanentemente ${confirmDeleteTarget?.label ?? ""}? Instâncias já vinculadas na cena não quebram, mas perderão a ficha-base associada.`}
        confirmLabel="Excluir"
        onCancel={() => setConfirmDeleteTarget(null)}
        onConfirm={async () => {
          if (!confirmDeleteTarget) return;
          for (const id of confirmDeleteTarget.ids) {
            await deleteSheet(id);
          }
          setSelectedIds(new Set());
          setConfirmDeleteTarget(null);
        }}
      />
    </>
  );
}
