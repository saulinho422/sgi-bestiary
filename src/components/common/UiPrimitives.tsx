import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/utils/cn";

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: ReactNode;
  variant?: "default" | "monster" | "npc" | "character" | "accent" | "warning" | "success";
  className?: string;
}) {
  const styles: Record<NonNullable<typeof variant>, string> = {
    default:
      "bg-stone-200/80 text-stone-800 border-stone-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
    monster:
      "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/70 dark:text-red-200 dark:border-red-800/70",
    npc:
      "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800/70",
    character:
      "bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-200 dark:border-indigo-800/70",
    accent:
      "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/70 dark:text-sky-200 dark:border-sky-800/70",
    warning:
      "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/70 dark:text-orange-200 dark:border-orange-800/70",
    success:
      "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-800/70",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none",
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = true,
  rightSlot,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  rightSlot?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-stone-300/80 bg-white/80 dark:border-slate-700/80 dark:bg-slate-900/60">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-700 hover:text-stone-950 dark:text-slate-200 dark:hover:text-white"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span>{title}</span>
          {subtitle && (
            <span className="text-[11px] font-normal normal-case text-stone-500 dark:text-slate-400">
              {subtitle}
            </span>
          )}
        </button>
        {rightSlot}
      </div>
      {open && (
        <div className="border-t border-stone-200/80 px-3 py-2.5 dark:border-slate-800">
          {children}
        </div>
      )}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]"
    >
      <div className="w-full max-w-sm rounded-xl border border-stone-300 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-slate-100">
          {title}
        </h3>
        <p className="mt-1.5 text-xs text-stone-600 dark:text-slate-300">
          {message}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold text-white",
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-amber-600 hover:bg-amber-700",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
