import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm text-ink",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
