"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon, LogOut, User, ChevronDown, Wifi, Shield } from "lucide-react";
import { useTheme, isLightTheme, THEMES, type Theme } from "@/components/ThemeProvider";
import type { SanitizedUser } from "@/lib/types";

interface ThemeOption { value: Theme; label: string; swatch: string; }

const LIGHT_THEMES_OPTIONS: ThemeOption[] = [
  { value: "light",            label: "Light",             swatch: "#ffffff" },
  { value: "solarized-light",  label: "Solarized Light",   swatch: "#fdf6e3" },
  { value: "dracula-light",    label: "Dracula Light",     swatch: "#f8f8f2" },
  { value: "catppuccin-latte", label: "Catppuccin Latte",  swatch: "#eff1f5" },
  { value: "blossom",          label: "Blossom",           swatch: "#ffcedd" },
  { value: "lavender",         label: "Lavender",          swatch: "#deccff" },
  { value: "paper",            label: "Paper",             swatch: "#f8f4ec" },
  { value: "high-contrast",    label: "High Contrast",     swatch: "#ffffff" },
];

const DARK_THEMES_OPTIONS: ThemeOption[] = [
  { value: "dark",               label: "Dark",              swatch: "#1a1a2e" },
  { value: "dracula",            label: "Dracula",           swatch: "#282a36" },
  { value: "nord",               label: "Nord",              swatch: "#2e3440" },
  { value: "solarized-dark",     label: "Solarized Dark",    swatch: "#002b36" },
  { value: "github-dark",        label: "GitHub Dark",       swatch: "#22272e" },
  { value: "catppuccin",         label: "Catppuccin",        swatch: "#1e1e2e" },
  { value: "twilight",           label: "Twilight",          swatch: "#1c0830" },
  { value: "midnight-rose",      label: "Midnight Rose",     swatch: "#1e0818" },
  { value: "high-contrast-dark", label: "HC Dark",           swatch: "#000000" },
];

const ALL_THEMES = [...LIGHT_THEMES_OPTIONS, ...DARK_THEMES_OPTIONS];

interface TopbarProps {
  user: SanitizedUser | null;
  onLogout: () => void;
}

export default function Topbar({ user, onLogout }: TopbarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const themeIcon = isLightTheme(theme) ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />;

  return (
    <header className="topbar">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/")} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className="text-lg font-bold text-text-primary">FileDrop</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Theme picker */}
        <div className="relative" ref={themeRef}>
          <button
            onClick={() => setThemeMenuOpen(!themeMenuOpen)}
            className="p-2 rounded-lg hover:bg-muted text-text-muted transition-colors"
            title="Change theme"
          >
            {themeIcon}
          </button>
          {themeMenuOpen && (
            <div className="dropdown-menu" style={{ right: 0, width: 320, maxHeight: 400, overflowY: "auto" }}>
              <div className="px-3 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wider">Light</div>
              <div className="theme-grid px-2 pb-2">
                {LIGHT_THEMES_OPTIONS.map((t) => (
                  <button key={t.value} className={`theme-swatch ${theme === t.value ? "active" : ""}`} onClick={() => { setTheme(t.value); setThemeMenuOpen(false); }}>
                    <span className="theme-swatch-dot" style={{ background: t.swatch }} />
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="dropdown-divider" />
              <div className="px-3 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wider">Dark</div>
              <div className="theme-grid px-2 pb-2">
                {DARK_THEMES_OPTIONS.map((t) => (
                  <button key={t.value} className={`theme-swatch ${theme === t.value ? "active" : ""}`} onClick={() => { setTheme(t.value); setThemeMenuOpen(false); }}>
                    <span className="theme-swatch-dot" style={{ background: t.swatch }} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <User className="w-4 h-4 text-text-muted" />
            <span className="text-sm font-medium text-text-secondary">{user?.fullName || user?.username || "User"}</span>
            <ChevronDown className="w-3 h-3 text-text-muted" />
          </button>
          {userMenuOpen && (
            <div className="dropdown-menu">
              <div className="px-3 py-2 text-xs text-text-muted">
                Signed in as <strong className="text-text-primary">{user?.username}</strong>
              </div>
              <div className="dropdown-divider" />
              <button className="dropdown-item" onClick={() => { setUserMenuOpen(false); router.push("/connections"); }}>
                <Wifi className="w-4 h-4" /> Connection Log
              </button>
              <button className="dropdown-item" onClick={() => { setUserMenuOpen(false); router.push("/audit-log"); }}>
                <Shield className="w-4 h-4" /> Audit Log
              </button>
              <div className="dropdown-divider" />
              <button className="dropdown-item text-red-500" onClick={() => { setUserMenuOpen(false); onLogout(); }}>
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
