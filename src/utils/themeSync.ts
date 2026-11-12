import OBR from "@owlbear-rodeo/sdk";
import type { UiSettings } from "@/domain/entities/settings";

export async function resolveDarkMode(themePref: UiSettings["theme"]): Promise<boolean> {
  if (themePref === "dark") return true;
  if (themePref === "light") return false;

  if (OBR.isAvailable && OBR.isReady) {
    try {
      const obrTheme = await OBR.theme.getTheme();
      return obrTheme.mode === "DARK";
    } catch {
      // continua para media query
    }
  }

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return true;
}

export function applyDomTheme(isDark: boolean, fontSize: UiSettings["fontSize"] = "md"): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  root.style.fontSize =
    fontSize === "sm" ? "13px" : fontSize === "lg" ? "16px" : "14px";
}
