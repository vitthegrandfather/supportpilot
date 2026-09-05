import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Inbox,
  LayoutDashboard,
  LineChart,
  Menu,
  Settings,
  Waypoints,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/knowledge", label: "Knowledge base", icon: BookOpen },
  { to: "/analytics", label: "Analytics", icon: LineChart },
  { to: "/architecture", label: "Architecture", icon: Waypoints },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-dvh min-h-0 bg-paper">
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-navy text-surface">
        <Brand />
        <Nav pathname={pathname} onNavigate={() => setOpen(false)} />
        <DemoNotice />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            className="absolute inset-0 bg-ink/40"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-64 flex-col bg-navy text-surface">
            <div className="flex items-center justify-between px-4 py-4">
              <Brand compact />
              <button type="button" className="p-2" onClick={() => setOpen(false)} aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            <Nav pathname={pathname} onNavigate={() => setOpen(false)} />
            <DemoNotice />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-3 border-b border-line bg-surface px-3 md:hidden">
          <button type="button" className="p-2" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-medium">SupportPilot</span>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("px-4", compact ? "py-1" : "py-5")}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] bg-navy-soft">
          <svg viewBox="0 0 32 32" className="size-5" aria-hidden="true">
            <path d="M8 22L16 8L24 22H8Z" fill="none" stroke="#5EEAD4" strokeWidth="1.8" />
            <circle cx="16" cy="17" r="2" fill="#F5F6F8" />
          </svg>
        </span>
        <div>
          <div className="text-sm font-semibold tracking-tight">SupportPilot</div>
          <div className="text-[11px] text-surface/60">HelioDesk workspace</div>
        </div>
      </div>
    </div>
  );
}

function Nav({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
      {NAV.map((item) => {
        const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm transition-colors duration-150",
              active ? "bg-navy-soft text-surface" : "text-surface/70 hover:bg-navy-mid hover:text-surface",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function DemoNotice() {
  return (
    <div className="border-t border-white/10 px-4 py-4">
      <p className="text-[11px] leading-4 text-surface/55">
        Demo workspace. All customers, companies, tickets, and metrics are fictional. Replies are never sent to a real inbox.
      </p>
    </div>
  );
}
