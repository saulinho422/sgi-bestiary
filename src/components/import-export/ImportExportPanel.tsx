import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  HardDriveDownload,
  Upload,
} from "lucide-react";
import {
  exportFullBackupToJson,
  exportSheetsBatchToJson,
  downloadJsonFile,
} from "@/features/import-export/jsonExporter";
import {
  previewJsonImport,
  resolveImportSheets,
  type DuplicateResolution,
  type ImportCommitReport,
  type ImportPreviewResult,
} from "@/features/import-export/jsonImporter";
import { storageProvider } from "@/integrations/storage/dexieRepository";
import { useBestiaryStore } from "@/stores/useBestiaryStore";
import { Badge } from "../common/UiPrimitives";

export function ImportExportPanel() {
  const sheets = useBestiaryStore((s) => s.sheets);
  const settings = useBestiaryStore((s) => s.settings);
  const refreshLibrary = useBestiaryStore((s) => s.refreshLibrary);
  const updateSettings = useBestiaryStore((s) => s.updateSettings);
  const showToast = useBestiaryStore((s) => s.showToast);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rawJson, setRawJson] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [restoreSettings, setRestoreSettings] = useState(true);
  const [restoreMappings, setRestoreMappings] = useState(true);
  const [report, setReport] = useState<ImportCommitReport | null>(null);
  const [importing, setImporting] = useState(false);

  const analyzeText = (text: string) => {
    setParseError(null);
    setReport(null);
    if (!text.trim()) {
      setParseError("Cole ou selecione um arquivo JSON antes de analisar.");
      setPreview(null);
      return;
    }
    try {
      const res = previewJsonImport(text, sheets);
      setPreview(res);
    } catch (err) {
      setPreview(null);
      setParseError(
        err instanceof Error ? err.message : "Erro ao interpretar arquivo JSON.",
      );
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setRawJson(text);
      analyzeText(text);
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : "Não foi possível ler o arquivo.",
      );
    } finally {
      e.target.value = "";
    }
  };

  const setItemResolution = (index: number, resolution: DuplicateResolution) => {
    setPreview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((it) =>
          it.index === index ? { ...it, resolution } : it,
        ),
      };
    });
  };

  const applyAllDuplicates = (resolution: DuplicateResolution) => {
    setPreview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((it) =>
          it.duplicateOfId ? { ...it, resolution } : it,
        ),
      };
    });
  };

  const handleCommitImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      const { sheetsToSave, report: baseReport } = resolveImportSheets(preview.items);
      if (sheetsToSave.length > 0) {
        await storageProvider.library.saveSheetsBulk(sheetsToSave);
      }

      let settingsRestored = false;
      if (restoreSettings && preview.settings) {
        await updateSettings(preview.settings);
        settingsRestored = true;
      }

      let mappingsRestored = 0;
      if (restoreMappings && preview.imageMappings?.length) {
        for (const mapping of preview.imageMappings) {
          if (mapping && typeof mapping.signature === "string" && mapping.templateId) {
            await storageProvider.mappings.saveMapping(mapping);
            mappingsRestored++;
          }
        }
      }

      await refreshLibrary();

      const fullReport: ImportCommitReport = {
        ...baseReport,
        failed: preview.errors.length,
        settingsRestored,
        mappingsRestored,
      };
      setReport(fullReport);
      setPreview(null);
      setRawJson("");
      showToast(
        `Importação concluída: ${baseReport.importedNew + baseReport.replaced + baseReport.copied} ficha(s) salvas.`,
        "success",
      );
    } finally {
      setImporting(false);
    }
  };

  const handleExportBackup = async () => {
    const mappings = await storageProvider.mappings.listMappings();
    const json = exportFullBackupToJson({
      sheets,
      imageMappings: mappings,
      settings,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJsonFile(`sgi-bestiary-backup-${stamp}.json`, json);
    showToast("Backup completo exportado com sucesso.", "success");
  };

  const hasDuplicates = preview?.items.some((i) => Boolean(i.duplicateOfId)) ?? false;

  return (
    <div className="space-y-3 text-xs">
      {/* Seção Exportação */}
      <div className="rounded-lg border border-stone-300/80 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-center gap-1.5 font-bold text-stone-900 dark:text-slate-100">
          <HardDriveDownload className="h-4 w-4 text-amber-500" />
          <span>Exportar Biblioteca & Backup</span>
        </div>
        <p className="mt-1 text-[11px] text-stone-600 dark:text-slate-400">
          Exporte todas as {sheets.length} fichas em formato JSON canônico SGI Bestiary (v1.0.0) com preservação integral de atributos, habilidades e mapeamentos.
        </p>

        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={sheets.length === 0}
            onClick={() => {
              downloadJsonFile(
                `sgi-biblioteca-${sheets.length}-fichas.json`,
                exportSheetsBatchToJson(sheets),
              );
              showToast(`${sheets.length} ficha(s) exportadas.`, "success");
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-900 disabled:opacity-40 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar Biblioteca ({sheets.length})
          </button>

          <button
            type="button"
            onClick={() => void handleExportBackup()}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            <FileJson className="h-3.5 w-3.5" />
            Backup Completo (+ Configurações)
          </button>
        </div>
      </div>

      {/* Seção Importação */}
      <div className="rounded-lg border border-stone-300/80 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold text-stone-900 dark:text-slate-100">
            <Upload className="h-4 w-4 text-emerald-500" />
            <span>Importar JSON</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <Upload className="h-3 w-3" /> Selecionar Arquivo .json
          </button>
        </div>

        <p className="mt-1 text-[11px] text-stone-600 dark:text-slate-400">
          Aceita ficha única, lista de fichas, pacote de backup SGI ou JSON externo de D&D 5e (Open5e / formato tabular). Limite de segurança: 10 MB.
        </p>

        <textarea
          rows={5}
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          placeholder='Cole aqui o conteúdo JSON (ex: { "name": "Goblin", "armorClass": { "value": 15 }, ... })'
          className="mt-2 w-full rounded-md border border-stone-300 bg-white p-2 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-950"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => analyzeText(rawJson)}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Analisar & Pré-visualizar
          </button>

          {rawJson && (
            <button
              type="button"
              onClick={() => {
                setRawJson("");
                setPreview(null);
                setParseError(null);
              }}
              className="text-[11px] text-stone-500 underline hover:text-stone-800 dark:text-slate-400"
            >
              Limpar texto
            </button>
          )}
        </div>

        {parseError && (
          <div className="mt-2.5 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}
      </div>

      {/* Pré-visualização antes de confirmar */}
      {preview && (
        <div className="space-y-2.5 rounded-lg border border-amber-500/50 bg-amber-50/60 p-3 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-bold">
              Pré-visualização: {preview.items.length} válida(s)
              {preview.errors.length > 0 && (
                <span className="ml-1.5 text-red-600 dark:text-red-400">
                  • {preview.errors.length} com erro
                </span>
              )}
            </div>
            <Badge variant="accent">Formato: {preview.format}</Badge>
          </div>

          {hasDuplicates && (
            <div className="flex flex-wrap items-center justify-between gap-1.5 rounded border border-amber-500/40 bg-white/80 px-2 py-1.5 text-[11px] dark:bg-slate-800/80">
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                Duplicadas detectadas: aplicar a todas:
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => applyAllDuplicates("copy")}
                  className="rounded border border-stone-300 px-1.5 py-0.5 hover:bg-stone-100 dark:border-slate-600"
                >
                  Criar Cópia
                </button>
                <button
                  type="button"
                  onClick={() => applyAllDuplicates("replace")}
                  className="rounded border border-stone-300 px-1.5 py-0.5 hover:bg-stone-100 dark:border-slate-600"
                >
                  Substituir
                </button>
                <button
                  type="button"
                  onClick={() => applyAllDuplicates("skip")}
                  className="rounded border border-stone-300 px-1.5 py-0.5 hover:bg-stone-100 dark:border-slate-600"
                >
                  Ignorar
                </button>
              </div>
            </div>
          )}

          {preview.items.length > 0 && (
            <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
              {preview.items.map((item) => (
                <div
                  key={`${item.index}-${item.sheet.id}`}
                  className="rounded border border-stone-300/80 bg-white p-2 dark:border-slate-700 dark:bg-slate-950"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-semibold">
                        {item.sheet.name}
                      </span>
                      <Badge variant={item.sheet.kind}>{item.sheet.kind}</Badge>
                      {item.duplicateOfId ? (
                        <Badge variant="warning">
                          {item.duplicateReason === "id-match"
                            ? "ID existente"
                            : "Nome/Cat. existente"}
                        </Badge>
                      ) : (
                        <Badge variant="success">Nova</Badge>
                      )}
                    </div>

                    {item.duplicateOfId && (
                      <select
                        value={item.resolution}
                        onChange={(e) =>
                          setItemResolution(
                            item.index,
                            e.target.value as DuplicateResolution,
                          )
                        }
                        aria-label={`Resolução para ${item.sheet.name}`}
                        className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-900"
                      >
                        <option value="copy">Importar como cópia</option>
                        <option value="replace">Substituir existente</option>
                        <option value="skip">Ignorar</option>
                      </select>
                    )}
                  </div>

                  {item.warnings.length > 0 && (
                    <div className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                      {item.warnings.join(" • ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {preview.errors.length > 0 && (
            <div className="space-y-1 rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-700 dark:text-red-300">
              <div className="font-semibold">Registros inválidos:</div>
              {preview.errors.map((err) => (
                <div key={err.index}>
                  Registro #{err.index + 1}: {err.reason}
                </div>
              ))}
            </div>
          )}

          {(preview.settings || (preview.imageMappings?.length ?? 0) > 0) && (
            <div className="space-y-1 border-t border-stone-300/80 pt-2 text-[11px] dark:border-slate-700">
              {preview.settings && (
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={restoreSettings}
                    onChange={(e) => setRestoreSettings(e.target.checked)}
                  />
                  <span>Restaurar configurações de interface e HUD deste backup</span>
                </label>
              )}
              {(preview.imageMappings?.length ?? 0) > 0 && (
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={restoreMappings}
                    onChange={(e) => setRestoreMappings(e.target.checked)}
                  />
                  <span>
                    Restaurar {preview.imageMappings?.length} mapeamento(s) de reconhecimento de imagem
                  </span>
                </label>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded border border-stone-300 px-3 py-1 text-xs dark:border-slate-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={importing || (preview.items.length === 0 && !preview.settings)}
              onClick={() => void handleCommitImport()}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {importing
                ? "Importando..."
                : `Confirmar Importação (${preview.items.length})`}
            </button>
          </div>
        </div>
      )}

      {/* Relatório final pós-importação */}
      {report && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-900 dark:text-emerald-200">
          <div className="flex items-center gap-1.5 font-bold">
            <CheckCircle2 className="h-4 w-4" />
            <span>Relatório de Importação</span>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1 text-[11px] sm:grid-cols-4">
            <span>Novas: {report.importedNew}</span>
            <span>Substituídas: {report.replaced}</span>
            <span>Cópias: {report.copied}</span>
            <span>Ignoradas: {report.skipped}</span>
          </div>
          {(report.failed > 0 || report.settingsRestored || report.mappingsRestored > 0) && (
            <div className="mt-1 text-[11px] opacity-85">
              {report.failed > 0 && `Falhas: ${report.failed}. `}
              {report.settingsRestored && "Configurações restauradas. "}
              {report.mappingsRestored > 0 &&
                `${report.mappingsRestored} mapeamento(s) restaurado(s).`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
