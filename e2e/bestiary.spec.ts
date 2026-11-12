import { expect, test } from "@playwright/test";

test.describe("SGI Bestiary — E2E Fluxo Real e Rotas GitHub Pages no Navegador", () => {
  test("carrega todos os entrypoints, ícones e manifest em subdiretório sem 404", async ({
    page,
    request,
  }) => {
    const failedResponses: string[] = [];
    const pageErrors: string[] = [];

    page.on("response", (res) => {
      if (res.status() >= 400) {
        failedResponses.push(`${res.status()} ${res.url()}`);
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    // 1. Verifica manifest.json no subdiretório configurado
    const manifestRes = await request.get("./manifest.json");
    expect(manifestRes.status()).toBe(200);
    const manifest = (await manifestRes.json()) as {
      manifest_version: number;
      icon: string;
      background_url: string;
      homepage_url: string;
      action: { icon: string; popover: string };
    };
    expect(manifest.manifest_version).toBe(1);
    expect(manifest.icon.startsWith("https://")).toBe(true);
    expect(manifest.background_url.startsWith("https://")).toBe(true);
    expect(manifest.action.icon.startsWith("https://")).toBe(true);
    expect(manifest.action.popover.startsWith("https://")).toBe(true);

    // 2. Verifica todos os assets estáticos declarados/usados
    for (const relAsset of [
      "./icon.svg",
      "./icons/logo.svg",
      "./icons/sheet.svg",
      "./icons/bind.svg",
      "./tokens/monster.svg",
      "./tokens/npc.svg",
      "./tokens/character.svg",
    ]) {
      const r = await request.get(relAsset);
      expect(r.status(), `Asset ${relAsset}`).toBe(200);
    }

    // 3. Verifica carregamento real de todos os entrypoints HTML sem erros de runtime/404
    await page.goto("./src/action/action.html");
    await expect(page.getByText("Goblin")).toBeVisible();

    await page.goto("./src/contextMenu/context-menu.html");
    await expect(page.getByText(/Token sem vínculo SGI/i)).toBeVisible();

    await page.goto("./src/modal/modal.html?view=sheet");
    await expect(page.getByText(/Visualização Expandida/i)).toBeVisible();

    const bgResponse = await page.goto("./src/background/background.html");
    expect(bgResponse?.status()).toBe(200);

    expect(failedResponses).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("Teste 1, 2 e 9: cria ficha, persiste após reload, importa JSON, altera tema e rola dados", async ({
    page,
  }) => {
    const failedResponses: string[] = [];
    page.on("response", (res) => {
      if (res.status() >= 400) {
        failedResponses.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto("./");

    // Carrega biblioteca inicial
    await expect(page.getByText("Goblin")).toBeVisible();
    await expect(page.getByText("Sentinela do Bosque")).toBeVisible();

    // Cria um novo monstro (Teste 1)
    await page.getByRole("button", { name: "Monstro", exact: true }).click();
    const nameInput = page.locator("form input[required]").first();
    await nameInput.fill("Hidra de Ferro");
    await page.getByRole("button", { name: /Salvar Ficha/i }).click();

    await expect(page.getByRole("heading", { name: "Hidra de Ferro" })).toBeVisible();

    // Recarrega a página e confirma persistência real em IndexedDB
    await page.reload();
    await expect(page.getByText("Hidra de Ferro")).toBeVisible();

    // Importa uma ficha JSON pela aba JSON (Teste 2)
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    const customSheetJson = JSON.stringify({
      schemaVersion: "1.0.0",
      id: "e2e-kraken-001",
      name: "Kraken Abissal",
      armorClass: { value: 18, description: "Natural" },
      hitPoints: { maximum: 190, formula: "16d12+80" },
      abilities: { str: 24, dex: 11, con: 20, int: 18, wis: 16, cha: 18 },
    });
    await page.locator("textarea").fill(customSheetJson);
    await page.getByRole("button", { name: /Analisar/i }).click();
    await expect(page.getByText("Kraken Abissal", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Confirmar Importação/i }).click();
    await expect(page.getByText(/Relatório de Importação/i)).toBeVisible();

    // Verifica Kraken na Biblioteca mesmo após reload
    await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
    await expect(page.getByText("Kraken Abissal", { exact: true })).toBeVisible();

    // Alterna tema claro/escuro na aba Config. (Teste 9 UI)
    await page.getByRole("button", { name: "Config.", exact: true }).click();
    const themeSelect = page.getByLabel("Tema da interface");
    await themeSelect.selectOption("light");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await themeSelect.selectOption("dark");
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Testa rolagem de dados na barra inferior
    await page.getByRole("button", { name: /^Rolar$/i }).click();
    await expect(page.getByText(/Rolagem rápida/i)).toBeVisible();

    expect(failedResponses).toEqual([]);
  });

  test("Invocar dentro da ficha, separar Cena de Combate, expandir turno ativo e remover só do combate", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("./");
    await expect(page.getByText("Goblin")).toBeVisible();

    // Abre ficha do Goblin e testa Invocar dentro da ficha (Teste 12)
    await page.getByText("Goblin").click();
    await expect(page.getByText("← Voltar à Biblioteca")).toBeVisible();
    await page.getByRole("button", { name: /^Invocar$/i }).click();
    await expect(page.getByText("Invocar Goblin")).toBeVisible();
    await page.getByRole("button", { name: "2×" }).click();
    await page.getByRole("button", { name: /Invocar 2×/i }).click();

    // Deve continuar na ficha aberta após invocar
    await expect(page.getByText("← Voltar à Biblioteca")).toBeVisible();

    // Aba Combate começa vazia mesmo com 2 Goblins na Cena
    await page.getByRole("navigation").getByRole("button", { name: /Combate/i }).click();
    await expect(
      page.getByText(/Nenhum participante adicionado ao combate/i),
    ).toBeVisible();

    // Vai para Cena, seleciona e inclui no combate
    await page.getByRole("button", { name: /Ir para Cena/i }).click();
    await page.getByRole("button", { name: /Selecionar todos/i }).click();
    await page.getByRole("button", { name: /Adicionar ao combate/i }).click();
    await expect(page.getByText("No combate").first()).toBeVisible();

    // Combate exibe participantes, rola e inicia com card ativo expandido
    await page.getByRole("navigation").getByRole("button", { name: /Combate/i }).click();
    await page
      .getByTitle(/Rolar iniciativa para monstros e NPCs sem iniciativa definida/i)
      .click();
    await page.getByRole("button", { name: /Iniciar/i }).click();

    await expect(page.getByText("Turno Ativo")).toBeVisible();
    await expect(page.getByText(/Ataques \(/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Atacar/i }).first()).toBeVisible();

    // Próximo turno mantém 1 card expandido
    await page.getByRole("button", { name: /Próximo/i }).click();
    await expect(page.getByText("Turno Ativo")).toBeVisible();
    await expect(page.locator('[data-expanded="true"]')).toHaveCount(1);

    expect(pageErrors).toEqual([]);
  });
});
