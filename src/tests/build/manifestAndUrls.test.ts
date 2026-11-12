import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeBasePath,
  resolveAppPath,
  resolveExtensionUrl,
  resolveMediaAssetUrl,
} from "@/utils/assetUrls";

describe("Compatibilidade do manifesto OBR e resolução de URLs para GitHub Pages", () => {
  it("normaliza corretamente base paths de subdiretórios do GitHub Pages", () => {
    expect(normalizeBasePath(undefined)).toBe("/");
    expect(normalizeBasePath("/")).toBe("/");
    expect(normalizeBasePath("sgi-bestiary")).toBe("/sgi-bestiary/");
    expect(normalizeBasePath("/meu-bestiario")).toBe("/meu-bestiario/");
    expect(normalizeBasePath("/meu-bestiario/")).toBe("/meu-bestiario/");
  });

  it("gera URLs absolutas completas preservando subdiretório para a SDK do Owlbear Rodeo", () => {
    const opts = {
      basePath: "/meu-bestiario/",
      origin: "https://mestre.github.io",
    };

    expect(resolveAppPath("icon.svg", opts)).toBe("/meu-bestiario/icon.svg");
    expect(resolveExtensionUrl("icons/sheet.svg", opts)).toBe(
      "https://mestre.github.io/meu-bestiario/icons/sheet.svg",
    );
    expect(
      resolveExtensionUrl("src/contextMenu/context-menu.html?theme=DARK", opts),
    ).toBe(
      "https://mestre.github.io/meu-bestiario/src/contextMenu/context-menu.html?theme=DARK",
    );
    expect(
      resolveExtensionUrl("src/modal/modal.html?view=sheet&id=1", opts),
    ).toBe(
      "https://mestre.github.io/meu-bestiario/src/modal/modal.html?view=sheet&id=1",
    );
  });

  it("resolve imagens locais '/tokens/...' com subdiretório ativo sem alterar URLs externas nem data-URLs", () => {
    const opts = {
      basePath: "/meu-bestiario/",
      origin: "https://mestre.github.io",
    };

    expect(resolveMediaAssetUrl("/tokens/monster.svg", opts)).toBe(
      "/meu-bestiario/tokens/monster.svg",
    );
    expect(
      resolveMediaAssetUrl("/tokens/monster.svg", { ...opts, absolute: true }),
    ).toBe("https://mestre.github.io/meu-bestiario/tokens/monster.svg");
    expect(
      resolveMediaAssetUrl("https://cdn.example.com/dragao.webp", {
        ...opts,
        absolute: true,
      }),
    ).toBe("https://cdn.example.com/dragao.webp");
    expect(
      resolveMediaAssetUrl("data:image/svg+xml;base64,PHN2Zz4=", opts),
    ).toBe("data:image/svg+xml;base64,PHN2Zz4=");
  });

  it("mantém public/manifest.json compatível com manifest_version 1 e URLs HTTPS válidas", () => {
    const manifestRaw = readFileSync(
      resolve(process.cwd(), "public/manifest.json"),
      "utf8",
    );
    const manifest = JSON.parse(manifestRaw) as {
      name: string;
      version: string;
      manifest_version: number;
      author: string;
      homepage_url: string;
      description: string;
      icon: string;
      background_url: string;
      action: {
        title: string;
        icon: string;
        popover: string;
        height: number;
        width: number;
      };
    };

    expect(manifest.manifest_version).toBe(1);
    expect(manifest.name).toBe("SGI Bestiary");
    expect(manifest.description.length).toBeGreaterThan(0);
    expect(manifest.description.length).toBeLessThanOrEqual(128);
    expect(manifest.action.height).toBeGreaterThan(0);
    expect(manifest.action.width).toBeGreaterThan(0);

    for (const url of [
      manifest.homepage_url,
      manifest.icon,
      manifest.background_url,
      manifest.action.icon,
      manifest.action.popover,
    ]) {
      const parsed = new URL(url);
      expect(parsed.protocol).toBe("https:");
    }
  });
});
