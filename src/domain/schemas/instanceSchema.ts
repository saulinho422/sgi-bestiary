import { z } from "zod";
import { VisibilityPolicySchema, CreatureSheetSchema } from "./sheetSchema";

export const ActiveConditionSchema = z.object({
  id: z.string().min(1),
  conditionId: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1).max(6),
  icon: z.string().min(1),
  color: z.string().min(1),
  category: z.enum(["standard", "custom"]),
  description: z.string().default(""),
  duration: z.number().int().nullable(),
  durationUnit: z.enum([
    "indefinite",
    "rounds",
    "minutes",
    "until-next-turn",
    "until-end-of-turn",
    "concentration",
  ]),
  remainingRounds: z.number().int().nullable(),
  source: z.string().optional(),
  visibleToPlayers: z.boolean().default(true),
  notes: z.string().optional(),
  appliedAt: z.string(),
});

export const PublicTokenProjectionSchema = z.object({
  v: z.literal(1),
  instanceId: z.string().min(1),
  boundItemId: z.string().min(1),
  templateId: z.string().min(1),
  category: z.enum(["monster", "npc", "character"]),
  visibility: VisibilityPolicySchema,
  publicName: z.string().optional(),
  hpRatio: z.number().min(0).max(1).optional(),
  currentHp: z.number().int().min(0).optional(),
  maxHp: z.number().int().min(1).optional(),
  tempHp: z.number().int().min(0).optional(),
  armorClass: z.number().int().min(0).optional(),
  conditions: z.array(
    z.object({
      id: z.string(),
      conditionId: z.string(),
      name: z.string(),
      code: z.string(),
      icon: z.string(),
      color: z.string(),
      description: z.string(),
      durationUnit: z.enum([
        "indefinite",
        "rounds",
        "minutes",
        "until-next-turn",
        "until-end-of-turn",
        "concentration",
      ]),
      remainingRounds: z.number().int().nullable(),
    }),
  ),
  concentrating: z.boolean(),
  summarySnapshot: z
    .object({
      name: z.string(),
      size: z.string(),
      creatureType: z.string(),
      challengeRating: z.string(),
      speedSummary: z.string(),
      description: z.string(),
      publicNotes: z.string(),
    })
    .optional(),
  fullSheetSnapshot: CreatureSheetSchema.optional(),
  syncedAt: z.string(),
});
