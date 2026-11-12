import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BestiaryApp } from "@/app/BestiaryApp";
import { createEmptySheet } from "@/domain/schemas/sheetSchema";
import { SEED_SHEETS } from "@/integrations/storage/seedData";
import { storageProvider } from "@/integrations/storage/dexieRepository";
import { useBestiaryStore } from "@/stores/useBestiaryStore";

async function clearSandboxState() {
  await storageProvider.instances.deleteInstancesByScene("local-sandbox");
  const encs = await storageProvider.encounters.listEncountersByScene(
    "local-sandbox",
  );
  for (const e of encs) {
    await storageProvider.encounters.deleteEncounter(e.id);
  }
  await storageProvider.encounters.setActiveEncounterId("local-sandbox", null);
  useBestiaryStore.setState({
    initialized: false,
    sheets: [],
    instances: [],
    encounters: [],
    activeEncounterId: null,
    rollLog: [],
  });
}

describe("Interface React e fluxos integrados (Testes UI Completos)", () => {
  beforeEach(async () => {
    await clearSandboxState();
  });

  it("carrega biblioteca inicial, filtra fichas e realiza rolagem clicável da ficha sem eval", async () => {
    const user = userEvent.setup();
    render(<BestiaryApp />);

    await waitFor(
      () => {
        expect(screen.getByText("Goblin")).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    const searchInput = screen.getByPlaceholderText(/Buscar nome/i);
    await user.type(searchInput, "Sentinela");
    expect(screen.getByText("Sentinela do Bosque")).toBeInTheDocument();
    expect(screen.queryByText("Goblin")).not.toBeInTheDocument();

    await user.clear(searchInput);
    expect(screen.getByText("Goblin")).toBeInTheDocument();

    await user.click(screen.getByText("Goblin"));
    await waitFor(
      () => {
        expect(screen.getByText("Cimitarra")).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    const attackButtons = screen.getAllByTitle("Rolar jogada de ataque");
    await user.click(attackButtons[0]);

    await waitFor(
      () => {
        const log = useBestiaryStore.getState().rollLog;
        expect(log.length).toBeGreaterThanOrEqual(1);
        expect(log[0].label).toContain("Cimitarra");
        expect(log[0].result.expression).toBe("1d20+4");
      },
      { timeout: 5000 },
    );
  });

  it("Teste 12: botão Invocar dentro da ficha completa abre modal imediatamente mantendo a ficha aberta", async () => {
    const user = userEvent.setup();
    render(<BestiaryApp />);

    await waitFor(() => {
      expect(screen.getByText("Goblin")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Goblin"));
    await waitFor(() => {
      expect(screen.getByText("← Voltar à Biblioteca")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^Invocar$/i }));

    // O modal de invocação precisa abrir imediatamente sobre a visualização da ficha
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Invocar Goblin")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /Invocar 1×/i }));

    await waitFor(() => {
      expect(useBestiaryStore.getState().instances).toHaveLength(1);
    });
    // Permanece na visualização da ficha após invocar
    expect(screen.getByText("← Voltar à Biblioteca")).toBeInTheDocument();
  });

  it("Testes 1 & 4 UI: separa Cena e Combate, exige inclusão explícita, aplica dano em massa e remove só do combate", async () => {
    const user = userEvent.setup();
    render(<BestiaryApp />);

    await waitFor(() => {
      expect(screen.getByText("Goblin")).toBeInTheDocument();
    });

    // Invoca 2 Goblins no modo local sandbox
    await user.type(screen.getByPlaceholderText(/Buscar nome/i), "Goblin");
    const invokeButtons = screen.getAllByTitle("Invocar no mapa");
    await user.click(invokeButtons[0]);

    const btn2x = await screen.findByRole("button", { name: "2×" });
    await user.click(btn2x);
    await user.click(screen.getByRole("button", { name: /Invocar 2×/i }));

    await waitFor(() => {
      expect(useBestiaryStore.getState().instances.length).toBeGreaterThanOrEqual(2);
    });

    // Aba Combate deve iniciar vazia mesmo havendo tokens na Cena
    const mainNav = screen.getByRole("navigation", { name: /Seções principais/i });
    await user.click(within(mainNav).getByRole("button", { name: /Combate/i }));
    expect(
      await screen.findByText(/Nenhum participante adicionado ao combate/i),
    ).toBeInTheDocument();

    // Volta para Cena, seleciona e adiciona explicitamente ao combate
    await user.click(screen.getByRole("button", { name: /Ir para Cena/i }));
    await user.click(screen.getByRole("button", { name: /Selecionar todos/i }));
    await user.click(screen.getByRole("button", { name: /Adicionar ao combate/i }));

    await waitFor(() => {
      expect(screen.getAllByText("No combate")).toHaveLength(2);
    });

    // Vai para Combate e aplica dano em massa em todos os alvos do combate
    await user.click(within(mainNav).getByRole("button", { name: /Combate/i }));
    await user.click(screen.getByRole("button", { name: "Todos" }));
    const massInput = screen.getByLabelText("Valor em massa");
    await user.clear(massInput);
    await user.type(massInput, "3");
    await user.click(screen.getByRole("button", { name: /Dano/i }));

    const goblinSeed = SEED_SHEETS.find((s) => s.id === "seed-goblin-001")!;
    await waitFor(() => {
      const insts = useBestiaryStore.getState().instances;
      expect(insts).toHaveLength(2);
      expect(
        insts.every((i) => i.currentHp === goblinSeed.hitPoints.maximum - 3),
      ).toBe(true);
    });

    // Remove 1 Goblin do combate -> continua na Cena com PV preservados
    const removeButtons = screen.getAllByTitle(
      /Remover do combate \(mantém token na cena\)/i,
    );
    await user.click(removeButtons[0]);

    await waitFor(() => {
      expect(useBestiaryStore.getState().instances).toHaveLength(2);
      const activeEnc = useBestiaryStore.getState().encounters[0];
      expect(activeEnc?.participants).toHaveLength(1);
    });
  }, 25000);

  it(
    "Testes 2, 5, 6, 7 UI: iniciativa manual de PJ, expansão automática do turno atual, ataques sem dano automático e troca de turno",
    async () => {
      const user = userEvent.setup();
      render(<BestiaryApp />);

      await waitFor(() => {
        expect(screen.getByText("Goblin")).toBeInTheDocument();
      });

      // Cria um PJ na loja para participar junto com Goblin e NPC
      const pjSheet = {
        ...createEmptySheet("character", "dnd5e-2014"),
        id: "ui-hero-pj",
        name: "Aelar Mago",
        abilities: { str: 8, dex: 14, con: 12, int: 18, wis: 12, cha: 10 },
        hitPoints: { maximum: 24, current: 24, temporary: 0, formula: "4d6+8" },
        armorClass: { value: 15, description: "Armadura Arcana" },
      };
      await useBestiaryStore.getState().saveSheet(pjSheet, "future-only");

      const goblinSeed = SEED_SHEETS.find((s) => s.id === "seed-goblin-001")!;
      const npcSeed = SEED_SHEETS.find((s) => s.kind === "npc")!;

      await useBestiaryStore.getState().spawnCreatures(goblinSeed, 1);
      await useBestiaryStore.getState().spawnCreatures(npcSeed, 1);
      await useBestiaryStore.getState().spawnCreatures(pjSheet, 1);

      const allInsts = useBestiaryStore.getState().instances;
      const gobInst = allInsts.find((i) => i.templateId === goblinSeed.id)!;
      const npcInst = allInsts.find((i) => i.templateId === npcSeed.id)!;
      const pjInst = allInsts.find((i) => i.templateId === pjSheet.id)!;

      await useBestiaryStore
        .getState()
        .addParticipantsToCombat([
          gobInst.boundItemId,
          npcInst.boundItemId,
          pjInst.boundItemId,
        ]);

      const mainNav = screen.getByRole("navigation", { name: /Seções principais/i });
      await user.click(within(mainNav).getByRole("button", { name: /Combate/i }));

      // Clica Rolar -> PJ permanece vazio/manual, enquanto Goblin e NPC recebem iniciativa
      await user.click(
        screen.getByTitle(
          /Rolar iniciativa para monstros e NPCs sem iniciativa definida/i,
        ),
      );

      await waitFor(() => {
        const enc = useBestiaryStore.getState().encounters[0];
        const pGob = enc.participants.find((p) => p.itemId === gobInst.boundItemId)!;
        const pNpc = enc.participants.find((p) => p.itemId === npcInst.boundItemId)!;
        const pPj = enc.participants.find((p) => p.itemId === pjInst.boundItemId)!;
        expect(typeof pGob.initiative).toBe("number");
        expect(typeof pNpc.initiative).toBe("number");
        expect(pPj.initiative).toBeNull();
      });

      // Define iniciativa alta (30) manualmente para PJ para garantir 1º turno e valor menor (20) para Goblin, 10 para NPC
      await useBestiaryStore.getState().setInstanceInitiative(pjInst.boundItemId, 30);
      await useBestiaryStore.getState().setInstanceInitiative(gobInst.boundItemId, 20);
      await useBestiaryStore.getState().setInstanceInitiative(npcInst.boundItemId, 10);

      // Inicia combate -> card do PJ (1º turno) expande automaticamente; Goblin e NPC ficam recolhidos
      await user.click(screen.getByRole("button", { name: /Iniciar/i }));

      await waitFor(() => {
        expect(screen.getByTestId(`combat-card-${pjInst.boundItemId}`)).toHaveAttribute(
          "data-expanded",
          "true",
        );
        expect(screen.getByTestId(`combat-card-${pjInst.boundItemId}`)).toHaveAttribute(
          "data-active-turn",
          "true",
        );
        expect(screen.getByTestId(`combat-card-${gobInst.boundItemId}`)).toHaveAttribute(
          "data-expanded",
          "false",
        );
      });

      // Avança turno para o Goblin -> PJ recolhe, Goblin expande automaticamente com Ataques independentes
      await user.click(screen.getByRole("button", { name: /Próximo/i }));

      await waitFor(() => {
        expect(screen.getByTestId(`combat-card-${pjInst.boundItemId}`)).toHaveAttribute(
          "data-expanded",
          "false",
        );
        expect(screen.getByTestId(`combat-card-${gobInst.boundItemId}`)).toHaveAttribute(
          "data-expanded",
          "true",
        );
        expect(screen.getByTestId(`combat-card-${gobInst.boundItemId}`)).toHaveAttribute(
          "data-active-turn",
          "true",
        );
      });

      const gobCard = screen.getByTestId(`combat-card-${gobInst.boundItemId}`);
      expect(within(gobCard).getByText(/Ataques/i)).toBeInTheDocument();
      expect(within(gobCard).getByText("Cimitarra")).toBeInTheDocument();

      // Rolar Ataque e Dano independentemente NÃO altera PV do Goblin
      await user.click(within(gobCard).getAllByRole("button", { name: /Atacar/i })[0]);
      await user.click(within(gobCard).getAllByRole("button", { name: /Dano/i })[0]);

      await waitFor(() => {
        expect(useBestiaryStore.getState().rollLog.length).toBeGreaterThanOrEqual(2);
      });
      const currentGob = useBestiaryStore
        .getState()
        .instances.find((i) => i.boundItemId === gobInst.boundItemId)!;
      expect(currentGob.currentHp).toBe(goblinSeed.hitPoints.maximum);

      // Ajuste manual inline de PV (-4) no card expandido funciona normalmente
      const pvInput = within(gobCard).getByPlaceholderText("-8 / +5 / 15");
      await user.type(pvInput, "-4");
      await user.click(within(gobCard).getByRole("button", { name: /Aplicar/i }));

      await waitFor(() => {
        const damaged = useBestiaryStore
          .getState()
          .instances.find((i) => i.boundItemId === gobInst.boundItemId)!;
        expect(damaged.currentHp).toBe(goblinSeed.hitPoints.maximum - 4);
      });
    },
    30000,
  );
});
