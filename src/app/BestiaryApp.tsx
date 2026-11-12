import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  FileJson,
  MapPin,
  Settings,
  Swords,
  X,
} from "lucide-react";
import OBR from "@owlbear-rodeo/sdk";
import { useBestiaryStore } from "@/stores/useBestiaryStore";
import { resolveAppPath } from "@/utils/assetUrls";
import { cn } from "@/utils/cn";
import { applyDomTheme, resolveDarkMode } from "@/utils/themeSync";
import { Badge } from "@/components/common/UiPrimitives";
import { DiceRollerBar } from "@/components/common/DiceRollerBar";
import { LibraryPanel } from "@/components/library/LibraryPanel";
import { SceneTokensPanel } from "@/components/tokens/SceneTokensPanel";
import { CombatPanel } from "@/components/combat/CombatPanel";
import { ImportExportPanel } from "@/components/import-export/ImportExportPanel";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { CreatureStatBlock } from "@/components/sheets/CreatureStatBlock";
import { PlayerPublicSheetView } from "@/components/sheets/PlayerPublicSheetView";

export type PrimaryTab =
  | "library"
  | "scene"
  | "combat"
  | "import-export"
  | "settings";

const TABS: Array<{ id: PrimaryTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "library", label: "Biblioteca", icon: BookOpen },
  { id: "scene", label: "Cena", icon: MapPin },
  { id: "combat", label: "Combate", icon: Swords },
  { id: "import-export", label: "JSON", icon: FileJson },
  { id: "settings", label: "Config.", icon: Settings },
];

export function BestiaryApp({ initialTab = "library" }: { initialTab?: PrimaryTab }) {
  const initialize = useBestiaryStore((s) => s.initialize);
  const initialized = useBestiaryStore((s) => s.initialized);
  const obrConnected = useBestiaryStore((s) => s.obrConnected);
  const sceneReady = useBestiaryStore((s) => s.sceneReady);
  const role = useBestiaryStore((s) => s.role);
  const sheets = useBestiaryStore((s) => s.sheets);
  const instances = useBestiaryStore((s) => s.instances);
  const publicProjections = useBestiaryStore((s) => s.publicProjectionsByItemId);
  const settings = useBestiaryStore((s) => s.settings);
  const toast = useBestiaryStore((s) => s.toast);
  const clearToast = useBestiaryStore((s) => s.clearToast);
  const applyHpMutation = useBestiaryStore((s) => s.applyHpMutation);
  const consumeResource = useBestiaryStore((s) => s.consumeResource);

  const [activeTab, setActiveTab] = useState<PrimaryTab>(initialTab);
  const [rollMode, setRollMode] = useState<"normal" | "advantage" | "disadvantage">("normal");
  const [rollVisibility, setRollVisibility] = useState<"public" | "gm-only">("public");
  const [inlineInspect, setInlineInspect] = useState<{
    sheetId: string;
    itemId: string;
  } | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let active = true;
    void initialize().then((fn) => {
      if (active) cleanup = fn;
      else fn();
    });
    return () => {
      active = false;
      cleanup?.();
    };
  }, [initialize]);

  useEffect(() => {
    let unsubTheme: (() => void) | undefined;
    const sync = async () => {
      const dark = await resolveDarkMode(settings.ui.theme);
      applyDomTheme(dark, settings.ui.fontSize);
    };
    void sync();

    if (settings.ui.theme === "auto" && OBR.isAvailable) {
      unsubTheme = OBR.theme.onChange((t) => {
        applyDomTheme(t.mode === "DARK", settings.ui.fontSize);
      });
    }
    return () => {
      unsubTheme?.();
    };
  }, [settings.ui.theme, settings.ui.fontSize]);

  const inspectedSheet = inlineInspect
    ? sheets.find((s) => s.id === inlineInspect.sheetId)
    : undefined;
  const inspectedInstance = inlineInspect
    ? instances.find((i) => i.boundItemId === inlineInspect.itemId)
    : undefined;
  const inspectedProjection = inlineInspect
    ? publicProjections[inlineInspect.itemId]
    : undefined;

  const sceneCount =
    role === "GM"
      ? instances.length
      : Object.keys(publicProjections).length;

  return (
    <div
      className={cn(
        "flex h-screen flex-col overflow-hidden bg-(--sgi-bg) text-(--sgi-text)",
        settings.ui.density === "comfortable" ? "leading-relaxed" : "leading-snug",
      )}
    >
      {/* Cabeçalho compacto */}
      <header className="shrink-0 border-b border-stone-300/80 bg-(--sgi-surface) px-2.5 pt-2 dark:border-slate-800">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <img
              src={resolveAppPath("icon.svg")}
              alt="SGI"
              className="h-5 w-5 rounded bg-red-900/90 p-0.5 text-amber-300"
            />
            <span className="text-sm font-extrabold tracking-tight">
              SGI Bestiary
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Badge variant={role === "GM" ? "warning" : "accent"}>
              {role === "GM" ? "Mestre" : "Jogador"}
            </Badge>
            <Badge variant={obrConnected ? (sceneReady ? "success" : "default") : "default"}>
              {obrConnected
                ? sceneReady
                  ? "Cena Ativa"
                  : "Sem Cena"
                : "Modo Local"}
            </Badge>
          </div>
        </div>

        {/* Navegação principal */}
        <nav aria-label="Seções principais" className="flex gap-1 overflow-x-auto pb-1.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id && !inlineInspect;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setInlineInspect(null);
                  setActiveTab(tab.id);
                }}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition",
                  active
                    ? "bg-red-800 text-white shadow-sm dark:bg-red-700"
                    : "text-stone-600 hover:bg-stone-200/80 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {tab.id === "scene" && sceneCount > 0 && (
                  <span className="rounded-full bg-black/20 px-1 text-[10px]">
                    {sceneCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Notificação discreta (Toast) */}
      {toast && (
        <div
          role="status"
          className={cn(
            "mx-2.5 mt-2 flex shrink-0 items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[11px] font-medium",
            toast.variant === "error"
              ? "border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-200"
              : toast.variant === "success"
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                : "border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-200",
          )}
        >
          <span className="truncate">{toast.message}</span>
          <button
            type="button"
            onClick={clearToast}
            aria-label="Fechar aviso"
            className="opacity-70 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Área de conteúdo rolável */}
      <main className="flex-1 overflow-y-auto px-2.5 py-2.5">
        {!initialized ? (
          <div className="flex h-40 items-center justify-center text-xs text-stone-500 dark:text-slate-400">
            Carregando grimório SGI Bestiary...
          </div>
        ) : inlineInspect ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setInlineInspect(null)}
              className="inline-flex items-center gap-1 rounded border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar para Cena
            </button>
            {role === "GM" && inspectedSheet ? (
              <CreatureStatBlock
                sheet={inspectedSheet}
                instance={inspectedInstance}
                viewerRole="GM"
                defaultMode={settings.ui.defaultSheetMode}
                rollMode={rollMode}
                rollVisibility={rollVisibility}
                canEdit={false}
                onHpCommand={(cmd) =>
                  void applyHpMutation([inlineInspect.itemId], {
                    type: "command",
                    command: cmd,
                  })
                }
                onConsumeResource={(featureId, delta) =>
                  void consumeResource(inlineInspect.itemId, featureId, delta)
                }
              />
            ) : inspectedProjection ? (
              <PlayerPublicSheetView
                projection={inspectedProjection}
                rollMode={rollMode}
              />
            ) : (
              <div className="rounded border border-stone-300 p-4 text-center text-xs text-stone-500 dark:border-slate-700">
                Ficha não disponível para visualização.
              </div>
            )}
          </div>
        ) : (
          <>
            {activeTab === "library" && (
              <LibraryPanel rollMode={rollMode} rollVisibility={rollVisibility} />
            )}
            {activeTab === "scene" && (
              <SceneTokensPanel
                onOpenSheetInline={(sheetId, itemId) =>
                  setInlineInspect({ sheetId, itemId })
                }
              />
            )}
            {activeTab === "combat" && <CombatPanel />}
            {activeTab === "import-export" && <ImportExportPanel />}
            {activeTab === "settings" && <SettingsPanel />}
          </>
        )}
      </main>

      {/* Barra fixa inferior de rolagem rápida */}
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
