import { describe, expect, it } from "vitest";
import { SEED_SHEETS } from "@/integrations/storage/seedData";
import { createConditionFromCatalog } from "@/domain/rules/conditionsCatalog";
import {
  addConditionToInstance,
  applySheetUpdateToInstance,
  cloneInstanceForDuplicateToken,
  computeImageSignature,
  createTokenInstanceFromSheet,
  mutateInstanceStats,
  removeConditionFromInstance,
} from "@/services/instanceService";
import { computeNonOverlappingSpawnPositions } from "@/integrations/owlbear/obrBridge";
import type { Image } from "@owlbear-rodeo/sdk";

describe("Ciclo de vida de instâncias e controle independente (Testes 3, 5, 7, 10)", () => {
  const goblin = SEED_SHEETS.find((s) => s.id === "seed-goblin-001")!;

  it("Teste 3 & 7: 4 Goblins com a mesma ficha mantêm PV, PV Temp e Condições totalmente independentes", () => {
    const goblins = [1, 2, 3, 4].map((num) =>
      createTokenInstanceFromSheet({
        sheet: goblin,
        boundItemId: `obr-goblin-${num}`,
        sceneId: "scene-combate",
        individualName: `Goblin ${num}`,
      }),
    );

    // Garante IDs de instância únicos
    const instanceIds = new Set(goblins.map((g) => g.instanceId));
    const itemIds = new Set(goblins.map((g) => g.boundItemId));
    expect(instanceIds.size).toBe(4);
    expect(itemIds.size).toBe(4);

    // Reduz PV apenas do Goblin 2 com -5 e aplica Envenenado nele
    let goblin2 = mutateInstanceStats(
      goblins[1],
      { type: "command", command: "-5" },
      goblin,
    );
    goblin2 = addConditionToInstance(
      goblin2,
      createConditionFromCatalog("poisoned"),
    );

    // Adiciona 4 PV Temporários ao Goblin 3 e causa 6 de dano (absorve 4 temp + 2 normal = 5/7)
    let goblin3 = mutateInstanceStats(
      goblins[2],
      { type: "temp-hp", amount: 4 },
      goblin,
    );
    goblin3 = mutateInstanceStats(
      goblin3,
      { type: "damage", amount: 6 },
      goblin,
    );

    // Goblin 1 e 4 permanecem intactos
    expect(goblins[0].currentHp).toBe(7);
    expect(goblins[0].conditions).toHaveLength(0);
    expect(goblins[3].currentHp).toBe(7);
    expect(goblins[3].conditions).toHaveLength(0);

    // Goblin 2 alterado
    expect(goblin2.currentHp).toBe(2);
    expect(goblin2.conditions.map((c) => c.conditionId)).toEqual(["poisoned"]);

    // Goblin 3 absorveu PV Temp primeiro (Teste 5)
    expect(goblin3.tempHp).toBe(0);
    expect(goblin3.currentHp).toBe(5);

    // Remove condição do Goblin 2
    goblin2 = removeConditionFromInstance(goblin2, "poisoned");
    expect(goblin2.conditions).toHaveLength(0);
  });

  it("Teste 10: duplicação de token gera instância própria desacoplada sem colidir metadados", () => {
    const original = createTokenInstanceFromSheet({
      sheet: goblin,
      boundItemId: "item-A",
      sceneId: "scene-1",
      individualName: "Goblin A",
    });
    const injured = mutateInstanceStats(
      original,
      { type: "damage", amount: 4 },
      goblin,
    );

    const copyPreserving = cloneInstanceForDuplicateToken({
      sourceInstance: injured,
      newBoundItemId: "item-B",
      newName: "Goblin B",
      resetHp: false,
    });
    const copyResetting = cloneInstanceForDuplicateToken({
      sourceInstance: injured,
      newBoundItemId: "item-C",
      newName: "Goblin C",
      resetHp: true,
    });

    expect(copyPreserving.instanceId).not.toBe(injured.instanceId);
    expect(copyPreserving.boundItemId).toBe("item-B");
    expect(copyPreserving.currentHp).toBe(3);

    expect(copyResetting.boundItemId).toBe("item-C");
    expect(copyResetting.currentHp).toBe(7);
  });

  it("Teste 10b: edição da ficha-base permite preservar dano atual ou restaurar PV em instâncias", () => {
    const inst = createTokenInstanceFromSheet({
      sheet: goblin,
      boundItemId: "item-1",
      sceneId: "scene-1",
    });
    const injured = mutateInstanceStats(inst, { type: "damage", amount: 4 }, goblin);
    expect(injured.currentHp).toBe(3);

    const upgradedSheet = {
      ...goblin,
      armorClass: { value: 17, description: "Meia-armadura" },
      hitPoints: { ...goblin.hitPoints, maximum: 12 },
      updatedAt: new Date().toISOString(),
    };

    const preserved = applySheetUpdateToInstance(
      injured,
      upgradedSheet,
      "existing-preserve-damage",
    );
    expect(preserved.armorClass).toBe(17);
    expect(preserved.maxHp).toBe(12);
    expect(preserved.currentHp).toBe(3);

    const reset = applySheetUpdateToInstance(
      injured,
      upgradedSheet,
      "existing-reset-hp",
    );
    expect(reset.currentHp).toBe(12);
  });

  it("calcula posições sem sobreposição ao invocar múltiplas criaturas em lote", () => {
    const positions = computeNonOverlappingSpawnPositions({
      center: { x: 0, y: 0 },
      count: 6,
      cellSizePx: 150,
      squaresPerCreature: 1,
      existingPositions: [{ x: 0, y: 0 }],
    });

    expect(positions).toHaveLength(6);
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = Math.abs(positions[i].x - positions[j].x);
        const dy = Math.abs(positions[i].y - positions[j].y);
        expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(90);
      }
    }
  });

  it("gera assinatura estável de imagem removendo query params voláteis de CDN", () => {
    const fakeImg = {
      image: { url: "https://cdn.example.com/goblin.png?token=abc123", width: 256, height: 256 },
    } as unknown as Image;
    expect(computeImageSignature(fakeImg)).toBe(
      "https://cdn.example.com/goblin.png|256x256",
    );
  });
});
