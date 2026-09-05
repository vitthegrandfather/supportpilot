import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  neutral: "bg-paper-2 text-ink-muted",
  teal: "bg-teal-soft text-teal-ink",
  amber: "bg-amber-soft text-amber",
  red: "bg-danger-soft text-danger",
  green: "bg-ok-soft text-ok",
  navy: "bg-navy text-surface",
  blue: "bg-info-soft text-info",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
