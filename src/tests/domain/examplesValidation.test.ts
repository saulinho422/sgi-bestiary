import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { previewJsonImport } from "@/features/import-export/jsonImporter";

const EXAMPLE_FILES = [
  "examples/monsters/sentinela-do-bosque.json",
  "examples/monsters/goblin.json",
  "examples/npcs/capita-aria.json",
  "examples/characters/lyra-ventofrio.json",
];

describe("Validação dos arquivos JSON de exemplo", () => {
  for (const relPath of EXAMPLE_FILES) {
    it(`valida e pré-visualiza ${relPath} sem erros`, () => {
      const content = readFileSync(resolve(process.cwd(), relPath), "utf8");
      const preview = previewJsonImport(content, []);
      expect(preview.errors).toHaveLength(0);
      expect(preview.items).toHaveLength(1);
      expect(preview.items[0].warnings).toHaveLength(0);
    });
  }
});
