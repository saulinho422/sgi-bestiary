# Arquitetura — SGI Bestiary

Este documento descreve a separação modular de responsabilidades, fluxos de sincronização no Owlbear Rodeo e decisões de design voltadas à manutenibilidade e extensibilidade.

> **Nota sobre o nome**: **SGI Bestiary** é um nome provisório de projeto independente, sem vínculo comercial ou dependência de serviços externos proprietários. A hospedagem de produção é 100% estática via **GitHub Pages** e todos os dados do usuário ficam armazenados localmente no navegador.

---

## 1. Separação em Camadas

1. **Domínio (`src/domain/entities/`, `src/domain/types/`)**
   - `rpgSystem.ts`: interface `RpgSystemDefinition` que permite registrar outros sistemas além de `"dnd5e"` sem alterar a ponte com o Owlbear Rodeo.
   - `sheet.ts`: entidade `CreatureSheet` para monstros, NPCs e personagens (atributos, CA, PV, deslocamentos, perícias, resistências, arrays ilimitados de habilidades e detalhes de personagem).
   - `tokenInstance.ts`: `TokenInstance` (estado vivo do Mestre), `PublicTokenProjection` (visão sanitizada para a sala), `ImageTemplateMapping` e `InitiativeState`.
   - `settings.ts`: preferências da UI (`BestiarySettings["ui"]`) e do HUD (`BestiarySettings["hud"]`).

2. **Regras de D&D 5e (`src/domain/rules/`)**
   - `dnd5eRules.ts`: cálculo de modificadores (`Math.floor((score - 10) / 2)`), bônus de proficiência, salvaguardas, perícias com ½ proficiência / proficiência / especialização, percepção passiva, absorção prioritária de PV temporários antes dos PV normais, comandos matemáticos rápidos (`-8`, `+5`, `15`) e parser recursivo seguro de expressões de dados (sem `eval`).
   - `conditionsCatalog.ts`: catálogo completo das 15 condições oficiais PT-BR (2014/2024) + suporte a condições personalizadas e expiração automática ao avançar turnos.
   - `visibilityProjection.ts`: função pura `projectTokenForPlayers()` responsável por filtrar e sanitizar o que pode ir para os metadados públicos do Owlbear Rodeo.

3. **Validação e Migração (`src/domain/schemas/`)**
   - `sheetSchema.ts` & `instanceSchema.ts`: schemas Zod v4 com `.passthrough()` (preserva campos desconhecidos durante exportação/importação), limpeza contra *prototype pollution* (`__proto__`, `constructor`, `prototype`), bloqueio de `javascript:` / `<script>` em imagens e migração automática de chaves legadas (ex.: `publicHitPoints` → `publicExactHp`).

4. **Persistência Local Abstrata (`src/integrations/storage/`)**
   - `storageAdapter.ts`: define o contrato `StorageProvider` (`library`, `instances`, `mappings`, `settings`).
   - `dexieDatabase.ts` & `dexieRepository.ts`: implementação local em IndexedDB via **Dexie**, sincronizando automaticamente todos os iframes da extensão na mesma origem (`background`, `action`, `contextMenu`, `modal`) usando `BroadcastChannel("sgi-bestiary-db-sync")`, somada à importação/exportação completa em JSON.
   - A abstração em `StorageProvider` mantém a extensão inteiramente funcional no navegador do usuário sem servidor próprio, permitindo evoluir provedores locais futuramente sem tocar nos componentes React nem no motor do Owlbear Rodeo.

5. **Serviços de Instâncias (`src/services/instanceService.ts`)**
   - Vincula cada ficha a um item específico do mapa usando `boundItemId = item.id` do Owlbear Rodeo.
   - `cloneInstanceForDuplicateToken()` cria uma nova `TokenInstance` com `instanceId` inédito quando o usuário duplica um token no mapa.
   - `applySheetUpdateToInstance()` propaga edições da ficha-base para instâncias em cena em modo `existing-preserve-damage`, `existing-reset-hp` ou `future-only`.

6. **Integração Owlbear Rodeo e Subdiretório GitHub Pages (`src/integrations/owlbear/`, `src/background/`, `src/utils/assetUrls.ts`)**
   - **`SgiBackgroundDaemon` (`src/background/backgroundService.ts`)**: registrado via `manifest.json` (`manifest_version: 1`, `background_url` HTTPS). Fica ativo continuamente enquanto a aba do Owlbear Rodeo estiver aberta, mesmo com o popover fechado:
     - Registra os menus contextuais (`SGI: Controle Rápido`, `Abrir Ficha (SGI)`, `Vincular ficha (SGI)`).
     - Observa `OBR.scene.items.onChange`:
       1. Detecta tokens duplicados nativamente (`projection.boundItemId !== item.id`) e os desacopla imediatamente.
       2. Aplica auto-reconhecimento apenas se houver um `ImageTemplateMapping` com `autoRecognize: true`.
       3. Gera as visões por papel (`GM` vs `PLAYER`) e aciona o reconciliador incremental do HUD.
     - Ouve `OBR.broadcast` no canal `com.sgi.bestiary/player-edit`, validando no cliente do Mestre que `instance.visibility.playerCanEdit === true` antes de aplicar qualquer alteração solicitada por jogador.
   - **`src/utils/assetUrls.ts`**: ancora automaticamente todos os entrypoints (`action`, `contextMenu`, `modal`, `background`), ícones e tokens padrão SVG no `BASE_URL` do Vite (`/<NOME-DO-REPOSITORIO>/`), gerando URLs HTTPS completas para as chamadas da `@owlbear-rodeo/sdk` para que o subdiretório do GitHub Pages jamais seja perdido.

7. **Motor de HUD Tático (`src/features/token-hud/`)**
   - `hudMath.ts`: geometria agnóstica de resolução usando `grid.dpi`, `grid.offset`, `scale` e dimensões reais da imagem.
   - `hudRenderer.ts`: `planHudReconciliation()` calcula o *diff* via *fingerprint* por token; se 1 token entre 100 muda de PV, somente os itens locais daquele token são recriados via `OBR.scene.local`. Todo item criado recebe o prefixo exclusivo `com.sgi.bestiary.hud.` para garantir que a limpeza jamais apague itens de terceiros.

---

## 2. Fluxo Mestre vs. Jogadores (Isolamento de Dados)

```text
[Banco Local do Mestre (IndexedDB)]
  ├── CreatureSheet (inclui notes.gm privadas)
  └── TokenInstance (currentHp real, armorClass real, visibility)
          │
          ▼  projectTokenForPlayers(instance, sheet)
[OBR Item Metadata (com.sgi.bestiary/token)]
  └── PublicTokenProjection
        ├── se publicExactHp == false → hpRatio [0..1] apenas; currentHp/maxHp OMITIDOS
        ├── se publicArmorClass == false → armorClass OMITIDA
        └── notes.gm SEMPRE removida, inclusive quando publicFullSheet == true
```

> **Importante (Arquitetura 100% Client-Side no Owlbear Rodeo):**
> Quando o Mestre libera apenas `publicHealthBar`, a proporção `hpRatio` existe nos metadados compartilhados para que o cliente do jogador desenhe a barra visualmente no `OBR.scene.local`. Os valores numéricos (`currentHp`, `maxHp`, `armorClass`, `tempHp`, `notes.gm`) só são incluídos quando explicitamente habilitados na `VisibilityPolicy`.

---

## 3. Comportamento e Limites Conhecidos da API Owlbear Rodeo

- **Arrastar tokens diretamente do Dock padrão do Owlbear Rodeo**: a SDK do Owlbear Rodeo não fornece evento pré-drop de metadados de Dock externo nem intercepta o catálogo interno do usuário. Portanto:
  1. Tokens invocados pela aba **Biblioteca** do SGI Bestiary já nascem vinculados, posicionados sem sobreposição e com `TokenInstance` independente.
  2. Tokens já presentes ou arrastados do Dock podem ser vinculados com 1 clique pelo menu contextual (**Vincular ficha (SGI)**) ou pela aba **Cena**; marcando *"Reconhecer automaticamente novos tokens com esta mesma imagem"*, arrastos futuros daquela mesma arte no Dock passam a ser vinculados automaticamente pelo daemon de background.
- **Modo Local / Sandbox (fora do Owlbear Rodeo)**: quando `OBR.isAvailable === false`, toda a persistência Dexie, criação/edição de fichas, importação/exportação JSON, rolagem de dados, invocação simulada e combate funcionam normalmente no navegador para uso offline e testes E2E sem travar a aplicação.
