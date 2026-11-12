import { describe, expect, it } from "vitest";
import {
  applyDamage,
  applyHealing,
  applyTempHp,
  executeHpCommand,
  getAbilityModifier,
  getPassivePerception,
  getSkillModifier,
  rollDiceExpression,
} from "@/domain/rules/dnd5eRules";
import {
  createConditionFromCatalog,
  tickConditionsOnTurnAdvance,
} from "@/domain/rules/conditionsCatalog";
import { SEED_SHEETS } from "@/integrations/storage/seedData";

describe("Regras D&D 5e", () => {
  it("calcula modificadores de atributo corretamente", () => {
    expect(getAbilityModifier(1)).toBe(-5);
    expect(getAbilityModifier(8)).toBe(-1);
    expect(getAbilityModifier(10)).toBe(0);
    expect(getAbilityModifier(11)).toBe(0);
    expect(getAbilityModifier(14)).toBe(2);
    expect(getAbilityModifier(18)).toBe(4);
    expect(getAbilityModifier(10, 5)).toBe(5);
  });

  it("aplica dano considerando PV temporários antes dos PV normais (Teste 5 e Teste 6)", () => {
    // Teste 5: 20 PV, 5 de dano -> 15/20
    const r1 = applyDamage(20, 20, 0, 5);
    expect(r1.currentHp).toBe(15);
    expect(r1.tempHp).toBe(0);

    // Teste 6: 20 PV e 5 PV temporários, 8 de dano -> 17 normais, 0 temp
    const r2 = applyDamage(20, 20, 5, 8);
    expect(r2.absorbedByTemp).toBe(5);
    expect(r2.hpLost).toBe(3);
    expect(r2.currentHp).toBe(17);
    expect(r2.tempHp).toBe(0);
  });

  it("cura respeitando PV máximos e nunca ultrapassa o teto", () => {
    const r = applyHealing(12, 20, 15);
    expect(r.currentHp).toBe(20);
    expect(r.healed).toBe(8);
  });

  it("não acumula PV temporários por padrão (regra D&D 5e)", () => {
    expect(applyTempHp(5, 3, "dnd5e-max")).toBe(5);
    expect(applyTempHp(5, 9, "dnd5e-max")).toBe(9);
    expect(applyTempHp(5, 3, "replace")).toBe(3);
  });

  it("interpreta comandos matemáticos -8, +5 e 15", () => {
    expect(executeHpCommand(20, 20, 3, "-8")).toMatchObject({
      valid: true,
      currentHp: 15,
      tempHp: 0,
    });
    expect(executeHpCommand(10, 20, 0, "+5")).toMatchObject({
      valid: true,
      currentHp: 15,
    });
    expect(executeHpCommand(10, 20, 0, "15")).toMatchObject({
      valid: true,
      currentHp: 15,
    });
    expect(executeHpCommand(10, 20, 0, "eval(1)")).toMatchObject({
      valid: false,
    });
  });

  it("calcula perícias com proficiência e especialização e percepção passiva", () => {
    const goblin = SEED_SHEETS.find((s) => s.id === "seed-goblin-001")!;
    // DES 14 (+2), prof 2, expertise -> +6
    expect(getSkillModifier(goblin, "stealth")).toBe(6);
    // SAB 8 (-1), sem proficiência -> percepção passiva 9
    expect(getPassivePerception(goblin)).toBe(9);
  });

  it("rola expressões de dados sem eval, com suporte a vantagem e desvantagem", () => {
    const seq = [0.05, 0.9]; // -> d20 rolls: 2 e 19
    let idx = 0;
    const adv = rollDiceExpression("1d20+5", {
      mode: "advantage",
      rng: () => seq[idx++],
    });
    expect(adv.terms[0].rolls).toEqual([2, 19]);
    expect(adv.terms[0].keptRolls).toEqual([19]);
    expect(adv.total).toBe(24);

    idx = 0;
    const disadv = rollDiceExpression("1d20+5", {
      mode: "disadvantage",
      rng: () => seq[idx++],
    });
    expect(disadv.terms[0].keptRolls).toEqual([2]);
    expect(disadv.total).toBe(7);

    const multi = rollDiceExpression("2d6+3", { rng: () => 0.5 }); // 4 + 4 + 3 = 11
    expect(multi.total).toBe(11);
    expect(() => rollDiceExpression("alert(1)")).toThrow();
  });

  it("gerencia duração e expiração de condições sem sobrescrever outras", () => {
    const poisoned = createConditionFromCatalog("poisoned", {
      duration: 2,
      durationUnit: "rounds",
    });
    const prone = createConditionFromCatalog("prone", {
      durationUnit: "indefinite",
    });

    const round1 = tickConditionsOnTurnAdvance([poisoned, prone], "round");
    expect(round1.next).toHaveLength(2);
    expect(round1.next[0].remainingRounds).toBe(1);

    const round2 = tickConditionsOnTurnAdvance(round1.next, "round");
    expect(round2.expired.map((c) => c.conditionId)).toEqual(["poisoned"]);
    expect(round2.next.map((c) => c.conditionId)).toEqual(["prone"]);
  });
});
