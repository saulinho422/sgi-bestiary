# Publicação no GitHub Pages e Validação no Owlbear Rodeo

A extensão **SGI Bestiary** é publicada **exclusivamente no GitHub Pages** por meio de **GitHub Actions** (`.github/workflows/deploy.yml`). Todo o processamento roda diretamente no navegador do usuário com persistência local em **IndexedDB (Dexie)** e portabilidade via **JSON** — sem necessidade de servidor próprio ou infraestrutura adicional.

---

## 1. Requisitos de Hospedagem Atendidos pelo GitHub Pages

O Owlbear Rodeo carrega extensões a partir de uma URL HTTPS apontando para `manifest.json`:

- **HTTPS automático**: `https://<SEU-USUARIO>.github.io/<NOME-DO-REPOSITORIO>/manifest.json`.
- **CORS liberado por padrão**: arquivos estáticos no GitHub Pages servem `Access-Control-Allow-Origin: *`, permitindo leitura do `manifest.json` e carregamento dos iframes por `https://www.owlbear.rodeo`.
- **Subdiretório de repositório suportado**: tanto o `base` do Vite quanto `dist/manifest.json` e todas as URLs internas da extensão (popovers, `background_url`, menus contextuais, modais, ícones e tokens padrão SVG) são ajustados automaticamente para `/<NOME-DO-REPOSITORIO>/`.

---

## 2. Como Publicar Automaticamente com GitHub Actions

### Passo 1 — Criar e enviar o repositório para o GitHub

1. Crie um repositório público (ou GitHub Pages habilitado) no GitHub, por exemplo `sgi-bestiary`.
2. Inicialize o Git localmente (caso ainda não tenha `.git`), faça o primeiro commit e envie para a branch `main`:

```bash
git init
git add .
git commit -m "chore: prepara SGI Bestiary para GitHub Pages"
git branch -M main
git remote add origin https://github.com/<SEU-USUARIO>/<NOME-DO-REPOSITORIO>.git
git push -u origin main
```

> **Atenção**: Caso já exista um repositório Git configurado na máquina ou no GitHub, verifique antes com `git remote -v` para não substituir histórico existente sem confirmação.

### Passo 2 — Ativar o GitHub Pages via GitHub Actions

1. No repositório do GitHub, acesse **Settings** → **Pages**.
2. Em **Build and deployment** → **Source**, selecione **GitHub Actions**.

### Passo 3 — Acompanhar o workflow automático

O arquivo [deploy.yml](./.github/workflows/deploy.yml) é disparado automaticamente a cada push na branch `main` (ou manualmente via **Actions** → **Deploy SGI Bestiary para GitHub Pages** → **Run workflow**):

1. Instala as dependências com `npm ci` (Node.js 22).
2. Executa `npm run typecheck`.
3. Executa toda a suíte `npm test` (Vitest).
4. Detecta automaticamente a origem (`https://<SEU-USUARIO>.github.io`) e o subdiretório (`/<NOME-DO-REPOSITORIO>/`) via `actions/configure-pages@v5`.
5. Gera o bundle de produção multi-página em `dist/` com `dist/manifest.json` preenchido com URLs HTTPS válidas (`manifest_version: 1`).
6. Executa `npm run verify:dist` para confirmar presença de todos os 5 entrypoints (`index.html`, `src/action/action.html`, `src/background/background.html`, `src/contextMenu/context-menu.html`, `src/modal/modal.html`), ícones SVG, miniaturas SVG, assets JS/CSS compilados e `.nojekyll`.
7. Publica a pasta `dist/` diretamente no GitHub Pages (`actions/deploy-pages@v4`).

### Passo 4 — Confirmar o `manifest.json` publicado

Após o workflow concluir com sucesso, acesse no navegador:

```text
https://<SEU-USUARIO>.github.io/<NOME-DO-REPOSITORIO>/manifest.json
```

Confirme que o JSON retornado exibe:
- `"manifest_version": 1`
- `"icon"`, `"background_url"`, `"action.icon"` e `"action.popover"` com URLs `https://<SEU-USUARIO>.github.io/<NOME-DO-REPOSITORIO>/...`.

---

## 3. Simulação Local do Build de Subdiretório

Para testar localmente exatamente como será publicado no GitHub Pages (por exemplo, simulando `/meu-bestiario/`):

```bash
# Exemplo Linux/macOS:
export VITE_BASE_PATH=/meu-bestiario/
export VITE_PUBLIC_ORIGIN=https://meu-usuario.github.io
npm run build && npm run verify:dist

# Exemplo PowerShell (Windows):
$env:VITE_BASE_PATH="/meu-bestiario/"; $env:VITE_PUBLIC_ORIGIN="https://meu-usuario.github.io"; npm run build; npm run verify:dist
```

---

## 4. Instalação no Owlbear Rodeo

1. Abra ou crie uma sala no [Owlbear Rodeo](https://www.owlbear.rodeo).
2. No menu lateral inferior esquerdo, clique em **Extensions (•••)** → **Add Extension**.
3. Cole o endereço completo do manifesto publicado no GitHub Pages:
   `https://<SEU-USUARIO>.github.io/<NOME-DO-REPOSITORIO>/manifest.json`
4. Clique em **Add** e ative a extensão na sala atual.
5. O botão do **SGI Bestiary** aparecerá na barra de ações no canto superior esquerdo.

---

## 5. Checklist de Validação Manual em Sala Real OBR

Os testes automatizados (`npm run typecheck`, `npm test`, `npm run build`, `npm run verify:dist` e `npm run test:e2e`) verificam tipagem, domínio 5e, persistência IndexedDB/Dexie, importação/exportação JSON, ciclo de instâncias, segurança `projectTokenForPlayers`, escala com 100 tokens e carregamento completo no subdiretório no Chromium.

Após publicar no GitHub Pages, execute este checklist manual dentro de uma sala real do Owlbear Rodeo:

- [ ] **Manifesto e Ícone**: `manifest.json` carrega sem erros de CORS no console do navegador e o ícone abre o popover `520×640`.
- [ ] **Background Daemon**: feche o popover da extensão e ajuste PV via menu contextual do token (`SGI: Controle Rápido`); confirme que a barra de vida e condições atualizam no mapa mesmo com o painel fechado.
- [ ] **Duplicação Nativa**: selecione um token vinculado no mapa e duplique (`Ctrl+D`); altere os PV da cópia e confirme que o original permanece intacto.
- [ ] **Múltiplos Goblins / Invocação em lote**: invoque 4× Goblin pela Biblioteca; verifique posicionamento sem sobreposição no centro da câmera e controle individual.
- [ ] **Visibilidade Mestre vs Jogador**: conecte uma segunda janela anônima como **Jogador** na mesma sala; confirme que monstros padrão mostram barra visual/nome público sem vazar PV numéricos, CA ou Notas Privadas do Mestre.
- [ ] **Zoom e Desempenho**: teste com zoom mínimo e máximo e confirme leitura nítida dos rótulos e fluidez na cena.
