import { FolderOpen, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import type { ImageReference } from "@/domain/entities/sheet";
import { isSafeImageUrl } from "@/domain/schemas/sheetSchema";
import { isObrAvailable, pickImageFromObrAssets } from "@/integrations/owlbear/obrBridge";
import { resolveMediaAssetUrl } from "@/utils/assetUrls";

export function getImageUrlFromRef(ref: ImageReference | undefined): string | null {
  if (!ref) return null;
  if (typeof ref === "string") return ref;
  return ref.url ?? null;
}

export function getResolvedImageSrcFromRef(ref: ImageReference | undefined): string | null {
  const raw = getImageUrlFromRef(ref);
  if (!raw) return null;
  return resolveMediaAssetUrl(raw);
}

export function ImagePickerField({
  label,
  value,
  searchHint,
  onChange,
}: {
  label: string;
  value: ImageReference | undefined;
  searchHint?: string;
  onChange: (next: ImageReference) => void;
}) {
  const previewUrl = getResolvedImageSrcFromRef(value);
  const urlString = typeof value === "string" ? value : value?.url ?? "";

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Para manter a biblioteca leve, selecione imagens de até 2 MB ou utilize Assets do Owlbear Rodeo / URL HTTPS.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (isSafeImageUrl(result)) {
        onChange({
          url: result,
          name: file.name,
          mime: file.type || "image/png",
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePickObr = async () => {
    const asset = await pickImageFromObrAssets(searchHint);
    if (asset) {
      onChange(asset);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-medium text-stone-600 dark:text-slate-300">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-300 bg-stone-100 dark:border-slate-700 dark:bg-slate-800">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={label}
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon className="h-5 w-5 text-stone-400" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <input
            type="url"
            value={urlString.startsWith("data:") ? "" : urlString}
            placeholder={
              urlString.startsWith("data:")
                ? "Imagem embutida (ou cole URL HTTPS)"
                : "https://... (CORS habilitado)"
            }
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (!raw) {
                onChange(null);
              } else if (isSafeImageUrl(raw)) {
                onChange(raw);
              }
            }}
            className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {isObrAvailable() && (
              <button
                type="button"
                onClick={handlePickObr}
                className="inline-flex items-center gap-1 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
              >
                <FolderOpen className="h-3 w-3" />
                Owlbear Assets
              </button>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-stone-300 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-700 hover:bg-stone-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Upload className="h-3 w-3" />
              Arquivo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            {previewUrl && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-500/10 dark:text-red-400"
              >
                <Trash2 className="h-3 w-3" /> Limpar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
