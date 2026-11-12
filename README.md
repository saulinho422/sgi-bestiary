# SGI Bestiary — Extensão D&D 5e para Owlbear Rodeo

> **Nome provisório**: **SGI Bestiary** identifica apenas este projeto open-source e não representa vínculo com nenhuma empresa nem utiliza dependências de sistemas comerciais externos.

Gerenciador completo de fichas de **monstros, NPCs e personagens** para **Dungeons & Dragons 5ª Edição (2014 e 2024)** integrado diretamente ao **Owlbear Rodeo** via `@owlbear-rodeo/sdk`, hospedado de forma gratuita e automatizada no **GitHub Pages**.

---

## Principais Recursos

- **Biblioteca local persistente (IndexedDB / Dexie)**: monstros, NPCs e personagens completos (multiclasse, espaços de magia, inventário, moedas, recursos por descanso, testes contra morte e habilidades dinâmicas ilimitadas).
- **Regras D&D 5e (2014 e 2024)** com separação explícita por conjunto de regras (`dnd5e-2014` e `dnd5e-2024`), cálculo automático de modificadores, salvaguardas, perícias (proficiência, meia-proficiência, especialização), percepção passiva, absorção de dano por **PV Temporários** e rolador seguro de dados sem `eval`.
- **Ciclo completo de instâncias por Token (`item.id`)**:
  - **1 ficha → N tokens independentes**: altere os PV ou aplique *Envenenado* no Goblin 2 sem afetar o Goblin 1, 3 ou 4.
  - **Invocação em lote sem sobreposição**: invoque 1 ou N criaturas direto pela Biblioteca no centro da câmera atual, respeitando o tamanho em grade (`1x1`, `2x2`, `3x3`, `4x4`).
  - **Desacoplamento automático ao duplicar tokens nativamente no Owlbear Rodeo** (`Ctrl+D` / menu duplicar).
  - **Reconhecimento automático opcional por imagem mapeada (`ImageTemplateMapping`)**.
- **HUD Tático no Mapa (`OBR.scene.local`)**:
  - Barra de vida configurável (`bottom`, `top`, `left`, `right`), faixa separada para PV temporários, escudo de CA, marcador de concentração, ícones + siglas acessíveis de condições e rótulo de nome legível com zoom.
  - Executado continuamente em `background_url` mesmo com o painel principal fechado.
  - Reconciliação incremental pronta para cenas com **50–100+ tokens** e limpeza isolada que nunca remove itens de outras extensões.
- **Segurança real Mestre vs Jogadores**:
  - Os dados confidenciais do Mestre (`notes.gm`, PV exatos ocultos, CA oculta) permanecem no **IndexedDB local do Mestre**.
  - Os metadados compartilhados da cena recebem apenas uma **Projeção Pública Sanitizada (`PublicTokenProjection`)**.
  - Jogadores só visualizam ou editam tokens explicitamente autorizados via `VisibilityPolicy`.
- **Importação e Exportação JSON robusta**:
  - Ficha única, lote, backup completo (`sheets + settings + imageMappings`) e mapeador tolerante para formatos externos de D&D 5e.
  - Pré-visualização antes de salvar, resolução por item de duplicidades (*Substituir*, *Criar Cópia*, *Ignorar*) e proteção contra *prototype pollution*, XSS em SVG e arquivos acima de 10 MB.

---

## Estrutura de Pastas

```text
├── .github/workflows/
│   └── deploy.yml             # Pipeline automático: typecheck, testes, build e deploy no GitHub Pages
├── public/
│   ├── manifest.json          # Manifesto v1 oficial do Owlbear Rodeo (template HTTPS)
│   ├── .nojekyll              # Garante publicação estática limpa no GitHub Pages
│   ├── icon.svg               # Ícone da barra de ação
│   ├── icons/                 # Ícones de menu contextual e marca
│   └── tokens/                # Miniaturas SVG padrão (monster/npc/character)
├── scripts/
│   └── verify-dist.mjs        # Verificação automatizada de arquivos e caminhos em dist/
├── examples/                  # JSONs prontos de exemplo (Monstros, NPC 2024, PJ Multiclasse)
├── e2e/                       # Testes ponta-a-ponta com Playwright sob subdiretório
├── src/
│   ├── action/                # Entrypoint do popover principal (src/action/action.html)
│   ├── app/                   # Shell visual compacta (5 abas + barra de dados)
│   ├── background/            # Daemon contínuo (HUD local + menus contextuais + duplicação)
│   ├── components/            # Componentes React modulares (Biblioteca, Cena, Combate, Fichas, JSON, Config)
│   ├── contextMenu/           # Embed do menu de clique direito no token (PV rápido + condições)
│   ├── domain/                # Entidades puras, catálogo de condições, regras 5e, projeção e schemas Zod
│   ├── features/              # Exportador/Importador JSON e motor geométrico/reconciliador do HUD
│   ├── integrations/          # Dexie StorageProvider, bridge @owlbear-rodeo/sdk e rolador sem eval
│   ├── modal/                 # Janela expandida de ficha completa e modal de vinculação de tokens
│   ├── services/              # Regras de criação, clonagem e mutação de TokenInstance
│   ├── stores/                # Store Zustand sincronizada entre iframes via BroadcastChannel
│   ├── tests/                 # Testes unitários, build/manifesto, persistência, escala e UI (Vitest)
│   └── utils/                 # Helper de subdiretório GitHub Pages (assetUrls), themeSync e IDs
├── ARCHITECTURE.md            # Arquitetura técnica detalhada e limites da SDK
├── JSON_SCHEMA.md             # Especificação e compatibilidade de JSON
└── DEPLOYMENT.md              # Guia detalhado de GitHub Pages e checklist em sala real OBR
```

---

## Publicação no GitHub Pages (Produção Oficial)

A extensão funciona inteiramente no navegador (IndexedDB + GitHub Pages), sem servidores externos nem banco remoto.

### 1. Suba o projeto para um repositório no GitHub

1. Verifique se já há repositório Git local configurado (`git status` / `git remote -v`). Se ainda não houver:

```bash
git init
git add .
git commit -m "feat: SGI Bestiary pronto para GitHub Pages"
git branch -M main
git remote add origin https://github.com/<SEU-USUARIO>/<NOME-DO-REPOSITORIO>.git
git push -u origin main
```

### 2. Habilite o GitHub Pages via GitHub Actions

1. No GitHub, abra o repositório e vá em **Settings** → **Pages**.
2. Em **Source**, escolha **GitHub Actions**.
3. O workflow [.github/workflows/deploy.yml](./.github/workflows/deploy.yml) será executado automaticamente a cada `push` na branch `main` (ou pode ser acionado manualmente em **Actions**).
4. O workflow detecta automaticamente `<SEU-USUARIO>` e `/<NOME-DO-REPOSITORIO>/`, executa `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, valida todos os arquivos em `dist/` com `npm run verify:dist` e publica no GitHub Pages.

### 3. Endereço final do manifesto publicado

Após o término do deploy, a URL do manifesto será:

```text
https://<SEU-USUARIO>.github.io/<NOME-DO-REPOSITORIO>/manifest.json
```

Abra essa URL diretamente no navegador para confirmar que o JSON responde HTTP 200 com `manifest_version: 1` e todos os links `https://`.

### 4. Como instalar a extensão no Owlbear Rodeo

1. Acesse [https://www.owlbear.rodeo](https://www.owlbear.rodeo) e entre em uma sala.
2. Abra **Extensions (•••)** no canto inferior esquerdo → clique em **Add Extension**.
3. Cole a URL do manifesto publicado:
   `https://<SEU-USUARIO>.github.io/<NOME-DO-REPOSITORIO>/manifest.json`
4. Confirme e ative a extensão na sala.
5. Clique no ícone do **SGI Bestiary** na barra de ações para abrir o painel (`520×640`). O serviço de background permanece ativo continuamente mesmo após fechar o painel.

> Qualquer jogador ou mestre convidado para a sala carregará a extensão automaticamente pelo GitHub Pages, sem precisar manter seu computador ligado.

---

## Como Executar Localmente (Desenvolvimento)

### Pré-requisitos
- Node.js 20+ (testado com Node 22/24)
- npm 10+

### Servidor de desenvolvimento
```bash
npm install
npm run dev
```
Por padrão o Vite utiliza `base: "/sgi-bestiary/"` para reproduzir o comportamento de subdiretório do GitHub Pages. O servidor local inicia em:
- Aplicação: `http://localhost:5173/sgi-bestiary/`
- Manifesto dinâmico de dev: `http://localhost:5173/sgi-bestiary/manifest.json`

Para testar outro nome de repositório localmente ou executar na raiz `/`:
```bash
VITE_BASE_PATH=/meu-bestiario/ npm run dev
```

---

## Verificação e Testes Automatizados

```bash
# 1. Verificação estrita de tipos (TypeScript Project References)
npm run typecheck

# 2. Testes unitários, regras 5e, persistência Dexie, manifesto/URLs, segurança GM/Jogador, escala e UI React
npm test

# 3. Build de produção com reescrita HTTPS automática de dist/manifest.json
npm run build

# 4. Auditoria obrigatória da pasta dist/ (entrypoints HTML, ícones, tokens, .nojekyll e manifest.json)
npm run verify:dist

# 5. Testes E2E em navegador real (Chromium) contra `vite preview` no subdiretório configurado
npm run test:e2e
```

Consulte [DEPLOYMENT.md](./DEPLOYMENT.md) para detalhes completos de variáveis opcionais de build e o checklist de validação manual dentro de uma sala real do Owlbear Rodeo.
