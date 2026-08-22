import React, { forwardRef, InputHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

export const inputVariants = cva(
  "w-full px-3.5 py-2.5 bg-[#181920] border border-white/[0.08] rounded-xl text-neutral-100 placeholder:text-neutral-600 text-sm focus:outline-none focus:border-white/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
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

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, isMono, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[11px] font-mono text-neutral-400 select-none"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(inputVariants({ isMono, className }))}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = "Input";

