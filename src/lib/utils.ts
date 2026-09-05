import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelative(iso: string, now = Date.now()): string {
  const delta = now - new Date(iso).getTime();
  const min = Math.round(delta / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}d`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
