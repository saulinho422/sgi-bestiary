import fs from "node:fs";
import path from "node:path";

function normalizeBasePath(raw) {
  if (!raw || raw.trim() === "" || raw.trim() === "/") {
    return "/";
  }
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

const distDir = path.resolve(process.cwd(), "dist");
const expectedBasePath = normalizeBasePath(process.env.VITE_BASE_PATH ?? "/sgi-bestiary/");

function assert(condition, message) {
  if (!condition) {
    console.error(`[verify-dist] ERRO: ${message}`);
    process.exit(1);
  }
}

assert(fs.existsSync(distDir), "Diretório dist/ não encontrado. Execute npm run build primeiro.");

const requiredFiles = [
  "manifest.json",
  ".nojekyll",
  "icon.svg",
  "icons/logo.svg",
  "icons/sheet.svg",
  "icons/bind.svg",
  "tokens/monster.svg",
  "tokens/npc.svg",
  "tokens/character.svg",
  "index.html",
  "src/action/action.html",
  "src/background/background.html",
  "src/contextMenu/context-menu.html",
  "src/modal/modal.html",
];

for (const rel of requiredFiles) {
  const fullPath = path.join(distDir, rel);
  assert(fs.existsSync(fullPath), `Arquivo obrigatório ausente em dist/: ${rel}`);
}

const manifestPath = path.join(distDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

assert(
  manifest.manifest_version === 1,
  `manifest_version deve ser 1 para compatibilidade oficial OBR (recebido: ${String(manifest.manifest_version)})`,
);
assert(typeof manifest.name === "string" && manifest.name.length > 0, "manifest.name ausente");
assert(typeof manifest.version === "string" && manifest.version.length > 0, "manifest.version ausente");
assert(manifest.action && typeof manifest.action === "object", "manifest.action ausente");

const urlFields = [
  ["icon", manifest.icon],
  ["background_url", manifest.background_url],
  ["homepage_url", manifest.homepage_url],
  ["action.icon", manifest.action.icon],
  ["action.popover", manifest.action.popover],
];

for (const [label, rawUrl] of urlFields) {
  assert(typeof rawUrl === "string" && rawUrl.length > 0, `Campo ${label} ausente no manifest.json`);
  const parsed = new URL(rawUrl);
  assert(parsed.protocol === "https:", `Campo ${label} exige HTTPS válido (recebido: ${rawUrl})`);
}

const extensionHostedUrls = [
  ["icon", manifest.icon],
  ["background_url", manifest.background_url],
  ["action.icon", manifest.action.icon],
  ["action.popover", manifest.action.popover],
];

for (const [label, rawUrl] of extensionHostedUrls) {
  const parsed = new URL(rawUrl);
  assert(
    parsed.pathname.startsWith(expectedBasePath),
    `Campo ${label} (${rawUrl}) deve iniciar com basePath ${expectedBasePath}`,
  );
  const rel = parsed.pathname.slice(expectedBasePath.length);
  const targetFile = path.join(distDir, rel);
  assert(
    fs.existsSync(targetFile),
    `Arquivo referenciado por ${label} não existe em dist/: ${rel}`,
  );
}

// Verifica se todos os entrypoints HTML referenciam scripts/estilos/ícones existentes no subdiretório correto
const htmlEntrypoints = [
  "index.html",
  "src/action/action.html",
  "src/background/background.html",
  "src/contextMenu/context-menu.html",
  "src/modal/modal.html",
];

const assetAttrRegex = /(?:src|href)="([^"]+)"/g;
for (const htmlRel of htmlEntrypoints) {
  const html = fs.readFileSync(path.join(distDir, htmlRel), "utf8");
  assert(
    html.includes("<script") && html.includes('type="module"'),
    `Entrypoint ${htmlRel} não contém script module compilado`,
  );
  let match;
  let checkedCount = 0;
  while ((match = assetAttrRegex.exec(html)) !== null) {
    const assetPath = match[1];
    assert(
      assetPath.startsWith(expectedBasePath),
      `Asset "${assetPath}" em ${htmlRel} não respeita basePath "${expectedBasePath}"`,
    );
    const relFile = assetPath.slice(expectedBasePath.length);
    assert(
      fs.existsSync(path.join(distDir, relFile)),
      `Asset "${assetPath}" referenciado em ${htmlRel} não encontrado em dist/${relFile}`,
    );
    checkedCount++;
  }
  assert(checkedCount > 0, `Nenhum asset verificado em ${htmlRel}`);
}

console.log(
  `[verify-dist] OK: manifest_version=${manifest.manifest_version}, base=${expectedBasePath}, 5 entrypoints HTML, ícones, tokens e todos os assets compilados verificados em dist/.`,
);
