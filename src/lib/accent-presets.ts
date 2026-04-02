export interface AccentPreset {
  label: string;
  swatch: string;
  light: [string, string, string, string];
  dark:  [string, string, string, string];
}

export const ACCENT_PRESETS: Record<string, AccentPreset> = {
  blue: {
    label: "Blue",
    swatch: "#3b82f6",
    light: ["#3b82f6", "#2563eb", "#eff6ff", "#1d4ed8"],
    dark:  ["#60a5fa", "#3b82f6", "#1e3a5f", "#93c5fd"],
  },
  indigo: {
    label: "Indigo",
    swatch: "#6366f1",
    light: ["#6366f1", "#4f46e5", "#eef2ff", "#3730a3"],
    dark:  ["#818cf8", "#6366f1", "#1e1b4b", "#a5b4fc"],
  },
  violet: {
    label: "Violet",
    swatch: "#8b5cf6",
    light: ["#8b5cf6", "#7c3aed", "#f5f3ff", "#5b21b6"],
    dark:  ["#a78bfa", "#8b5cf6", "#2e1065", "#c4b5fd"],
  },
  rose: {
    label: "Rose",
    swatch: "#f43f5e",
    light: ["#f43f5e", "#e11d48", "#fff1f2", "#9f1239"],
    dark:  ["#fb7185", "#f43f5e", "#4c0519", "#fda4af"],
  },
  orange: {
    label: "Orange",
    swatch: "#f97316",
    light: ["#f97316", "#ea580c", "#fff7ed", "#c2410c"],
    dark:  ["#fb923c", "#f97316", "#431407", "#fdba74"],
  },
  green: {
    label: "Green",
    swatch: "#22c55e",
    light: ["#22c55e", "#16a34a", "#f0fdf4", "#15803d"],
    dark:  ["#4ade80", "#22c55e", "#052e16", "#86efac"],
  },
  teal: {
    label: "Teal",
    swatch: "#14b8a6",
    light: ["#14b8a6", "#0d9488", "#f0fdfa", "#0f766e"],
    dark:  ["#2dd4bf", "#14b8a6", "#042f2e", "#5eead4"],
  },
};

const CSS_VARS = [
  "--color-accent",
  "--color-accent-hover",
  "--color-accent-light",
  "--color-accent-text",
] as const;

export function applyAccent(key: string, isDark: boolean): void {
  const el = document.documentElement;
  const preset = ACCENT_PRESETS[key];

  if (!preset) {
    CSS_VARS.forEach((v) => el.style.removeProperty(v));
    return;
  }

  const values = isDark ? preset.dark : preset.light;
  CSS_VARS.forEach((v, i) => el.style.setProperty(v, values[i]));
}
