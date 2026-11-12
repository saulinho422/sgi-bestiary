export type HudPosition = "bottom" | "top" | "left" | "right";

export type HealthDisplayMode =
  | "bar-only"
  | "bar-percent"
  | "bar-exact"
  | "condition-only"
  | "none";

export type TempHpRuleMode = "dnd5e-max" | "replace";

export interface HudColorThresholds {
  highMinPercent: number;
  mediumMinPercent: number;
  highColor: string;
  mediumColor: string;
  lowColor: string;
  zeroColor: string;
  tempHpColor: string;
}

export interface HudSettings {
  showHealthBar: boolean;
  healthDisplayMode: HealthDisplayMode;
  position: HudPosition;
  barWidthScale: number;
  barHeight: number;
  offsetPx: number;
  showAcShield: boolean;
  showTempHp: boolean;
  showConditions: boolean;
  showNameTag: boolean;
  showConcentrationBadge: boolean;
  iconScale: number;
  opacity: number;
  zoomMinScale: number;
  segments: number;
  colorThresholds: HudColorThresholds;
}

export interface UiSettings {
  theme: "dark" | "light" | "auto";
  language: "pt-BR" | "en";
  density: "compact" | "comfortable";
  fontSize: "sm" | "md" | "lg";
  defaultSheetMode: "compact" | "full";
  tempHpRule: TempHpRuleMode;
  autoDuplicateResetHp: boolean;
  autoRecognizeMappedImages: boolean;
  confirmDelete: boolean;
}

export interface BestiarySettings {
  ui: UiSettings;
  hud: HudSettings;
}

export const DEFAULT_HUD_SETTINGS: HudSettings = {
  showHealthBar: true,
  healthDisplayMode: "bar-exact",
  position: "bottom",
  barWidthScale: 1,
  barHeight: 16,
  offsetPx: 4,
  showAcShield: true,
  showTempHp: true,
  showConditions: true,
  showNameTag: true,
  showConcentrationBadge: true,
  iconScale: 1,
  opacity: 0.92,
  zoomMinScale: 0.45,
  segments: 0,
  colorThresholds: {
    highMinPercent: 55,
    mediumMinPercent: 25,
    highColor: "#22c55e",
    mediumColor: "#eab308",
    lowColor: "#ef4444",
    zeroColor: "#6b7280",
    tempHpColor: "#38bdf8",
  },
};

export const DEFAULT_UI_SETTINGS: UiSettings = {
  theme: "dark",
  language: "pt-BR",
  density: "compact",
  fontSize: "md",
  defaultSheetMode: "compact",
  tempHpRule: "dnd5e-max",
  autoDuplicateResetHp: false,
  autoRecognizeMappedImages: true,
  confirmDelete: true,
};

export const DEFAULT_SETTINGS: BestiarySettings = {
  ui: DEFAULT_UI_SETTINGS,
  hud: DEFAULT_HUD_SETTINGS,
};
