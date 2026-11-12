import { Dices, Eye, EyeOff, History, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { RollLogEntry } from "@/integrations/dice/diceService";
import { performRoll } from "@/integrations/dice/diceService";
import { useBestiaryStore } from "@/stores/useBestiaryStore";
import { cn } from "@/utils/cn";

export function DiceRollerBar({
  rollMode,
  onChangeMode,
  rollVisibility,
  onChangeVisibility,
}: {
  rollMode: "normal" | "advantage" | "disadvantage";
  onChangeMode: (m: "normal" | "advantage" | "disadvantage") => void;
  rollVisibility: "public" | "gm-only";
  onChangeVisibility: (v: "public" | "gm-only") => void;
}) {
  const rollLog = useBestiaryStore((s) => s.rollLog);
  const role = useBestiaryStore((s) => s.role);
  const [customExpr, setCustomExpr] = useState("1d20+5");
  const [showHistory, setShowHistory] = useState(false);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const latest: RollLogEntry | undefined = rollLog[0];
  const showBanner = latest && latest.id !== dismissedId;

  const handleQuickRoll = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await performRoll({
        actorName: role === "GM" ? "Mestre" : "Jogador",
        label: "Rolagem rápida",
        expression: customExpr,
        mode: rollMode,
        visibility: rollVisibility,
      });
    } catch {
      // ignora expressão inválida sem quebrar
    }
  };

  return (
    <div className="border-t border-stone-300/80 bg-stone-100/90 px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-950/90">
      {showBanner && (
        <div
          className={cn(
            "mb-1.5 flex items-center justify-between gap-2 rounded-md border px-2 py-1",
            latest.result.isCritical
              ? "border-emerald-500/60 bg-emerald-950/40 text-emerald-200"
              : latest.result.isFumble
                ? "border-red-500/60 bg-red-950/40 text-red-200"
                : "border-amber-500/40 bg-amber-50 text-stone-900 dark:bg-slate-900 dark:text-slate-100",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate">
              <Dices className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span className="truncate font-semibold">{latest.actorName}</span>
              <span className="text-[11px] opacity-75">• {latest.label}</span>
              {latest.visibility === "gm-only" && (
                <span className="rounded bg-slate-800 px-1 text-[10px] text-amber-300">
                  Privado
                </span>
              )}
            </div>
            <div className="truncate text-[11px] opacity-80">
              {latest.result.expression} ({latest.result.breakdown})
              {latest.result.mode !== "normal" &&
                ` [${latest.result.mode === "advantage" ? "Vantagem" : "Desvantagem"}]`}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-stone-900 px-2 py-0.5 text-sm font-bold text-amber-300 dark:bg-amber-500/20 dark:text-amber-300">
              {latest.result.total}
            </span>
            <button
              type="button"
              onClick={() => setDismissedId(latest.id)}
              title="Ocultar aviso"
              className="rounded p-0.5 opacity-60 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <form onSubmit={handleQuickRoll} className="flex items-center gap-1">
          <input
            type="text"
            value={customExpr}
            onChange={(e) => setCustomExpr(e.target.value)}
            aria-label="Expressão de dados"
            placeholder="1d20+5"
            className="w-24 rounded border border-stone-300 bg-white px-2 py-0.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            title="Rolar dados"
            className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-700"
          >
            <Dices className="h-3 w-3" />
            Rolar
          </button>
        </form>

        <div className="flex items-center gap-1">
          {(["normal", "advantage", "disadvantage"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChangeMode(m)}
              title={
                m === "normal"
                  ? "Rolagem normal"
                  : m === "advantage"
                    ? "Vantagem (2d20, maior)"
                    : "Desvantagem (2d20, menor)"
              }
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                rollMode === m
                  ? m === "advantage"
                    ? "bg-emerald-600 text-white"
                    : m === "disadvantage"
                      ? "bg-red-600 text-white"
                      : "bg-stone-800 text-white dark:bg-slate-700"
                  : "text-stone-600 hover:bg-stone-200 dark:text-slate-400 dark:hover:bg-slate-800",
              )}
            >
              {m === "normal" ? "N" : m === "advantage" ? "VAN" : "DESV"}
            </button>
          ))}

          {role === "GM" && (
            <button
              type="button"
              onClick={() =>
                onChangeVisibility(rollVisibility === "public" ? "gm-only" : "public")
              }
              title={
                rollVisibility === "public"
                  ? "Rolagem pública para a sala"
                  : "Rolagem secreta (somente mestre)"
              }
              className={cn(
                "rounded p-1",
                rollVisibility === "gm-only"
                  ? "bg-amber-600/20 text-amber-500"
                  : "text-stone-600 hover:bg-stone-200 dark:text-slate-300 dark:hover:bg-slate-800",
              )}
            >
              {rollVisibility === "gm-only" ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowHistory((h) => !h)}
            title="Histórico de rolagens"
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-stone-600 hover:bg-stone-200 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <History className="h-3.5 w-3.5" />
            <span>{rollLog.length}</span>
          </button>
        </div>
      </div>

      {showHistory && rollLog.length > 0 && (
        <div className="mt-1.5 max-h-32 space-y-1 overflow-y-auto rounded border border-stone-300 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between px-1 text-[10px] font-semibold uppercase text-stone-500">
            <span>Histórico recente</span>
            <button
              type="button"
              onClick={() => useBestiaryStore.setState({ rollLog: [] })}
              className="inline-flex items-center gap-1 hover:text-red-500"
            >
              <Trash2 className="h-3 w-3" /> Limpar
            </button>
          </div>
          {rollLog.slice(0, 12).map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded px-1.5 py-0.5 text-[11px] odd:bg-stone-50 dark:odd:bg-slate-800/40"
            >
              <span className="truncate">
                <strong>{entry.actorName}</strong> ({entry.label}):{" "}
                <span className="opacity-75">{entry.result.breakdown}</span>
              </span>
              <span className="ml-2 font-bold text-amber-600 dark:text-amber-400">
                {entry.result.total}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
