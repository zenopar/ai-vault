import React, { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center px-2 py-0.5 rounded-md transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-white/[0.06] border border-white/[0.08] text-neutral-300 text-[10px] font-mono uppercase tracking-wider",
        mono:
          "bg-white/[0.04] border border-white/[0.06] text-neutral-400 text-[11px] font-mono",
        model:
          "bg-white/[0.03] border border-white/[0.05] text-neutral-300 text-[11px] font-mono",
        success:
          "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-mono",
        warning:
          "bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-mono",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({
  className,
  variant,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    >
      {children}
    </span>
  );
}

