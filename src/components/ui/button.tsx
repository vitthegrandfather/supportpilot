import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal",
  {
    variants: {
      variant: {
        primary: "bg-teal text-surface hover:bg-teal-hover",
        secondary: "bg-surface text-ink border border-line hover:bg-paper-2",
        ghost: "text-ink-muted hover:bg-paper-2 hover:text-ink",
        danger: "bg-danger text-surface hover:opacity-90",
        navy: "bg-navy text-surface hover:bg-navy-mid",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-[var(--radius-sm)]",
        md: "h-9 px-3.5 text-sm rounded-[var(--radius-sm)]",
        lg: "h-11 px-4 text-sm rounded-[var(--radius-md)]",
        icon: "size-9 rounded-[var(--radius-sm)]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
