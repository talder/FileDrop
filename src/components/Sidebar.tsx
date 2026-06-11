"use client";

import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Globe, FolderOpen, KeyRound, Settings, Wifi, Shield, BookOpen, Server, ArrowRightLeft } from "lucide-react";

const NAV_ITEMS = [
  { href: "/",              label: "Dashboard",      icon: LayoutDashboard },
  { href: "/endpoints",     label: "Endpoints",      icon: Globe },
  { href: "/destinations",  label: "Destinations",   icon: FolderOpen },
  { href: "/sftp-servers",  label: "SFTP Servers",   icon: Server },
  { href: "/transfers",     label: "Transfers",      icon: ArrowRightLeft },
  { href: "/api-keys",      label: "API Keys",       icon: KeyRound },
  { href: "/connections",   label: "Connections",    icon: Wifi },
  { href: "/audit-log",     label: "Audit Log",      icon: Shield },
  { href: "/documentation", label: "Docs",            icon: BookOpen },
  { href: "/settings",      label: "Settings",       icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="sidebar" style={{ width: 220 }}>
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`sidebar-item w-full ${isActive ? "active" : ""}`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="px-3 py-2 border-t border-border">
        <p className="text-[10px] text-text-muted">FileDrop v0.1.0</p>
      </div>
    </div>
  );
}
