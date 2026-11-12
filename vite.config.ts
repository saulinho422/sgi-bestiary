import fs from "node:fs";
import path, { resolve } from "node:path";
import { defineConfig, type Plugin, type ResolvedConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function normalizeBasePath(raw?: string): string {
  if (!raw || raw.trim() === "" || raw.trim() === "/") {
    return "/";
  }
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

function normalizeOrigin(raw?: string): string {
  const value = (raw ?? "https://saulinho422.github.io").trim().replace(/\/+$/, "");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`VITE_PUBLIC_ORIGIN inválido: ${value}`);
  }
  return parsed.origin;
}

function sgiManifestPlugin(options: {
  basePath: string;
  publicOrigin: string;
  homepageUrl: string;
}): Plugin {
  let resolvedConfig: ResolvedConfig | null = null;
  const repoSlug =
    options.basePath === "/"
      ? "sgi-bestiary"
      : options.basePath.replace(/^\/+|\/+$/g, "");

  const buildManifestPayload = (origin: string) => {
    const templatePath = resolve(__dirname, "public/manifest.json");
    const raw = JSON.parse(fs.readFileSync(templatePath, "utf8")) as {
      name: string;
      version: string;
      manifest_version: number;
      author?: string;
      homepage_url?: string;
      description?: string;
      action?: {
        title?: string;
        height?: number;
        width?: number;
      };
    };

    const baseUrl = `${origin.replace(/\/+$/, "")}${options.basePath}`;
    return {
      name: raw.name,
      version: raw.version,
      manifest_version: 1,
      author: raw.author ?? "Projeto SGI Bestiary",
      homepage_url:
        options.homepageUrl ||
        `https://github.com/saulinho422/${repoSlug}`,
      icon: `${baseUrl}icons/logo.svg`,
      background_url: `${baseUrl}src/background/background.html`,
      description: raw.description,
      action: {
        title: raw.action?.title ?? raw.name,
        icon: `${baseUrl}icon.svg`,
        popover: `${baseUrl}src/action/action.html`,
        height: raw.action?.height ?? 640,
        width: raw.action?.width ?? 520,
      },
    };
  };

  return {
    name: "sgi-bestiary-manifest-plugin",
    configResolved(config) {
      resolvedConfig = config;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const reqPath = (req.url ?? "").split("?")[0];
        if (
          reqPath === `${options.basePath}manifest.json` ||
          reqPath === "/manifest.json"
        ) {
          const protoHeader = req.headers["x-forwarded-proto"];
          const proto =
            typeof protoHeader === "string"
              ? protoHeader.split(",")[0].trim()
              : "http";
          const host = req.headers.host ?? "localhost:5173";
          const payload = buildManifestPayload(`${proto}://${host}`);
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(JSON.stringify(payload, null, 2));
          return;
        }
        next();
      });
    },
    closeBundle() {
      if (!resolvedConfig || resolvedConfig.command !== "build") return;
      const outDir = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir);
      if (!fs.existsSync(outDir)) return;

      const manifest = buildManifestPayload(options.publicOrigin);
      const manifestOutPath = path.join(outDir, "manifest.json");
      fs.writeFileSync(
        manifestOutPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      );

      // Garante no próprio build que todos os alvos declarados no manifest existem em dist/
      const expectedTargets = [
        manifest.icon,
        manifest.background_url,
        manifest.action.icon,
        manifest.action.popover,
      ];
      for (const targetUrl of expectedTargets) {
        const parsed = new URL(targetUrl);
        if (parsed.protocol !== "https:") {
          throw new Error(
            `Manifest de produção exige HTTPS, mas recebeu: ${targetUrl}`,
          );
        }
        const rel = parsed.pathname.startsWith(options.basePath)
          ? parsed.pathname.slice(options.basePath.length)
          : parsed.pathname.replace(/^\/+/, "");
        const distFile = path.join(outDir, rel);
        if (!fs.existsSync(distFile)) {
          throw new Error(
            `Arquivo referenciado no manifest.json ausente em dist/: ${distFile}`,
          );
        }
      }
    },
  };
}

const basePath = normalizeBasePath(process.env.VITE_BASE_PATH ?? "/sgi-bestiary/");
const publicOrigin = normalizeOrigin(
  process.env.VITE_PUBLIC_ORIGIN ?? "https://saulinho422.github.io",
);
const defaultRepoSlug =
  basePath === "/" ? "sgi-bestiary" : basePath.replace(/^\/+|\/+$/g, "");
const homepageUrl = (
  process.env.VITE_HOMEPAGE_URL ??
  (process.env.GITHUB_REPOSITORY
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}`
    : `https://github.com/saulinho422/${defaultRepoSlug}`)
).trim();

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    sgiManifestPlugin({ basePath, publicOrigin, homepageUrl }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        action: resolve(__dirname, "src/action/action.html"),
        background: resolve(__dirname, "src/background/background.html"),
        contextMenu: resolve(__dirname, "src/contextMenu/context-menu.html"),
        modal: resolve(__dirname, "src/modal/modal.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
