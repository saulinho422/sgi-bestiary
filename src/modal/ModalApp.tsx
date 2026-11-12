import { useEffect, useMemo, useState } from "react";
import OBR, { type Image } from "@owlbear-rodeo/sdk";
import { Link2, Search, Shield, Heart, X } from "lucide-react";
import type { CreatureSheet } from "@/domain/entities/sheet";
import type {
  PublicTokenProjection,
  TokenInstance,
} from "@/domain/entities/tokenInstance";
import {
  applySheetUpdateToInstance,
  mutateInstanceStats,
  readPublicProjectionFromItem,
} from "@/services/instanceService";
import {
  bindItemsToSheet,
  closeModalById,
  ensureSceneScopeId,
  syncInstancesToObrItems,
} from "@/integrations/owlbear/obrBridge";
import { storageProvider } from "@/integrations/storage/dexieRepository";
import { getPluginId } from "@/utils/pluginId";
import { applyDomTheme, resolveDarkMode } from "@/utils/themeSync";
import { DiceRollerBar } from "@/components/common/DiceRollerBar";
import { Badge } from "@/components/common/UiPrimitives";
import { CreatureStatBlock } from "@/components/sheets/CreatureStatBlock";
import { PlayerPublicSheetView } from "@/components/sheets/PlayerPublicSheetView";
import { SheetEditorForm } from "@/components/sheets/SheetEditorForm";
import { getResolvedImageSrcFromRef } from "@/components/common/ImagePickerField";

export function ModalApp() {
  const params = new URLSearchParams(window.location.search);
  const view = (params.get("view") ?? "sheet") as "sheet" | "bind";
  const initialSheetId = params.get("sheetId") ?? "";
  const itemId = params.get("itemId") ?? "";
  const itemIdsParam = params.get("itemIds") ?? "";
  const initialMode = params.get("mode") === "edit" ? "edit" : "view";

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<"GM" | "PLAYER">("GM");
  const [sceneId, setSceneId] = useState("local-sandbox");
  const [sheets, setSheets] = useState<CreatureSheet[]>([]);
  const [sheet, setSheet] = useState<CreatureSheet | null>(null);
  const [instance, setInstance] = useState<TokenInstance | null>(null);
  const [playerProjection, setPlayerProjection] =
    useState<PublicTokenProjection | null>(null);
  const [targetItems, setTargetItems] = useState<Image[]>([]);

  const [mode, setMode] = useState<"view" | "edit">(initialMode);
  const [rollMode, setRollMode] = useState<"normal" | "advantage" | "disadvantage">("normal");
  const [rollVisibility, setRollVisibility] = useState<"public" | "gm-only">("public");
  const [bindSearch, setBindSearch] = useState("");
  const [selectedBindId, setSelectedBindId] = useState("");
  const [rememberMapping, setRememberMapping] = useState(false);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const cfg = await storageProvider.settings.getSettings();
      const dark = await resolveDarkMode(cfg.ui.theme);
      applyDomTheme(dark, cfg.ui.fontSize);

      if (!mounted) return;
      const playerRole = OBR.isAvailable ? await OBR.player.getRole() : "GM";
      const scId = OBR.isAvailable ? await ensureSceneScopeId() : "local-sandbox";
      if (!mounted) return;
      setRole(playerRole);
      setSceneId(scId);

      if (view === "bind") {
        const allSheets = await storageProvider.library.listSheets();
        const ids = itemIdsParam.split(",").filter(Boolean);
        const items =
          OBR.isAvailable && ids.length > 0
            ? await OBR.scene.items.getItems<Image>(ids)
            : [];
        if (!mounted) return;
        setSheets(allSheets);
        setSelectedBindId(allSheets[0]?.id ?? "");
        setTargetItems(items);
        setLoading(false);
        return;
      }

      // view === "sheet"
      if (playerRole === "PLAYER") {
        if (OBR.isAvailable && itemId) {
          const items = await OBR.scene.items.getItems<Image>([itemId]);
          const proj = items[0] ? readPublicProjectionFromItem(items[0]) : null;
          if (mounted) setPlayerProjection(proj);
        }
        if (mounted) setLoading(false);
        return;
      }

      // GM carregando instância e ficha autoritativa local
      const [allSheets, inst] = await Promise.all([
        storageProvider.library.listSheets(),
        itemId
          ? storageProvider.instances.getInstance(itemId, scId)
          : Promise.resolve(undefined),
      ]);
      const targetSheet =
        allSheets.find((s) => s.id === (initialSheetId || inst?.templateId)) ??
        null;

      if (!mounted) return;
      setSheets(allSheets);
      setInstance(inst ?? null);
      setSheet(targetSheet);
      setLoading(false);
    };

    if (OBR.isAvailable) {
      if (OBR.isReady) void init();
      else OBR.onReady(() => void init());
    } else {
      void init();
    }

    return () => {
      mounted = false;
    };
  }, [view, initialSheetId, itemId, itemIdsParam]);

  const filteredBindSheets = useMemo(() => {
    const q = bindSearch.trim().toLowerCase();
    return sheets.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.creatureType.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [sheets, bindSearch]);

  const handleClose = () => {
    void closeModalById(
      getPluginId(view === "bind" ? "bind-modal" : "sheet-modal"),
    );
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-(--sgi-bg) text-xs text-(--sgi-text)">
        Carregando janela...
      </div>
    );
  }

  if (view === "bind") {
    return (
      <div className="flex h-screen flex-col bg-(--sgi-bg) p-4 text-xs text-(--sgi-text)">
        <div className="mb-3 flex items-center justify-between border-b border-stone-300 pb-2 dark:border-slate-700">
          <div>
            <h1 className="text-sm font-bold">
              Vincular Ficha a {targetItems.length} Token(s)
            </h1>
            <p className="text-[11px] text-stone-500 dark:text-slate-400">
              Cada token receberá sua própria instância independente.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar"
            className="rounded p-1 hover:bg-stone-200 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            value={bindSearch}
            onChange={(e) => setBindSearch(e.target.value)}
            placeholder="Buscar ficha da biblioteca..."
            className="w-full rounded border border-stone-300 bg-white py-1.5 pl-7 pr-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {filteredBindSheets.map((sh) => {
            const thumb =
              getResolvedImageSrcFromRef(sh.tokenImage) ??
              getResolvedImageSrcFromRef(sh.portrait);
            const selected = selectedBindId === sh.id;
            return (
              <button
                key={sh.id}
                type="button"
                onClick={() => setSelectedBindId(sh.id)}
                className={
                  selected
                    ? "flex w-full items-center justify-between gap-2 rounded-lg border-2 border-amber-500 bg-amber-50/70 p-2 text-left dark:bg-slate-800"
                    : "flex w-full items-center justify-between gap-2 rounded-lg border border-stone-300 bg-white/80 p-2 text-left hover:border-stone-400 dark:border-slate-800 dark:bg-slate-900"
                }
              >
                <div className="flex min-w-0 items-center gap-2">
                  {thumb && (
                    <img
                      src={thumb}
                      alt={sh.name}
                      className="h-8 w-8 rounded object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-bold">{sh.name}</div>
                    <div className="flex items-center gap-2 text-[11px] text-stone-500">
                      <Badge variant={sh.kind}>{sh.kind}</Badge>
                      <span className="inline-flex items-center gap-0.5">
                        <Shield className="h-3 w-3" /> {sh.armorClass.value}
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <Heart className="h-3 w-3" /> {sh.hitPoints.maximum}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-3 space-y-2 border-t border-stone-300 pt-3 dark:border-slate-700">
          <label className="flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              checked={rememberMapping}
              onChange={(e) => setRememberMapping(e.target.checked)}
            />
            <span>
              Reconhecer automaticamente novos tokens com esta mesma imagem
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded border border-stone-300 px-3 py-1.5 dark:border-slate-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!selectedBindId || targetItems.length === 0}
              onClick={async () => {
                const chosen = sheets.find((s) => s.id === selectedBindId);
                if (!chosen) return;
                await bindItemsToSheet({
                  items: targetItems,
                  sheet: chosen,
                  rememberImageMapping: rememberMapping,
                });
                handleClose();
              }}
              className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5" /> Confirmar Vínculo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--sgi-bg) text-(--sgi-text)">
      <header className="flex shrink-0 items-center justify-between border-b border-stone-300 bg-(--sgi-surface) px-4 py-2 dark:border-slate-800">
        <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-slate-400">
          SGI Bestiary — Visualização Expandida
        </span>
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex items-center gap-1 rounded border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <X className="h-3.5 w-3.5" /> Fechar
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {role === "PLAYER" ? (
          playerProjection ? (
            <PlayerPublicSheetView
              projection={playerProjection}
              rollMode={rollMode}
            />
          ) : (
            <div className="p-8 text-center text-xs text-stone-500">
              Ficha indisponível ou restrita ao Mestre.
            </div>
          )
        ) : mode === "edit" && sheet ? (
          <SheetEditorForm
            initialSheet={sheet}
            hasActiveInstances={Boolean(instance)}
            onSave={async (updated, syncMode) => {
              const saved: CreatureSheet = {
                ...updated,
                updatedAt: new Date().toISOString(),
              };
              await storageProvider.library.saveSheet(saved);
              setSheet(saved);

              if (syncMode !== "future-only") {
                const sceneInsts =
                  await storageProvider.instances.listInstancesByScene(sceneId);
                const matching = sceneInsts.filter((i) => i.templateId === saved.id);
                if (matching.length > 0) {
                  const updatedInsts = matching.map((i) =>
                    applySheetUpdateToInstance(i, saved, syncMode),
                  );
                  await storageProvider.instances.saveInstancesBulk(updatedInsts);
                  const currentMine = updatedInsts.find(
                    (i) => i.boundItemId === itemId,
                  );
                  if (currentMine) setInstance(currentMine);
                  await syncInstancesToObrItems(
                    updatedInsts,
                    new Map([[saved.id, saved]]),
                  );
                }
              }
              setMode("view");
            }}
            onCancel={() => setMode("view")}
          />
        ) : sheet ? (
          <CreatureStatBlock
            sheet={sheet}
            instance={instance ?? undefined}
            viewerRole="GM"
            defaultMode="full"
            rollMode={rollMode}
            rollVisibility={rollVisibility}
            canEdit
            onEdit={() => setMode("edit")}
            onHpCommand={
              instance
                ? async (cmd) => {
                    const updated = mutateInstanceStats(
                      instance,
                      { type: "command", command: cmd },
                      sheet,
                    );
                    setInstance(updated);
                    await storageProvider.instances.saveInstance(updated);
                    await syncInstancesToObrItems(
                      [updated],
                      new Map([[sheet.id, sheet]]),
                    );
                  }
                : undefined
            }
            onConsumeResource={
              instance
                ? async (featureId, delta) => {
                    const current = instance.consumedResources[featureId] ?? 0;
                    const updated: TokenInstance = {
                      ...instance,
                      consumedResources: {
                        ...instance.consumedResources,
                        [featureId]: Math.max(0, current + delta),
                      },
                      updatedAt: new Date().toISOString(),
                    };
                    setInstance(updated);
                    await storageProvider.instances.saveInstance(updated);
                  }
                : undefined
            }
          />
        ) : (
          <div className="p-8 text-center text-xs text-stone-500">
            Ficha não encontrada na biblioteca local.
          </div>
        )}
      </main>

      <footer className="shrink-0">
        <DiceRollerBar
          rollMode={rollMode}
          onChangeMode={setRollMode}
          rollVisibility={rollVisibility}
          onChangeVisibility={setRollVisibility}
        />
      </footer>
    </div>
  );
}
