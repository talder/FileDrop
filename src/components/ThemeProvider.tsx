"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { applyAccent } from "@/lib/accent-presets";

export type Theme =
  | "light" | "solarized-light" | "dracula-light" | "catppuccin-latte" | "blossom" | "lavender" | "paper" | "high-contrast"
  | "dark" | "dracula" | "nord" | "solarized-dark" | "github-dark" | "catppuccin" | "twilight" | "midnight-rose" | "high-contrast-dark";

const LIGHT_THEME_NAMES = new Set<string>([
  "light", "solarized-light", "dracula-light", "catppuccin-latte", "blossom", "lavender", "paper", "high-contrast",
]);

export const isLightTheme = (t: string): boolean => LIGHT_THEME_NAMES.has(t);

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  cycleTheme: () => void;
  accentColor: string;
  setAccentColor: (key: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  cycleTheme: () => {},
  accentColor: "default",
  setAccentColor: () => {},
});

const STORAGE_KEY = "filedrop-theme";
const ACCENT_STORAGE_KEY = "filedrop-accent";

export const THEMES: Theme[] = [
  "light", "solarized-light", "dracula-light", "catppuccin-latte", "blossom", "lavender", "paper", "high-contrast",
  "dark", "dracula", "nord", "solarized-dark", "github-dark", "catppuccin", "twilight", "midnight-rose", "high-contrast-dark",
];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [accentColor, setAccentColorState] = useState<string>("default");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (savedTheme && THEMES.includes(savedTheme)) {
      setThemeState(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    }
    const savedAccent = localStorage.getItem(ACCENT_STORAGE_KEY) || "default";
    setAccentColorState(savedAccent);
    applyAccent(savedAccent, !isLightTheme(savedTheme ?? "light"));
    setMounted(true);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    document.documentElement.setAttribute("data-theme", t);
    const currentAccent = localStorage.getItem(ACCENT_STORAGE_KEY) || "default";
    applyAccent(currentAccent, !isLightTheme(t));
  }, []);

  const setAccentColor = useCallback((key: string) => {
    setAccentColorState(key);
    localStorage.setItem(ACCENT_STORAGE_KEY, key);
    const currentTheme = localStorage.getItem(STORAGE_KEY) || "light";
    applyAccent(key, !isLightTheme(currentTheme));
  }, []);

  const cycleTheme = useCallback(() => {
    const idx = THEMES.indexOf(theme);
    setTheme(THEMES[(idx + 1) % THEMES.length]);
  }, [theme, setTheme]);

  if (!mounted) return null;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
