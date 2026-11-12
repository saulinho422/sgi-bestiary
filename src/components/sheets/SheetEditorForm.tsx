import { useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import type { CreatureSheet, FeatureEntry } from "@/domain/entities/sheet";
import {
  ABILITY_KEYS,
  ABILITY_LABELS_PT,
  CR_XP_TABLE,
  DND5E_SKILLS,
  formatSigned,
  getAbilityModifier,
  getProficiencyBonusFromCr,
  getProficiencyBonusFromLevel,
} from "@/domain/rules/dnd5eRules";
import type { AbilityKey, CreatureSize, Dnd5eRuleset, SheetCategory } from "@/domain/types/rpgSystem";
import { CollapsibleSection } from "../common/UiPrimitives";
import { ImagePickerField } from "../common/ImagePickerField";

type FeatureBucketKey =
  | "traits"
  | "actions"
  | "bonusActions"
  | "reactions"
  | "legendaryActions"
  | "lairActions"
  | "mythicActions"
  | "spells"
  | "resources"
  | "equipment"
  | "customFeatures";

const BUCKET_META: Array<{
  key: FeatureBucketKey;
  label: string;
  defaultKind: FeatureEntry["kind"];
}> = [
  { key: "traits", label: "Características", defaultKind: "trait" },
  { key: "actions", label: "Ações", defaultKind: "action" },
  { key: "bonusActions", label: "Ações Bônus", defaultKind: "bonus" },
  { key: "reactions", label: "Reações", defaultKind: "reaction" },
  { key: "legendaryActions", label: "Lendárias", defaultKind: "legendary" },
  { key: "lairActions", label: "Covil", defaultKind: "lair" },
  { key: "mythicActions", label: "Míticas", defaultKind: "mythic" },
  { key: "spells", label: "Magias", defaultKind: "spell" },
  { key: "resources", label: "Recursos", defaultKind: "resource" },
  { key: "equipment", label: "Equipamentos", defaultKind: "equipment" },
  { key: "customFeatures", label: "Personalizadas", defaultKind: "custom" },
];

export function SheetEditorForm({
  initialSheet,
  hasActiveInstances = false,
  onSave,
  onCancel,
}: {
  initialSheet: CreatureSheet;
  hasActiveInstances?: boolean;
  onSave: (
    sheet: CreatureSheet,
    syncMode: "future-only" | "existing-preserve-damage" | "existing-reset-hp",
  ) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<CreatureSheet>(() =>
    structuredClone(initialSheet),
  );
  const [activeBucket, setActiveBucket] = useState<FeatureBucketKey>("actions");
  const [syncMode, setSyncMode] = useState<
    "future-only" | "existing-preserve-damage" | "existing-reset-hp"
  >("existing-preserve-damage");
  const [saving, setSaving] = useState(false);

  const patch = <K extends keyof CreatureSheet>(key: K, val: CreatureSheet[K]) =>
    setDraft((prev) => ({ ...prev, [key]: val }));

  const addFeature = (bucket: FeatureBucketKey) => {
    const meta = BUCKET_META.find((b) => b.key === bucket)!;
    const newEntry: FeatureEntry = {
      id: `${meta.defaultKind}-${crypto.randomUUID()}`,
      name: "Nova habilidade",
      description: "",
      kind: meta.defaultKind,
      damage: meta.defaultKind === "action" ? [] : undefined,
    };
    patch(bucket, [...draft[bucket], newEntry]);
  };

  const updateFeature = (
    bucket: FeatureBucketKey,
    idx: number,
    updater: (prev: FeatureEntry) => FeatureEntry,
  ) => {
    const list = [...draft[bucket]];
    list[idx] = updater(list[idx]);
    patch(bucket, list);
  };

  const removeFeature = (bucket: FeatureBucketKey, idx: number) => {
    patch(
      bucket,
      draft[bucket].filter((_, i) => i !== idx),
    );
  };

  const toggleSaveProficiency = (ability: AbilityKey) => {
    const exists = draft.savingThrows.find((s) => s.ability === ability);
    if (exists) {
      patch(
        "savingThrows",
        draft.savingThrows.map((s) =>
          s.ability === ability ? { ...s, proficient: !s.proficient } : s,
        ),
      );
    } else {
      patch("savingThrows", [
        ...draft.savingThrows,
        { ability, proficient: true },
      ]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      await onSave(
        {
          ...draft,
          name: draft.name.trim(),
        },
        hasActiveInstances ? syncMode : "future-only",
      );
    } finally {
      setSaving(false);
    }
  };

  const currentFeatures = draft[activeBucket];

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-xs">
      {/* Barra de ação superior fixa */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-300 bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <div>
          <div className="text-sm font-bold">
            {draft.name || "Nova Ficha"}
          </div>
          <div className="text-[11px] text-stone-500 dark:text-slate-400">
            Editando modelo da biblioteca (ID: {draft.id.slice(0, 14)}...)
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasActiveInstances && (
            <select
              value={syncMode}
              onChange={(e) =>
                setSyncMode(
                  e.target.value as
                    | "future-only"
                    | "existing-preserve-damage"
                    | "existing-reset-hp",
                )
              }
              aria-label="Propagação para instâncias em cena"
              className="rounded border border-amber-500/50 bg-amber-50 px-2 py-1 text-[11px] dark:bg-slate-800"
            >
              <option value="existing-preserve-damage">
                Atualizar tokens da cena (preservar dano)
              </option>
              <option value="future-only">Aplicar apenas aos próximos tokens</option>
              <option value="existing-reset-hp">
                Atualizar tokens e restaurar PV
              </option>
            </select>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-md border border-stone-300 px-2.5 py-1 font-medium hover:bg-stone-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-3.5 w-3.5" /> Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Salvando..." : "Salvar Ficha"}
          </button>
        </div>
      </div>

      {/* 1. Identificação & Imagens */}
      <CollapsibleSection title="1. Identificação & Imagens" defaultOpen>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div>
            <label className="mb-0.5 block font-medium">Nome *</label>
            <input
              required
              type="text"
              value={draft.name}
              onChange={(e) => patch("name", e.target.value)}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="mb-0.5 block font-medium">Apelido / Nome alternativo</label>
            <input
              type="text"
              value={draft.alias ?? ""}
              onChange={(e) => patch("alias", e.target.value)}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block font-medium">Categoria</label>
              <select
                value={draft.kind}
                onChange={(e) => patch("kind", e.target.value as SheetCategory)}
                className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="monster">Monstro</option>
                <option value="npc">NPC</option>
                <option value="character">Personagem</option>
              </select>
            </div>
            <div>
              <label className="mb-0.5 block font-medium">Regras D&D 5e</label>
              <select
                value={draft.ruleset}
                onChange={(e) => patch("ruleset", e.target.value as Dnd5eRuleset)}
                className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="dnd5e-2014">D&D 5e (2014)</option>
                <option value="dnd5e-2024">D&D 5e (2024)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-0.5 block font-medium">Tamanho</label>
              <select
                value={draft.size}
                onChange={(e) => patch("size", e.target.value as CreatureSize)}
                className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="TINY">Miúdo</option>
                <option value="SMALL">Pequeno</option>
                <option value="MEDIUM">Médio</option>
                <option value="LARGE">Grande</option>
                <option value="HUGE">Enorme</option>
                <option value="GARGANTUAN">Imenso</option>
              </select>
            </div>
            <div>
              <label className="mb-0.5 block font-medium">Tipo</label>
              <input
                type="text"
                value={draft.creatureType}
                onChange={(e) => patch("creatureType", e.target.value)}
                className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="mb-0.5 block font-medium">Subtipo</label>
              <input
                type="text"
                value={draft.subtype ?? ""}
                onChange={(e) => patch("subtype", e.target.value)}
                className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block font-medium">Tendência</label>
              <input
                type="text"
                value={draft.alignment}
                onChange={(e) => patch("alignment", e.target.value)}
                className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="mb-0.5 block font-medium">Fonte</label>
              <input
                type="text"
                value={draft.source ?? ""}
                onChange={(e) => patch("source", e.target.value)}
                placeholder="SRD, Livro dos Monstros..."
                className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="mb-0.5 block font-medium">
              Tags (separadas por vírgula)
            </label>
            <input
              type="text"
              value={draft.tags.join(", ")}
              onChange={(e) =>
                patch(
                  "tags",
                  e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                )
              }
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <ImagePickerField
            label="Imagem do Token (Mapa)"
            value={draft.tokenImage}
            searchHint={draft.name}
            onChange={(next) => patch("tokenImage", next)}
          />
          <ImagePickerField
            label="Retrato / Ilustração"
            value={draft.portrait}
            searchHint={draft.name}
            onChange={(next) => patch("portrait", next)}
          />

          <div className="sm:col-span-2">
            <label className="mb-0.5 block font-medium">Descrição</label>
            <textarea
              rows={2}
              value={draft.description}
              onChange={(e) => patch("description", e.target.value)}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* 2. Combate & Deslocamentos */}
      <CollapsibleSection title="2. Combate, Vida & Deslocamentos" defaultOpen>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div>
            <label className="mb-0.5 block font-medium">CA *</label>
            <input
              type="number"
              min={0}
              value={draft.armorClass.value}
              onChange={(e) =>
                patch("armorClass", {
                  ...draft.armorClass,
                  value: Number(e.target.value) || 0,
                })
              }
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-0.5 block font-medium">Observação da CA</label>
            <input
              type="text"
              value={draft.armorClass.description}
              onChange={(e) =>
                patch("armorClass", {
                  ...draft.armorClass,
                  description: e.target.value,
                })
              }
              placeholder="Armadura natural, escudo..."
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="mb-0.5 block font-medium">Bônus Proficiência</label>
            <input
              type="number"
              value={draft.proficiencyBonus}
              onChange={(e) =>
                patch("proficiencyBonus", Number(e.target.value) || 0)
              }
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <div>
            <label className="mb-0.5 block font-medium">PV Máximos *</label>
            <input
              type="number"
              min={1}
              value={draft.hitPoints.maximum}
              onChange={(e) =>
                patch("hitPoints", {
                  ...draft.hitPoints,
                  maximum: Math.max(1, Number(e.target.value) || 1),
                })
              }
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="mb-0.5 block font-medium">Fórmula Dados de Vida</label>
            <input
              type="text"
              value={draft.hitPoints.formula}
              onChange={(e) =>
                patch("hitPoints", {
                  ...draft.hitPoints,
                  formula: e.target.value,
                })
              }
              placeholder="5d8+5"
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="mb-0.5 block font-medium">
              {draft.kind === "character" ? "Nível" : "ND"}
            </label>
            <input
              type="text"
              value={draft.challengeRating}
              onChange={(e) => {
                const cr = e.target.value;
                patch("challengeRating", cr);
                if (cr in CR_XP_TABLE) {
                  patch("experiencePoints", CR_XP_TABLE[cr]);
                  patch("proficiencyBonus", getProficiencyBonusFromCr(cr));
                }
              }}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="mb-0.5 block font-medium">XP</label>
            <input
              type="number"
              min={0}
              value={draft.experiencePoints}
              onChange={(e) =>
                patch("experiencePoints", Number(e.target.value) || 0)
              }
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        </div>

        {/* Deslocamentos */}
        <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {(
            [
              ["walk", "Terra"],
              ["fly", "Voo"],
              ["swim", "Natação"],
              ["climb", "Escalada"],
              ["burrow", "Escavação"],
            ] as const
          ).map(([spKey, label]) => (
            <div key={spKey}>
              <label className="mb-0.5 block text-[11px] font-medium">
                {label}
              </label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={draft.speed[spKey] ?? ""}
                onChange={(e) =>
                  patch("speed", {
                    ...draft.speed,
                    [spKey]: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          ))}
          <div>
            <label className="mb-0.5 block text-[11px] font-medium">
              Unidade
            </label>
            <select
              value={draft.speed.unit}
              onChange={(e) =>
                patch("speed", {
                  ...draft.speed,
                  unit: e.target.value as "m" | "ft" | "q",
                })
              }
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="m">Metros (m)</option>
              <option value="ft">Pés (ft)</option>
              <option value="q">Quadrados (q)</option>
            </select>
          </div>
        </div>
      </CollapsibleSection>

      {/* 3. Atributos, Resistências & Perícias */}
      <CollapsibleSection
        title="3. Atributos, Salvaguardas, Perícias & Sentidos"
        defaultOpen={false}
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITY_KEYS.map((ab) => {
            const score = draft.abilities[ab];
            const override = draft.abilityModifiersOverride?.[ab];
            const mod = getAbilityModifier(score, override);
            const saveProficient = draft.savingThrows.some(
              (s) => s.ability === ab && s.proficient,
            );
            return (
              <div
                key={ab}
                className="rounded border border-stone-200 p-1.5 text-center dark:border-slate-700"
              >
                <div className="font-bold text-red-900 dark:text-red-300">
                  {ABILITY_LABELS_PT[ab].short} ({formatSigned(mod)})
                </div>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={score}
                  onChange={(e) =>
                    patch("abilities", {
                      ...draft.abilities,
                      [ab]: Math.max(1, Number(e.target.value) || 10),
                    })
                  }
                  className="mt-1 w-full rounded border border-stone-300 bg-white px-1 py-0.5 text-center dark:border-slate-700 dark:bg-slate-900"
                />
                <label className="mt-1 flex items-center justify-center gap-1 text-[10px]">
                  <input
                    type="checkbox"
                    checked={saveProficient}
                    onChange={() => toggleSaveProficiency(ab)}
                  />
                  TR Prof
                </label>
              </div>
            );
          })}
        </div>

        <div className="mt-3">
          <div className="mb-1 font-semibold">Perícias (D&D 5e)</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {DND5E_SKILLS.map((sk) => {
              const entry = draft.skills.find((s) => s.id === sk.id);
              const level = entry?.expertise
                ? "expertise"
                : entry?.proficient
                  ? "proficient"
                  : entry?.halfProficiency
                    ? "half"
                    : "none";
              return (
                <div
                  key={sk.id}
                  className="flex items-center justify-between gap-1 rounded border border-stone-200 px-1.5 py-1 dark:border-slate-800"
                >
                  <span className="truncate text-[11px]">{sk.label}</span>
                  <select
                    value={level}
                    onChange={(e) => {
                      const val = e.target.value;
                      const rest = draft.skills.filter((s) => s.id !== sk.id);
                      if (val === "none") {
                        patch("skills", rest);
                      } else {
                        patch("skills", [
                          ...rest,
                          {
                            id: sk.id,
                            proficient: val === "proficient" || val === "expertise",
                            expertise: val === "expertise",
                            halfProficiency: val === "half",
                          },
                        ]);
                      }
                    }}
                    className="rounded border border-stone-300 bg-white px-1 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="none">—</option>
                    <option value="half">½ Prof</option>
                    <option value="proficient">Prof</option>
                    <option value="expertise">Espec.</option>
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              ["damageResistances", "Resistências a Dano (vírgula)"],
              ["damageImmunities", "Imunidades a Dano (vírgula)"],
              ["damageVulnerabilities", "Vulnerabilidades (vírgula)"],
              ["conditionImmunities", "Imunidades a Condições (vírgula)"],
              ["senses", "Sentidos (vírgula)"],
              ["languages", "Idiomas (vírgula)"],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <label className="mb-0.5 block text-[11px] font-medium">
                {label}
              </label>
              <input
                type="text"
                value={draft[field].join(", ")}
                onChange={(e) =>
                  patch(
                    field,
                    e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  )
                }
                className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* 4. Habilidades, Ações, Magias e Recursos Ilimitados */}
      <CollapsibleSection
        title="4. Habilidades, Ações & Magias (Sem limite)"
        defaultOpen
      >
        <div className="mb-2 flex flex-wrap gap-1">
          {BUCKET_META.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setActiveBucket(b.key)}
              className={
                activeBucket === b.key
                  ? "rounded bg-red-800 px-2 py-1 text-[11px] font-semibold text-white"
                  : "rounded bg-stone-200 px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-300 dark:bg-slate-800 dark:text-slate-300"
              }
            >
              {b.label} ({draft[b.key].length})
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {currentFeatures.map((feat, idx) => (
            <div
              key={feat.id}
              className="space-y-2 rounded-lg border border-stone-300 bg-stone-50/70 p-2 dark:border-slate-700 dark:bg-slate-900/70"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={feat.name}
                  placeholder="Nome da habilidade ou ataque"
                  onChange={(e) =>
                    updateFeature(activeBucket, idx, (p) => ({
                      ...p,
                      name: e.target.value,
                    }))
                  }
                  className="flex-1 rounded border border-stone-300 bg-white px-2 py-1 font-semibold dark:border-slate-700 dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={() => removeFeature(activeBucket, idx)}
                  title="Remover"
                  className="rounded p-1 text-red-600 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <div>
                  <label className="block text-[10px] text-stone-500">
                    Bônus Ataque
                  </label>
                  <input
                    type="number"
                    value={feat.attackBonus ?? ""}
                    placeholder="+4"
                    onChange={(e) =>
                      updateFeature(activeBucket, idx, (p) => ({
                        ...p,
                        attackBonus:
                          e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                    className="w-full rounded border border-stone-300 bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-500">
                    Dano (ex: 1d8+2)
                  </label>
                  <input
                    type="text"
                    value={feat.damage?.[0]?.formula ?? ""}
                    placeholder="1d8+2"
                    onChange={(e) => {
                      const formula = e.target.value.trim();
                      updateFeature(activeBucket, idx, (p) => ({
                        ...p,
                        damage: formula
                          ? [
                              {
                                formula,
                                type: p.damage?.[0]?.type || "cortante",
                              },
                            ]
                          : [],
                      }));
                    }}
                    className="w-full rounded border border-stone-300 bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-500">
                    Tipo de Dano
                  </label>
                  <input
                    type="text"
                    value={feat.damage?.[0]?.type ?? ""}
                    placeholder="cortante"
                    onChange={(e) => {
                      const dmgType = e.target.value;
                      updateFeature(activeBucket, idx, (p) => ({
                        ...p,
                        damage: p.damage?.[0]?.formula
                          ? [{ formula: p.damage[0].formula, type: dmgType }]
                          : p.damage,
                      }));
                    }}
                    className="w-full rounded border border-stone-300 bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-500">
                    Usos Máximos
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={feat.maxUses ?? ""}
                    placeholder="Ilimitado"
                    onChange={(e) =>
                      updateFeature(activeBucket, idx, (p) => ({
                        ...p,
                        maxUses:
                          e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                    className="w-full rounded border border-stone-300 bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>

              <textarea
                rows={2}
                value={feat.description}
                placeholder="Descrição da habilidade, alcance, efeitos..."
                onChange={(e) =>
                  updateFeature(activeBucket, idx, (p) => ({
                    ...p,
                    description: e.target.value,
                  }))
                }
                className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => addFeature(activeBucket)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-stone-400 px-3 py-1.5 text-xs font-medium hover:bg-stone-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar em {BUCKET_META.find((b) => b.key === activeBucket)?.label}
          </button>
        </div>
      </CollapsibleSection>

      {/* 5. Personagem Completo (quando Personagem ou NPC avançado) */}
      <CollapsibleSection
        title="5. Personagem Completo (Classes, Nível, Inventário)"
        defaultOpen={draft.kind === "character"}
      >
        {!draft.characterDetails ? (
          <button
            type="button"
            onClick={() =>
              patch("characterDetails", {
                species: "Humano",
                classes: [
                  {
                    id: crypto.randomUUID(),
                    name: "Guerreiro",
                    level: 1,
                    hitDie: "d10",
                  },
                ],
                level: 1,
                background: "",
                inspiration: false,
                experiencePoints: 0,
                proficiencies: { armor: [], weapons: [], tools: [] },
                inventory: [],
                currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
                deathSaves: { successes: 0, failures: 0 },
              })
            }
            className="rounded border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1 text-indigo-700 dark:text-indigo-300"
          >
            Habilitar seção de Personagem / Multiclasse
          </button>
        ) : (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div>
                <label className="block font-medium">
                  {draft.ruleset === "dnd5e-2024" ? "Espécie" : "Raça"}
                </label>
                <input
                  type="text"
                  value={draft.characterDetails.species ?? ""}
                  onChange={(e) =>
                    patch("characterDetails", {
                      ...draft.characterDetails!,
                      species: e.target.value,
                    })
                  }
                  className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block font-medium">Antecedente</label>
                <input
                  type="text"
                  value={draft.characterDetails.background ?? ""}
                  onChange={(e) =>
                    patch("characterDetails", {
                      ...draft.characterDetails!,
                      background: e.target.value,
                    })
                  }
                  className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block font-medium">Nível Total</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={draft.characterDetails.level}
                  onChange={(e) => {
                    const lvl = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                    patch("proficiencyBonus", getProficiencyBonusFromLevel(lvl));
                    patch("characterDetails", {
                      ...draft.characterDetails!,
                      level: lvl,
                    });
                  }}
                  className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Classes / Multiclasse</span>
                <button
                  type="button"
                  onClick={() =>
                    patch("characterDetails", {
                      ...draft.characterDetails!,
                      classes: [
                        ...draft.characterDetails!.classes,
                        {
                          id: crypto.randomUUID(),
                          name: "Classe",
                          level: 1,
                          hitDie: "d8",
                        },
                      ],
                    })
                  }
                  className="inline-flex items-center gap-1 rounded bg-stone-200 px-2 py-0.5 text-[11px] dark:bg-slate-800"
                >
                  <Plus className="h-3 w-3" /> Classe
                </button>
              </div>
              {draft.characterDetails.classes.map((cls, cIdx) => (
                <div key={cls.id} className="grid grid-cols-12 gap-1.5">
                  <input
                    type="text"
                    value={cls.name}
                    placeholder="Classe"
                    onChange={(e) => {
                      const next = [...draft.characterDetails!.classes];
                      next[cIdx] = { ...cls, name: e.target.value };
                      patch("characterDetails", {
                        ...draft.characterDetails!,
                        classes: next,
                      });
                    }}
                    className="col-span-5 rounded border border-stone-300 bg-white px-2 py-0.5 dark:border-slate-700 dark:bg-slate-900"
                  />
                  <input
                    type="text"
                    value={cls.subclass ?? ""}
                    placeholder="Subclasse"
                    onChange={(e) => {
                      const next = [...draft.characterDetails!.classes];
                      next[cIdx] = { ...cls, subclass: e.target.value };
                      patch("characterDetails", {
                        ...draft.characterDetails!,
                        classes: next,
                      });
                    }}
                    className="col-span-4 rounded border border-stone-300 bg-white px-2 py-0.5 dark:border-slate-700 dark:bg-slate-900"
                  />
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={cls.level}
                    onChange={(e) => {
                      const next = [...draft.characterDetails!.classes];
                      next[cIdx] = { ...cls, level: Number(e.target.value) || 1 };
                      patch("characterDetails", {
                        ...draft.characterDetails!,
                        classes: next,
                      });
                    }}
                    className="col-span-2 rounded border border-stone-300 bg-white px-1 py-0.5 text-center dark:border-slate-700 dark:bg-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      patch("characterDetails", {
                        ...draft.characterDetails!,
                        classes: draft.characterDetails!.classes.filter(
                          (_, i) => i !== cIdx,
                        ),
                      })
                    }
                    className="col-span-1 text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 6. Visibilidade Padrão & Notas */}
      <CollapsibleSection
        title="6. Visibilidade dos Jogadores & Notas"
        defaultOpen={false}
      >
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {(
            [
              ["publicName", "Mostrar nome"],
              ["publicHealthBar", "Mostrar barra de vida"],
              ["publicHealthPercent", "Mostrar % de vida"],
              ["publicExactHp", "Mostrar PV exatos"],
              ["publicTempHp", "Mostrar PV temp."],
              ["publicArmorClass", "Mostrar CA"],
              ["publicConditions", "Mostrar condições"],
              ["publicSummarySheet", "Ficha resumida pública"],
              ["publicFullSheet", "Ficha completa pública"],
              ["playerCanEdit", "Jogador pode editar PV"],
            ] as const
          ).map(([flag, label]) => (
            <label
              key={flag}
              className="flex items-center gap-1.5 rounded border border-stone-200 px-2 py-1 dark:border-slate-800"
            >
              <input
                type="checkbox"
                checked={draft.visibility[flag]}
                onChange={(e) =>
                  patch("visibility", {
                    ...draft.visibility,
                    [flag]: e.target.checked,
                  })
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-0.5 block font-medium">Notas Públicas</label>
            <textarea
              rows={3}
              value={draft.notes.public}
              onChange={(e) =>
                patch("notes", { ...draft.notes, public: e.target.value })
              }
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="mb-0.5 block font-medium text-amber-700 dark:text-amber-300">
              Notas Privadas do Mestre (nunca vão aos jogadores)
            </label>
            <textarea
              rows={3}
              value={draft.notes.gm}
              onChange={(e) =>
                patch("notes", { ...draft.notes, gm: e.target.value })
              }
              className="w-full rounded border border-amber-400/60 bg-amber-50/40 px-2 py-1 dark:border-amber-700/60 dark:bg-amber-950/20"
            />
          </div>
        </div>
      </CollapsibleSection>
    </form>
  );
}
