import { beforeEach, describe, expect, it } from "vitest";
import { SgiBestiaryDexieDb } from "@/integrations/storage/dexieDatabase";
import { createDexieStorageProvider } from "@/integrations/storage/dexieRepository";
import { createEmptySheet, migrateAndValidateSheet } from "@/domain/schemas/sheetSchema";
import { exportSingleSheetToJson } from "@/features/import-export/jsonExporter";
import {
  previewJsonImport,
  resolveImportSheets,
} from "@/features/import-export/jsonImporter";

describe("Persistência IndexedDB e Roundtrip JSON (Teste 1 e Teste 2)", () => {
  let db: SgiBestiaryDexieDb;

  beforeEach(async () => {
    db = new SgiBestiaryDexieDb(`test_sgi_${crypto.randomUUID()}`);
    await db.open();
  });

  it("persiste ficha criada, recupera após reabertura e preserva campos desconhecidos no roundtrip JSON", async () => {
    const provider = createDexieStorageProvider(db);

    const monster = createEmptySheet("monster", "dnd5e-2024");
    monster.name = "Troll da Caverna";
    monster.armorClass = { value: 15, description: "Natural" };
    monster.hitPoints = { maximum: 84, formula: "8d10+40" };
    monster.abilities = { str: 18, dex: 13, con: 20, int: 7, wis: 9, cha: 7 };
    monster.actions.push({
      id: "act-garra",
      name: "Garra",
      description: "Ataque cortante.",
      attackBonus: 7,
      damage: [{ formula: "2d6+4", type: "cortante" }],
    });
    monster.customExtensionField = { preserved: true, rank: "elite" };

    await provider.library.saveSheet(monster);
    const loaded = await provider.library.getSheet(monster.id);
    expect(loaded?.name).toBe("Troll da Caverna");
    expect(loaded?.actions).toHaveLength(1);
    expect(loaded?.customExtensionField).toEqual({ preserved: true, rank: "elite" });

    // Teste 2: Exportar, excluir cópia local e reimportar sem perda
    const json = exportSingleSheetToJson(loaded!);
    await provider.library.deleteSheet(monster.id);
    expect(await provider.library.getSheet(monster.id)).toBeUndefined();

    const preview = previewJsonImport(json, await provider.library.listSheets());
    expect(preview.errors).toHaveLength(0);
    expect(preview.items).toHaveLength(1);

    const { sheetsToSave } = resolveImportSheets(preview.items);
    await provider.library.saveSheetsBulk(sheetsToSave);

    const restored = await provider.library.getSheet(monster.id);
    expect(restored?.name).toBe("Troll da Caverna");
    expect(restored?.ruleset).toBe("dnd5e-2024");
    expect(restored?.actions[0].damage?.[0].formula).toBe("2d6+4");
    expect(restored?.customExtensionField).toEqual({ preserved: true, rank: "elite" });
  });

  it("protege contra URLs perigosas, prototype pollution e scripts", () => {
    const dirty = JSON.stringify({
      schemaVersion: "1.0.0",
      id: "xss-test",
      name: "Mímico<script>alert(1)</script>",
      portrait: "javascript:alert(1)",
      tokenImage: "data:text/html,<script>alert(1)</script>",
      armorClass: { value: 12, description: "" },
      hitPoints: { maximum: 10, formula: "2d8" },
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      __proto__: { polluted: true },
    });

    const preview = previewJsonImport(dirty, []);
    // Deve rejeitar URLs inseguras na validação ou sanitizar script
    expect(preview.errors.length).toBeGreaterThan(0);

    const safeButScripted = migrateAndValidateSheet({
      id: "clean-1",
      name: "Lobo<script>evil()</script>",
      armorClass: { value: 13, description: "Natural" },
      hitPoints: { maximum: 11, formula: "2d8+2" },
      abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    });
    expect(safeButScripted.name).toBe("Lobo");
  });
});
