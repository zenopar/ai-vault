import React, { forwardRef, HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

export const cardVariants = cva("rounded-2xl transition-all", {
  variants: {
    variant: {
      glass: "bg-[#14151a]/90 backdrop-blur-xl border border-white/[0.08] shadow-2xl",
      subtle: "bg-white/[0.03] border border-white/[0.06]",
      elevated: "bg-[#181920] border border-white/[0.08] shadow-lg",
    },
  },
  defaultVariants: {
    variant: "glass",
  },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant, className }))}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

