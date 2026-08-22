import React, { forwardRef, SelectHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

export const selectVariants = cva(
  "w-full px-3.5 py-2.5 bg-[#181920] border border-white/[0.08] rounded-xl text-neutral-200 text-sm focus:outline-none focus:border-white/25 transition-colors cursor-pointer appearance-none disabled:opacity-40 disabled:cursor-not-allowed font-sans",
  {
    variants: {
      isMono: {
        true: "font-mono",
        false: "font-sans",
      },
    },
    defaultVariants: {
      isMono: false,
    },
  }
);

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size">,
    VariantProps<typeof selectVariants> {
  label?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, isMono, children, id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-[11px] font-mono text-neutral-400 select-none"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(selectVariants({ isMono, className }))}
            {...props}
          >
            {children}
          </select>
          <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 text-xs font-mono">
            ▼
          </div>
        </div>
      </div>
    );
  }
);

Select.displayName = "Select";

