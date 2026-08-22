import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

export const errorAlertVariants = cva(
  "p-3 text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between shadow-xs transition-all",
  {
    variants: {
      variant: {
        default: "",
        subtle: "border-transparent bg-red-500/5",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface ErrorAlertProps extends VariantProps<typeof errorAlertVariants> {
  message?: string | null;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorAlert({
  message,
  onDismiss,
  variant,
  className,
}: ErrorAlertProps) {
  if (!message) return null;

  return (
    <div className={cn(errorAlertVariants({ variant, className }))}>
      <span className="truncate pr-2">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-red-400/70 hover:text-red-300 ml-2 cursor-pointer p-0.5"
          title="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

