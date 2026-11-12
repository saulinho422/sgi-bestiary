import { EyeOff, Heart, Shield, Sparkles } from "lucide-react";
import type { PublicTokenProjection } from "@/domain/entities/tokenInstance";
import { CREATURE_TYPE_LABELS_PT, SIZE_LABELS_PT } from "@/domain/rules/dnd5eRules";
import { CreatureStatBlock } from "./CreatureStatBlock";
import { Badge } from "../common/UiPrimitives";

export function PlayerPublicSheetView({
  projection,
  rollMode = "normal",
}: {
  projection: PublicTokenProjection;
  rollMode?: "normal" | "advantage" | "disadvantage";
}) {
  const vis = projection.visibility;

  if (vis.publicFullSheet && projection.fullSheetSnapshot) {
    const fullSheet = projection.fullSheetSnapshot;
    const sanitizedSheet = {
      ...fullSheet,
      notes: {
        public: fullSheet.notes?.public ?? "",
        gm: "",
      },
    };
    return (
      <div className="space-y-2">
        {(projection.armorClass !== undefined ||
          projection.hpRatio !== undefined ||
          projection.conditions.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-300/80 bg-white/80 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900/70">
            {projection.armorClass !== undefined && (
              <span className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-300">
                <Shield className="h-3.5 w-3.5" /> CA {projection.armorClass}
              </span>
            )}
            {projection.currentHp !== undefined && projection.maxHp !== undefined ? (
              <span className="inline-flex items-center gap-1 font-bold text-red-600 dark:text-red-400">
                <Heart className="h-3.5 w-3.5" /> {projection.currentHp}/{projection.maxHp}
                {projection.tempHp ? ` (+${projection.tempHp})` : ""}
              </span>
            ) : (
              projection.hpRatio !== undefined && (
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Heart className="h-3.5 w-3.5 text-red-500" />
                  {Math.round(projection.hpRatio * 100)}%
                </span>
              )
            )}
            {projection.concentrating && (
              <Badge variant="warning">
                <Sparkles className="h-3 w-3" /> Concentrando
              </Badge>
            )}
            {projection.conditions.map((c) => (
              <span
                key={c.id}
                style={{ backgroundColor: c.color }}
                className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
              >
                {c.name}
              </span>
            ))}
          </div>
        )}
        <CreatureStatBlock
          sheet={sanitizedSheet}
          viewerRole="PLAYER"
          defaultMode="full"
          rollMode={rollMode}
          rollVisibility="public"
          canEdit={false}
        />
      </div>
    );
  }

  if (vis.publicSummarySheet && projection.summarySnapshot) {
    const sum = projection.summarySnapshot;
    const sizePt = SIZE_LABELS_PT[sum.size] ?? sum.size;
    const typePt =
      CREATURE_TYPE_LABELS_PT[sum.creatureType.toUpperCase()] ?? sum.creatureType;

    return (
      <div className="space-y-3 rounded-lg border border-stone-300 bg-white/90 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/90">
        <div className="border-b border-red-800/40 pb-2 dark:border-red-500/40">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-red-900 dark:text-red-300">
              {sum.name}
            </h2>
            <Badge variant={projection.category}>{projection.category}</Badge>
          </div>
          <div className="text-[11px] italic text-stone-600 dark:text-slate-400">
            {typePt} {sizePt} • ND/Nível {sum.challengeRating}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {projection.armorClass !== undefined && (
            <div>
              <strong>CA:</strong> {projection.armorClass}
            </div>
          )}
          <div>
            <strong>Deslocamento:</strong> {sum.speedSummary}
          </div>
          {projection.currentHp !== undefined && projection.maxHp !== undefined ? (
            <div>
              <strong>PV:</strong> {projection.currentHp}/{projection.maxHp}
              {projection.tempHp ? ` (+${projection.tempHp} Temp)` : ""}
            </div>
          ) : projection.hpRatio !== undefined ? (
            <div>
              <strong>Saúde:</strong> {Math.round(projection.hpRatio * 100)}%
            </div>
          ) : null}
        </div>

        {projection.conditions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {projection.conditions.map((c) => (
              <span
                key={c.id}
                style={{ backgroundColor: c.color }}
                className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
              >
                {c.name}
              </span>
            ))}
          </div>
        )}

        {sum.description && (
          <p className="whitespace-pre-line text-stone-700 dark:text-slate-300">
            {sum.description}
          </p>
        )}

        {sum.publicNotes && (
          <div className="rounded bg-stone-100 p-2 dark:bg-slate-800">
            <div className="font-semibold">Notas Públicas</div>
            <p className="mt-0.5 whitespace-pre-line">{sum.publicNotes}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-stone-300 bg-white/80 p-6 text-center text-xs text-stone-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
      <EyeOff className="mx-auto mb-2 h-6 w-6 opacity-60" />
      <div className="font-semibold">Ficha restrita ao Mestre</div>
      <p className="mt-1">
        Os detalhes desta criatura não foram liberados para os jogadores.
      </p>
    </div>
  );
}
