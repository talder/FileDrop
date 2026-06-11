"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon, LogOut, User, ChevronDown, Wifi, Shield, BookOpen, Search, FolderOpen } from "lucide-react";
import { useTheme, isLightTheme, type Theme } from "@/components/ThemeProvider";
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

interface SearchItem {
  label: string;
  href: string;
  keywords: string[];
}

const SEARCH_ITEMS: SearchItem[] = [
  { label: "Dashboard", href: "/", keywords: ["home", "stats", "activity"] },
  { label: "Endpoints", href: "/endpoints", keywords: ["drop", "http", "slug", "upload"] },
  { label: "Destinations", href: "/destinations", keywords: ["storage", "path", "data", "mount"] },
  { label: "SFTP Servers", href: "/sftp-servers", keywords: ["ssh", "sftp", "connection", "remote"] },
  { label: "Transfers", href: "/transfers", keywords: ["pull", "push", "schedule"] },
  { label: "SOAP Endpoints", href: "/soap-connections", keywords: ["soap", "xml", "api"] },
  { label: "FTP Servers", href: "/ftp-connections", keywords: ["ftp", "ftps"] },
  { label: "Integrations", href: "/integrations", keywords: ["pipeline", "soap", "delivery"] },
  { label: "API Keys", href: "/api-keys", keywords: ["key", "token", "auth"] },
  { label: "Connection Log", href: "/connections", keywords: ["log", "requests", "ip"] },
  { label: "Audit Log", href: "/audit-log", keywords: ["audit", "security", "events"] },
  { label: "Settings", href: "/settings", keywords: ["config", "users", "smtp", "logging"] },
  { label: "Documentation", href: "/documentation", keywords: ["docs", "guide", "help"] },
  { label: "Docs — File naming tags", href: "/documentation#file-naming", keywords: ["doc-it", "tags", "token", "mask", "filename"] },
];

interface TopbarProps {
  user: SanitizedUser | null;
  onLogout: () => void;
}

export default function Topbar({ user, onLogout }: TopbarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return SEARCH_ITEMS.slice(0, 8);
    return SEARCH_ITEMS.filter((item) => {
      if (item.label.toLowerCase().includes(query)) return true;
      return item.keywords.some((kw) => kw.includes(query));
    }).slice(0, 8);
  }, [searchQuery]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const navigateFromSearch = (href: string) => {
    setSearchMenuOpen(false);
    setSearchQuery("");
    router.push(href);
  };

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

      <div className="flex-1 px-4">
        <div className="relative mx-auto max-w-md" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            className="input h-9 pl-9"
            placeholder="Search pages…"
            value={searchQuery}
            onFocus={() => setSearchMenuOpen(true)}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchMenuOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchResults.length > 0) {
                e.preventDefault();
                navigateFromSearch(searchResults[0].href);
              }
              if (e.key === "Escape") setSearchMenuOpen(false);
            }}
          />
          {searchMenuOpen && (
            <div className="dropdown-menu" style={{ left: 0, right: "auto", top: "calc(100% + 6px)", width: "100%" }}>
              {searchResults.length === 0 ? (
                <div className="px-3 py-2 text-xs text-text-muted">No matches</div>
              ) : (
                searchResults.map((item) => (
                  <button
                    key={`${item.href}-${item.label}`}
                    className="dropdown-item"
                    onClick={() => navigateFromSearch(item.href)}
                  >
                    <Search className="w-3.5 h-3.5" /> {item.label}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="btn btn-secondary btn-sm" onClick={() => router.push("/destinations?openDataBrowser=1")}>
          <FolderOpen className="w-4 h-4" /> Browse /DATA
        </button>

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
              <button className="dropdown-item" onClick={() => { setUserMenuOpen(false); router.push("/documentation"); }}>
                <BookOpen className="w-4 h-4" /> Documentation
              </button>
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
