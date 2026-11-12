import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BestiaryApp } from "@/app/BestiaryApp";
import { SEED_SHEETS } from "@/integrations/storage/seedData";
import { storageProvider } from "@/integrations/storage/dexieRepository";
import { useBestiaryStore } from "@/stores/useBestiaryStore";

describe("Interface React e fluxos integrados (Testes 6 & UI)", () => {
  beforeEach(async () => {
    await storageProvider.instances.deleteInstancesByScene("local-sandbox");
    useBestiaryStore.setState({
      initialized: false,
      sheets: [],
      instances: [],
      rollLog: [],
    });
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

    // Filtra por busca instantânea
    const searchInput = screen.getByPlaceholderText(/Buscar nome/i);
    await user.type(searchInput, "Sentinela");
    expect(screen.getByText("Sentinela do Bosque")).toBeInTheDocument();
    expect(screen.queryByText("Goblin")).not.toBeInTheDocument();

    await user.clear(searchInput);
    expect(screen.getByText("Goblin")).toBeInTheDocument();

    // Abre ficha do Goblin e rola ataque da Cimitarra (Teste 6)
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

  it("permite invocar criatura na cena, aplicar dano em massa no Combate e manter estado sincronizado", async () => {
    const user = userEvent.setup();
    render(<BestiaryApp />);

    await waitFor(
      () => {
        expect(screen.getByText("Goblin")).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Filtra por Goblin e invoca 2 Goblins no modo local sandbox
    await user.type(screen.getByPlaceholderText(/Buscar nome/i), "Goblin");
    const invokeButtons = screen.getAllByTitle("Invocar no mapa");
    await user.click(invokeButtons[0]);

    const btn2x = await screen.findByRole("button", { name: "2×" }, { timeout: 5000 });
    await user.click(btn2x);
    await user.click(screen.getByRole("button", { name: /Invocar 2×/i }));

    await waitFor(
      () => {
        expect(useBestiaryStore.getState().instances.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: 5000 },
    );

    // Vai para aba Combate e aplica dano em massa em todos os alvos
    await user.click(screen.getByRole("button", { name: /Combate/i }));
    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: "Todos" })).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    await user.click(screen.getByRole("button", { name: "Todos" }));
    const massInput = screen.getByLabelText("Valor em massa");
    await user.clear(massInput);
    await user.type(massInput, "3");
    await user.click(screen.getByRole("button", { name: /Dano/i }));

    await waitFor(
      () => {
        const goblinSeed = SEED_SHEETS.find((s) => s.id === "seed-goblin-001")!;
        const insts = useBestiaryStore.getState().instances;
        expect(insts).toHaveLength(2);
        expect(insts.every((i) => i.currentHp === goblinSeed.hitPoints.maximum - 3)).toBe(true);
      },
      { timeout: 5000 },
    );
  });
});
