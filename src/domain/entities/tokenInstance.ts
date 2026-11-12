import type { SheetCategory } from "../types/rpgSystem";
import type { CreatureSheet, VisibilityPolicy } from "./sheet";

export type ConditionDurationUnit =
  | "indefinite"
  | "rounds"
  | "minutes"
  | "until-next-turn"
  | "until-end-of-turn"
  | "concentration";

export interface ActiveCondition {
  id: string;
  conditionId: string;
  name: string;
  code: string;
  icon: string;
  color: string;
  category: "standard" | "custom";
  description: string;
  duration: number | null;
  durationUnit: ConditionDurationUnit;
  remainingRounds: number | null;
  source?: string;
  visibleToPlayers: boolean;
  notes?: string;
  appliedAt: string;
}

export interface InstanceHistoryEntry {
  timestamp: string;
  action: "damage" | "heal" | "set-hp" | "temp-hp" | "condition" | "restore" | "sync" | "bind";
  summary: string;
}

export interface TokenInstance {
  /** Identificador lógico único da instância */
  instanceId: string;
  /** ID real do item no Owlbear Rodeo (usado como chave primária de distinção!) */
  boundItemId: string;
  sceneId: string;
  templateId: string;
  templateUpdatedAt?: string;
  category: SheetCategory;
  individualName?: string;
  currentHp: number;
  maxHp: number;
  tempHp: number;
  armorClass: number;
  initiative?: number | null;
  concentratingOn?: string | null;
  conditions: ActiveCondition[];
  consumedResources: Record<string, number>;
  deathSaves: {
    successes: number;
    failures: number;
  };
  visibility: VisibilityPolicy;
  gmNotes?: string;
  history: InstanceHistoryEntry[];
  updatedAt: string;
}

export interface PublicConditionView {
  id: string;
  conditionId: string;
  name: string;
  code: string;
  icon: string;
  color: string;
  description: string;
  durationUnit: ConditionDurationUnit;
  remainingRounds: number | null;
}

export interface PublicTokenProjection {
  v: 1;
  instanceId: string;
  boundItemId: string;
  templateId: string;
  category: SheetCategory;
  visibility: VisibilityPolicy;
  /** Nome público exibido no HUD dos jogadores (ausente se oculto) */
  publicName?: string;
  /** Proporção [0..1] apenas se publicHealthBar ou publicHealthPercent for true */
  hpRatio?: number;
  /** Presentes APENAS quando visibility.publicExactHp === true */
  currentHp?: number;
  maxHp?: number;
  /** Presente APENAS quando visibility.publicTempHp === true */
  tempHp?: number;
  /** Presente APENAS quando visibility.publicArmorClass === true */
  armorClass?: number;
  /** Condições públicas (apenas quando visibility.publicConditions === true) */
  conditions: PublicConditionView[];
  concentrating: boolean;
  /** Ficha resumida sanitizada (apenas se visibility.publicSummarySheet === true) */
  summarySnapshot?: {
    name: string;
    size: string;
    creatureType: string;
    challengeRating: string;
    speedSummary: string;
    description: string;
    publicNotes: string;
  };
  /** Ficha completa sem notas do mestre (apenas se visibility.publicFullSheet === true) */
  fullSheetSnapshot?: CreatureSheet;
  /** Carimbo de sincronização */
  syncedAt: string;
}

export interface ImageTemplateMapping {
  signature: string;
  imageUrl?: string;
  imageName?: string;
  templateId: string;
  autoRecognize: boolean;
  updatedAt: string;
}

export interface InitiativeState {
  active: boolean;
  round: number;
  turnIndex: number;
  order: Array<{
    itemId: string;
    initiative: number;
    dexTiebreaker: number;
  }>;
}

export interface CombatParticipant {
  itemId: string;
  initiative: number | null;
  dexTiebreaker: number;
  manualOrderAdjustment?: number;
  addedAt: string;
}

export interface CombatEncounter {
  id: string;
  name: string;
  sceneId: string;
  active: boolean;
  round: number;
  activeParticipantItemId: string | null;
  participants: CombatParticipant[];
  createdAt: string;
  updatedAt: string;
}
