export function normalizeBasePath(raw?: string | null): string {
  if (!raw || raw.trim() === "" || raw.trim() === "/") {
    return "/";
  }
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

export function getAppBasePath(): string {
  const envBase =
    typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL
      : "/";
  return normalizeBasePath(envBase);
}

export function getAppOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "http://localhost:5173";
}

/**
 * Resolve caminho relativo à raiz da extensão respeitando o subdiretório configurado no Vite (`BASE_URL`),
 * ex.: `icon.svg` -> `/NOME-DO-REPOSITORIO/icon.svg` (ou `/icon.svg` quando servido na raiz).
 */
export function resolveAppPath(
  relativePath: string,
  options: { basePath?: string } = {},
): string {
  const base = options.basePath
    ? normalizeBasePath(options.basePath)
    : getAppBasePath();
  let clean = relativePath.trim().replace(/^\.\//, "");
  if (base !== "/" && clean.startsWith(base)) {
    return clean;
  }
  clean = clean.replace(/^\/+/, "");
  return `${base}${clean}`;
}

/**
 * Resolve URL absoluta completa (`https://usuario.github.io/repo/...`) preservando o subdiretório.
 * Essencial para chamadas à SDK do Owlbear Rodeo (`contextMenu`, `modal`, `popover`), pois a SDK
 * só mantém o caminho completo sem mutilar o subdiretório quando a URL já começa com `http`.
 */
export function resolveExtensionUrl(
  relativePath: string,
  options: { basePath?: string; origin?: string } = {},
): string {
  const trimmed = relativePath.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const origin = (options.origin ?? getAppOrigin()).replace(/\/+$/, "");
  return `${origin}${resolveAppPath(trimmed, options)}`;
}

/**
 * Resolve referências de imagem armazenadas em fichas (`portrait`, `tokenImage`, `altImage`).
 * URLs externas (`https://`, `http://`), `data:image/*` e `blob:` são mantidas intactas;
 * caminhos locais iniciados em `/` (como `/tokens/monster.svg`) são ancorados em `BASE_URL`.
 */
export function resolveMediaAssetUrl(
  url: string,
  options: { absolute?: boolean; basePath?: string; origin?: string } = {},
): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }

  const appPath = resolveAppPath(trimmed, options);
  if (!options.absolute) {
    return appPath;
  }
  const origin = (options.origin ?? getAppOrigin()).replace(/\/+$/, "");
  return `${origin}${appPath}`;
}
