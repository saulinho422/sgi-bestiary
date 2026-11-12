import { useEffect, useState } from "react";
import { RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import {
  DEFAULT_SETTINGS,
  type BestiarySettings,
  type HealthDisplayMode,
  type HudPosition,
  type TempHpRuleMode,
} from "@/domain/entities/settings";
import type { ImageTemplateMapping } from "@/domain/entities/tokenInstance";
import { storageProvider } from "@/integrations/storage/dexieRepository";
import { useBestiaryStore } from "@/stores/useBestiaryStore";
import { CollapsibleSection } from "../common/UiPrimitives";

export function SettingsPanel() {
  const settings = useBestiaryStore((s) => s.settings);
  const sheets = useBestiaryStore((s) => s.sheets);
  const role = useBestiaryStore((s) => s.role);
  const updateSettings = useBestiaryStore((s) => s.updateSettings);

  const [draft, setDraft] = useState<BestiarySettings>(() =>
    structuredClone(settings),
  );
  const [mappings, setMappings] = useState<ImageTemplateMapping[]>([]);

  useEffect(() => {
    setDraft(structuredClone(settings));
  }, [settings]);

  useEffect(() => {
    void storageProvider.mappings.listMappings().then(setMappings);
  }, []);

  const commitQuietly = async (next: BestiarySettings) => {
    setDraft(next);
    useBestiaryStore.setState({ settings: next });
    await storageProvider.settings.saveSettings(next);
  };

  const patchUi = <K extends keyof BestiarySettings["ui"]>(
    key: K,
    val: BestiarySettings["ui"][K],
  ) => {
    const next: BestiarySettings = {
      ...draft,
      ui: { ...draft.ui, [key]: val },
    };
    void commitQuietly(next);
  };

  const patchHud = <K extends keyof BestiarySettings["hud"]>(
    key: K,
    val: BestiarySettings["hud"][K],
  ) => {
    const next: BestiarySettings = {
      ...draft,
      hud: { ...draft.hud, [key]: val },
    };
    void commitQuietly(next);
  };

  const patchColor = <K extends keyof BestiarySettings["hud"]["colorThresholds"]>(
    key: K,
    val: BestiarySettings["hud"]["colorThresholds"][K],
  ) => {
    const next: BestiarySettings = {
      ...draft,
      hud: {
        ...draft.hud,
        colorThresholds: {
          ...draft.hud.colorThresholds,
          [key]: val,
        },
      },
    };
    void commitQuietly(next);
  };

  const sheetNameById = new Map(sheets.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-2.5 text-xs">
      {/* Ações rápidas de topo */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-300/80 bg-white/90 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/80">
        <span className="font-semibold">Preferências da Extensão</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void updateSettings(structuredClone(DEFAULT_SETTINGS))}
            className="inline-flex items-center gap-1 rounded border border-stone-300 px-2 py-1 text-[11px] hover:bg-stone-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3 w-3" /> Restaurar Padrões
          </button>
          <button
            type="button"
            onClick={() => void updateSettings(draft)}
            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
          >
            <Save className="h-3 w-3" /> Salvar
          </button>
        </div>
      </div>

      {/* Interface & Regras Gerais */}
      <CollapsibleSection title="Interface & Comportamento D&D 5e" defaultOpen>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div>
            <label className="mb-0.5 block font-medium">Tema</label>
            <select
              aria-label="Tema da interface"
              value={draft.ui.theme}
              onChange={(e) =>
                patchUi("theme", e.target.value as BestiarySettings["ui"]["theme"])
              }
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="dark">Escuro (Dark)</option>
              <option value="light">Claro (Light)</option>
              <option value="auto">Automático (Sistema/OBR)</option>
            </select>
          </div>

          <div>
            <label className="mb-0.5 block font-medium">Idioma</label>
            <select
              aria-label="Idioma da interface"
              value={draft.ui.language}
              onChange={(e) =>
                patchUi("language", e.target.value as "pt-BR" | "en")
              }
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en">English (Estrutura i18n preparada)</option>
            </select>
          </div>

          <div>
            <label className="mb-0.5 block font-medium">Densidade visual</label>
            <select
              value={draft.ui.density}
              onChange={(e) =>
                patchUi("density", e.target.value as "compact" | "comfortable")
              }
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="compact">Compacta (alta densidade)</option>
              <option value="comfortable">Confortável</option>
            </select>
          </div>

          <div>
            <label className="mb-0.5 block font-medium">Modo inicial da ficha</label>
            <select
              value={draft.ui.defaultSheetMode}
              onChange={(e) =>
                patchUi("defaultSheetMode", e.target.value as "compact" | "full")
              }
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="compact">Compacto (ideal combate)</option>
              <option value="full">Completo</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-0.5 block font-medium">
              Regra de Pontos de Vida Temporários
            </label>
            <select
              value={draft.ui.tempHpRule}
              onChange={(e) =>
                patchUi("tempHpRule", e.target.value as TempHpRuleMode)
              }
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="dnd5e-max">
                Oficial D&D 5e — Manter apenas o maior valor
              </option>
              <option value="replace">
                Substituir sempre pelo novo valor recebido
              </option>
            </select>
          </div>

          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.ui.autoDuplicateResetHp}
              onChange={(e) => patchUi("autoDuplicateResetHp", e.target.checked)}
            />
            <span>
              Ao duplicar token manualmente no mapa, restaurar PV da cópia para o máximo (se desmarcado, clona PV atuais com independência)
            </span>
          </label>

          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.ui.autoRecognizeMappedImages}
              onChange={(e) =>
                patchUi("autoRecognizeMappedImages", e.target.checked)
              }
            />
            <span>
              Reconhecer automaticamente tokens arrastados cuja imagem possua mapeamento salvo
            </span>
          </label>

          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.ui.confirmDelete}
              onChange={(e) => patchUi("confirmDelete", e.target.checked)}
            />
            <span>Exigir confirmação antes de excluir fichas da biblioteca</span>
          </label>
        </div>
      </CollapsibleSection>

      {/* HUD dos Tokens no Mapa */}
      <CollapsibleSection title="HUD Tático nos Tokens (Mapa Owlbear)" defaultOpen>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div>
            <label className="mb-0.5 block font-medium">Posição da Barra</label>
            <select
              value={draft.hud.position}
              onChange={(e) =>
                patchHud("position", e.target.value as HudPosition)
              }
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="bottom">Abaixo do token</option>
              <option value="top">Acima do token</option>
              <option value="left">Lateral esquerda</option>
              <option value="right">Lateral direita</option>
            </select>
          </div>

          <div>
            <label className="mb-0.5 block font-medium">Exibição dos PV (Visão do Mestre)</label>
            <select
              value={draft.hud.healthDisplayMode}
              onChange={(e) =>
                patchHud("healthDisplayMode", e.target.value as HealthDisplayMode)
              }
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="bar-exact">Barra + PV Exatos (18/27)</option>
              <option value="bar-percent">Barra + Porcentagem (67%)</option>
              <option value="bar-only">Somente Barra Visual</option>
              <option value="condition-only">Somente Condições</option>
              <option value="none">Ocultar HUD de Barra</option>
            </select>
          </div>

          <div>
            <label className="mb-0.5 block font-medium">
              Largura Relativa ({draft.hud.barWidthScale.toFixed(2)}×)
            </label>
            <input
              type="range"
              min={0.5}
              max={1.6}
              step={0.05}
              value={draft.hud.barWidthScale}
              onChange={(e) =>
                patchHud("barWidthScale", Number(e.target.value))
              }
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-0.5 block font-medium">
              Altura da Barra ({draft.hud.barHeight} px)
            </label>
            <input
              type="range"
              min={10}
              max={28}
              step={1}
              value={draft.hud.barHeight}
              onChange={(e) => patchHud("barHeight", Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-0.5 block font-medium">
              Escala de Ícones ({draft.hud.iconScale.toFixed(2)}×)
            </label>
            <input
              type="range"
              min={0.65}
              max={1.5}
              step={0.05}
              value={draft.hud.iconScale}
              onChange={(e) => patchHud("iconScale", Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-0.5 block font-medium">Segmentação da Barra</label>
            <select
              value={draft.hud.segments}
              onChange={(e) => patchHud("segments", Number(e.target.value))}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value={0}>Contínua (suave)</option>
              <option value={4}>4 segmentos (25%)</option>
              <option value={5}>5 segmentos (20%)</option>
              <option value={10}>10 segmentos (10%)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:col-span-2">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.hud.showHealthBar}
                onChange={(e) => patchHud("showHealthBar", e.target.checked)}
              />
              <span>Barra de vida</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.hud.showAcShield}
                onChange={(e) => patchHud("showAcShield", e.target.checked)}
              />
              <span>Escudo de CA</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.hud.showTempHp}
                onChange={(e) => patchHud("showTempHp", e.target.checked)}
              />
              <span>PV Temporários</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.hud.showConditions}
                onChange={(e) => patchHud("showConditions", e.target.checked)}
              />
              <span>Condições</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.hud.showNameTag}
                onChange={(e) => patchHud("showNameTag", e.target.checked)}
              />
              <span>Nome do Token</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.hud.showConcentrationBadge}
                onChange={(e) =>
                  patchHud("showConcentrationBadge", e.target.checked)
                }
              />
              <span>Badge Concentração</span>
            </label>
          </div>

          {/* Cores configuráveis */}
          <div className="grid grid-cols-3 gap-2 border-t border-stone-200 pt-2 sm:col-span-2 sm:grid-cols-5 dark:border-slate-800">
            {(
              [
                ["highColor", "Saudável"],
                ["mediumColor", "Ferido"],
                ["lowColor", "Crítico"],
                ["zeroColor", "Caído"],
                ["tempHpColor", "PV Temp"],
              ] as const
            ).map(([k, lbl]) => (
              <label key={k} className="flex flex-col items-center gap-1 text-[10px]">
                <span>{lbl}</span>
                <input
                  type="color"
                  value={draft.hud.colorThresholds[k]}
                  onChange={(e) => patchColor(k, e.target.value)}
                  className="h-6 w-10 cursor-pointer rounded border border-stone-300 bg-transparent"
                />
              </label>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* Mapeamentos de Imagem Salvos */}
      {role === "GM" && (
        <CollapsibleSection
          title={`Mapeamentos de Auto-Reconhecimento (${mappings.length})`}
          defaultOpen={false}
        >
          {mappings.length === 0 ? (
            <p className="text-[11px] text-stone-500 dark:text-slate-400">
              Nenhum mapeamento salvo. Ao vincular um token pelo menu contextual ou aba Cena, marque “Reconhecer automaticamente novos tokens com esta mesma imagem”.
            </p>
          ) : (
            <div className="space-y-1.5">
              {mappings.map((m) => (
                <div
                  key={m.signature}
                  className="flex items-center justify-between gap-2 rounded border border-stone-200 px-2 py-1 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {sheetNameById.get(m.templateId) ?? m.templateId}
                    </div>
                    <div className="truncate text-[10px] text-stone-500">
                      {m.imageName || m.signature}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await storageProvider.mappings.deleteMapping(m.signature);
                      setMappings((prev) =>
                        prev.filter((x) => x.signature !== m.signature),
                      );
                    }}
                    title="Remover mapeamento"
                    className="rounded p-1 text-red-600 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Transparência & Segurança GM vs Jogador */}
      <div className="rounded-lg border border-stone-300/80 bg-white/80 p-2.5 text-[11px] text-stone-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-stone-800 dark:text-slate-100">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>Isolamento Mestre vs Jogadores</span>
        </div>
        <p>
          O SGI Bestiary nunca grava PV numéricos ocultos, CA oculta ou notas privadas do Mestre nos metadados públicos da cena do Owlbear Rodeo. Apenas a projeção autorizada para cada token é sincronizada na sala.
        </p>
      </div>
    </div>
  );
}
