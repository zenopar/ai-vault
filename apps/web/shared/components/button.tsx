import React, { forwardRef, ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-all cursor-pointer select-none focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary:
          "bg-white text-black hover:bg-neutral-200 focus:ring-2 focus:ring-white/20 shadow-md font-sans",
        secondary:
          "bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-neutral-200 shadow-xs font-mono",
        ghost:
          "text-neutral-400 hover:text-white hover:bg-white/[0.05] font-mono",
        danger:
          "text-neutral-500 hover:text-red-400 hover:bg-red-500/10 font-mono",
      },
      size: {
        sm: "px-2.5 py-1 text-xs rounded-lg",
        md: "px-4 py-2.5 text-sm rounded-xl",
        lg: "px-5 py-3 text-sm rounded-xl w-full",
        icon: "p-2 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant,
      size,
      isLoading = false,
      disabled,
      type = "button",
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-1.5 font-mono text-xs">
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>Loading...</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

