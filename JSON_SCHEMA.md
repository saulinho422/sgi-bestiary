# Esquema JSON Canônico — SGI Bestiary (`schemaVersion: "1.0.0"`)

Todas as fichas da biblioteca podem ser exportadas individualmente, em lote ou em pacote completo de backup, bem como validadas e migradas na importação via `Zod` (`src/domain/schemas/sheetSchema.ts`).

---

## 1. Formatos Aceitos na Importação

O parser em `src/features/import-export/jsonImporter.ts` detecta automaticamente 4 formatos:

| Formato | Descrição |
| :--- | :--- |
| **`sgi-single`** | Um objeto único representando uma `CreatureSheet`. |
| **`sgi-array`** | Um array JSON `[sheet1, sheet2, ...]`. |
| **`sgi-bundle`** | Objeto `{ format: "sgi-bestiary-bundle", schemaVersion: "1.0.0", sheets: [...], settings?, imageMappings? }`. |
| **`external-5e-mapped`** | JSON externo no estilo Open5e / tabular (ex.: `armor_class`, `hit_points`, `strength`, `special_abilities`, `actions`). É convertido automaticamente para o formato SGI com aviso explícito na pré-visualização. |

---

## 2. Exemplo Completo (`examples/monsters/sentinela-do-bosque.json`)

```json
{
  "schemaVersion": "1.0.0",
  "id": "example-sentinela-001",
  "system": "dnd5e",
  "ruleset": "dnd5e-2014",
  "kind": "monster",
  "name": "Sentinela do Bosque",
  "size": "MEDIUM",
  "creatureType": "HUMANOID",
  "alignment": "NEUTRAL",
  "armorClass": {
    "value": 14,
    "description": "Armadura natural"
  },
  "hitPoints": {
    "maximum": 27,
    "formula": "5d8+5"
  },
  "speed": {
    "walk": 9,
    "fly": null,
    "swim": null,
    "climb": null,
    "burrow": null,
    "unit": "m"
  },
  "abilities": {
    "str": 14,
    "dex": 12,
    "con": 12,
    "int": 8,
    "wis": 11,
    "cha": 9
  },
  "challengeRating": "1",
  "experiencePoints": 200,
  "skills": [
    { "id": "perception", "proficient": true }
  ],
  "actions": [
    {
      "id": "attack-001",
      "name": "Espada",
      "description": "Ataque corpo a corpo com espada longa.",
      "kind": "action",
      "attackBonus": 4,
      "reach": 1.5,
      "damage": [
        { "formula": "1d8+2", "type": "slashing" }
      ]
    }
  ],
  "visibility": {
    "publicName": true,
    "publicHealthBar": true,
    "publicExactHp": false,
    "publicArmorClass": false,
    "publicConditions": true
  },
  "notes": {
    "public": "Vigia as ruínas silvestres.",
    "gm": "Exemplo inicial do sistema"
  }
}
```

---

## 3. Regras de Segurança, Migração e Compatibilidade

1. **Preservação de campos desconhecidos**: os schemas usam `.passthrough()`, mantendo intactas propriedades customizadas de terceiros ao exportar e reimportar.
2. **Migração de chaves antigas**:
   - `visibility.publicHitPoints` → migrado automaticamente para `visibility.publicExactHp`.
3. **Resolução de duplicidades na pré-visualização**:
   - Se `id` já existe ou `kind + name` coincide com uma ficha local, o usuário escolhe individualmente ou em massa entre: **Substituir existente (`replace`)**, **Importar como cópia (`copy`)** ou **Ignorar (`skip`)**.
4. **Sanitização e limites**:
   - Tamanho máximo por arquivo/texto: **10 MB**.
   - Profundidade máxima: **32 níveis**.
   - Remoção recursiva das chaves `__proto__`, `constructor` e `prototype`.
   - Remoção de blocos `<script>...</script>` em strings e bloqueio de URLs `javascript:`, `vbscript:` e `data:text/*` em `portrait`, `tokenImage` e `altImage`.
