import { useEffect, useState } from "react";
import OBR, { type Image } from "@owlbear-rodeo/sdk";
import { FileText, Heart, Shield, Sparkles } from "lucide-react";
import type { CreatureSheet } from "@/domain/entities/sheet";
import type {
  PublicTokenProjection,
  TokenInstance,
} from "@/domain/entities/tokenInstance";
import {
  DND5E_CONDITIONS,
  createConditionFromCatalog,
} from "@/domain/rules/conditionsCatalog";
import {
  addConditionToInstance,
  mutateInstanceStats,
  readPublicProjectionFromItem,
  removeConditionFromInstance,
  type InstanceHpMutation,
} from "@/services/instanceService";
import {
  ensureSceneScopeId,
  openSheetModal,
  syncInstancesToObrItems,
} from "@/integrations/owlbear/obrBridge";
import {
  storageProvider,
  subscribeDbSync,
} from "@/integrations/storage/dexieRepository";
import { BROADCAST_CHANNELS } from "@/utils/pluginId";
import { applyDomTheme } from "@/utils/themeSync";
import { cn } from "@/utils/cn";

const QUICK_CONDITIONS = [
  { id: "poisoned", label: "Veneno" },
  { id: "prone", label: "Caído" },
  { id: "grappled", label: "Agarr." },
  { id: "incapacitated", label: "Incap." },
];

export function ContextMenuApp() {
  const [role, setRole] = useState<"GM" | "PLAYER">("GM");
  const [sceneId, setSceneId] = useState("default");
  const [item, setItem] = useState<Image | null>(null);
  const [instance, setInstance] = useState<TokenInstance | null>(null);
  const [sheet, setSheet] = useState<CreatureSheet | null>(null);
  const [projection, setProjection] = useState<PublicTokenProjection | null>(null);
  const [hpInput, setHpInput] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialTheme = params.get("theme");
    applyDomTheme(initialTheme !== "LIGHT", "sm");
  }, []);

  useEffect(() => {
    let mounted = true;
    const cleanups: Array<() => void> = [];

    const loadContext = async () => {
      if (!OBR.isAvailable) {
        if (mounted) setLoading(false);
        return;
      }

      const [playerRole, selection, scId, theme] = await Promise.all([
        OBR.player.getRole(),
        OBR.player.getSelection(),
        ensureSceneScopeId(),
        OBR.theme.getTheme(),
      ]);
      applyDomTheme(theme.mode === "DARK", "sm");

      if (!mounted) return;
      setRole(playerRole);
      setSceneId(scId);

      const firstId = selection?.[0];
      if (!firstId) {
        setLoading(false);
        return;
      }

      const items = await OBR.scene.items.getItems<Image>([firstId]);
      const target = items[0] ?? null;
      if (!mounted || !target) {
        setLoading(false);
        return;
      }

      setItem(target);
      const proj = readPublicProjectionFromItem(target);
      setProjection(proj);

      if (playerRole === "GM") {
        const inst = await storageProvider.instances.getInstance(target.id, scId);
        if (!mounted) return;
        setInstance(inst ?? null);
        if (inst) {
          const sh = await storageProvider.library.getSheet(inst.templateId);
          if (mounted) setSheet(sh ?? null);
        }
      }
      if (mounted) setLoading(false);
    };

    const boot = () => {
      void loadContext();
      cleanups.push(
        OBR.scene.items.onChange(() => {
          void loadContext();
        }),
      );
      cleanups.push(
        subscribeDbSync((topic) => {
          if (topic === "instances" || topic === "sheets") {
            void loadContext();
          }
        }),
      );
    };

    if (OBR.isAvailable) {
      if (OBR.isReady) boot();
      else OBR.onReady(boot);
    } else {
      setLoading(false);
    }

    return () => {
      mounted = false;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  const applyHp = async (mutation: InstanceHpMutation) => {
    if (!item) return;
    if (role === "PLAYER") {
      if (!projection?.visibility.playerCanEdit || !OBR.isAvailable) return;
      await OBR.broadcast.sendMessage(
        BROADCAST_CHANNELS.PLAYER_EDIT,
        { type: "hp-mutation", itemId: item.id, mutation },
        { destination: "REMOTE" },
      );
      return;
    }

    if (!instance) return;
    const updated = mutateInstanceStats(instance, mutation, sheet);
    setInstance(updated);
    await storageProvider.instances.saveInstance(updated);
    const map = new Map<string, CreatureSheet>();
    if (sheet) map.set(sheet.id, sheet);
    await syncInstancesToObrItems([updated], map);
  };

  const toggleCondition = async (conditionId: string) => {
    if (!item || !conditionId) return;
    const activeConds =
      role === "GM" ? instance?.conditions ?? [] : projection?.conditions ?? [];
    const existing = activeConds.find((c) => c.conditionId === conditionId);

    if (role === "PLAYER") {
      if (!projection?.visibility.playerCanEdit || !OBR.isAvailable) return;
      await OBR.broadcast.sendMessage(
        BROADCAST_CHANNELS.PLAYER_EDIT,
        existing
          ? { type: "remove-condition", itemId: item.id, conditionId }
          : { type: "add-condition", itemId: item.id, conditionId },
        { destination: "REMOTE" },
      );
      return;
    }

    if (!instance) return;
    const updated = existing
      ? removeConditionFromInstance(instance, existing.id)
      : addConditionToInstance(
          instance,
          createConditionFromCatalog(conditionId, {
            ruleset: sheet?.ruleset ?? "dnd5e-2014",
          }),
        );
    setInstance(updated);
    await storageProvider.instances.saveInstance(updated);
    const map = new Map<string, CreatureSheet>();
    if (sheet) map.set(sheet.id, sheet);
    await syncInstancesToObrItems([updated], map);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-2 text-xs text-stone-400">
        Carregando...
      </div>
    );
  }

  if (!item || (!instance && !projection)) {
    return (
      <div className="flex h-full items-center justify-center p-2 text-center text-xs text-stone-400">
        Token sem vínculo SGI ({sceneId.slice(0, 6)}).
      </div>
    );
  }

  const displayName =
    role === "GM"
      ? instance?.individualName || sheet?.name || item.name
      : projection?.publicName || "Criatura";
  const displayAc =
    role === "GM" ? instance?.armorClass : projection?.armorClass;
  const currentHp =
    role === "GM" ? instance?.currentHp : projection?.currentHp;
  const maxHp = role === "GM" ? instance?.maxHp : projection?.maxHp;
  const tempHp = role === "GM" ? instance?.tempHp : projection?.tempHp;
  const activeCondIds = new Set(
    (role === "GM"
      ? instance?.conditions.map((c) => c.conditionId)
      : projection?.conditions.map((c) => c.conditionId)) ?? [],
  );

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden bg-(--sgi-bg) p-2 text-xs text-(--sgi-text)">
      {/* Linha 1: Nome, CA, PV e Abrir Ficha */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{displayName}</div>
          <div className="flex items-center gap-2 text-[11px]">
            {displayAc !== undefined && (
              <span className="inline-flex items-center gap-0.5 font-semibold text-blue-600 dark:text-blue-300">
                <Shield className="h-3 w-3" /> {displayAc}
              </span>
            )}
            <span className="inline-flex items-center gap-0.5 font-semibold text-red-600 dark:text-red-400">
              <Heart className="h-3 w-3" />
              {currentHp !== undefined && maxHp !== undefined
                ? `${currentHp}/${maxHp}`
                : projection?.hpRatio !== undefined
                  ? `${Math.round(projection.hpRatio * 100)}%`
                  : "—"}
              {tempHp !== undefined && tempHp > 0 && (
                <span className="ml-0.5 rounded bg-sky-600/20 px-1 text-[10px] text-sky-400">
                  +{tempHp}
                </span>
              )}
            </span>
          </div>
        </div>

        {(role === "GM" ||
          projection?.visibility.publicSummarySheet ||
          projection?.visibility.publicFullSheet) && (
          <button
            type="button"
            onClick={() =>
              void openSheetModal({
                itemId: item.id,
                sheetId: instance?.templateId ?? projection?.templateId,
                mode: "view",
              })
            }
            title="Abrir ficha"
            className="inline-flex items-center gap-1 rounded bg-stone-800 px-2 py-1 text-[11px] font-semibold text-white hover:bg-stone-900 dark:bg-slate-700"
          >
            <FileText className="h-3 w-3" /> Ficha
          </button>
        )}
      </div>

      {/* Linha 2: Matemática rápida de PV & Temp HP */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const cmd = hpInput.trim();
          if (!cmd) return;
          void applyHp({ type: "command", command: cmd });
          setHpInput("");
        }}
        className="flex items-center gap-1"
      >
        <button
          type="button"
          onClick={() => void applyHp({ type: "damage", amount: 5 })}
          className="rounded bg-red-600 px-1.5 py-1 text-[11px] font-bold text-white hover:bg-red-700"
        >
          -5
        </button>
        <button
          type="button"
          onClick={() => void applyHp({ type: "damage", amount: 1 })}
          className="rounded bg-red-600/80 px-1.5 py-1 text-[11px] font-bold text-white hover:bg-red-700"
        >
          -1
        </button>
        <input
          type="text"
          value={hpInput}
          onChange={(e) => setHpInput(e.target.value)}
          placeholder="-8 / +5"
          className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-1.5 py-1 text-center font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="button"
          onClick={() => void applyHp({ type: "heal", amount: 5 })}
          className="rounded bg-emerald-600 px-1.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
        >
          +5
        </button>
        <button
          type="button"
          onClick={() => void applyHp({ type: "temp-hp", amount: 5 })}
          title="Adicionar +5 PV Temporários"
          className="rounded bg-sky-600 px-1.5 py-1 text-[11px] font-bold text-white hover:bg-sky-700"
        >
          +5T
        </button>
      </form>

      {/* Linha 3: Condições Rápidas */}
      <div className="flex items-center gap-1">
        {role === "GM" && instance && (
          <button
            type="button"
            onClick={async () => {
              const updated: TokenInstance = {
                ...instance,
                concentratingOn: instance.concentratingOn ? null : "Magia",
                updatedAt: new Date().toISOString(),
              };
              setInstance(updated);
              await storageProvider.instances.saveInstance(updated);
              const map = new Map<string, CreatureSheet>();
              if (sheet) map.set(sheet.id, sheet);
              await syncInstancesToObrItems([updated], map);
            }}
            title="Alternar Concentração"
            className={cn(
              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold",
              instance.concentratingOn
                ? "bg-amber-600 text-white"
                : "border border-stone-300 text-stone-500 dark:border-slate-700",
            )}
          >
            <Sparkles className="h-2.5 w-2.5" />
          </button>
        )}

        {QUICK_CONDITIONS.map((qc) => {
          const active = activeCondIds.has(qc.id);
          return (
            <button
              key={qc.id}
              type="button"
              onClick={() => void toggleCondition(qc.id)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                active
                  ? "bg-purple-600 text-white"
                  : "border border-stone-300 text-stone-600 hover:bg-stone-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
              )}
            >
              {qc.label}
            </button>
          );
        })}

        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              void toggleCondition(e.target.value);
            }
          }}
          aria-label="Mais condições"
          className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-1 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">+ Cond.</option>
          {DND5E_CONDITIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {activeCondIds.has(c.id) ? `✓ ${c.name}` : c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
