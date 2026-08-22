"use client";

import React, { useState, useRef, useEffect } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

export const dropdownTriggerVariants = cva(
  "inline-flex items-center justify-between gap-1.5 text-xs font-mono transition-all cursor-pointer select-none focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        pill: "bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-200 px-2.5 py-1 rounded-lg focus:border-white/25",
        input:
          "w-full px-3.5 py-2.5 bg-[#181920] border border-white/[0.08] rounded-xl text-neutral-200 text-sm focus:border-white/25",
      },
    },
    defaultVariants: {
      variant: "pill",
    },
  }
);

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
}

export interface DropdownSelectProps extends VariantProps<typeof dropdownTriggerVariants> {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  direction?: "up" | "down";
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function DropdownSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  direction = "up",
  label,
  variant = "pill",
  className,
  disabled = false,
}: DropdownSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const positionClasses =
    direction === "up"
      ? "bottom-full mb-2 origin-bottom"
      : "top-full mt-2 origin-top";

  return (
    <div className="relative inline-block" ref={containerRef}>
      {label && (
        <label className="block text-[11px] font-mono text-neutral-400 select-none mb-1.5">
          {label}
        </label>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(dropdownTriggerVariants({ variant, className }), "max-w-full text-[10.5px] sm:text-xs px-2 sm:px-2.5 py-1")}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate max-w-[90px] xs:max-w-[130px] sm:max-w-[200px]">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={cn(
            "w-3 h-3 text-neutral-400 transition-transform duration-150 shrink-0",
            isOpen && "rotate-180"
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="listbox"
          className={cn(
            "absolute left-0 z-50 min-w-[200px] max-w-[280px] max-h-60 overflow-y-auto p-1.5 rounded-xl bg-[#14151a]/95 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/80 animate-enter space-y-0.5",
            positionClasses
          )}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs font-mono text-neutral-500 text-center">
              No options
            </div>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    "flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-mono cursor-pointer transition-all select-none",
                    isSelected
                      ? "bg-white/[0.1] text-white font-medium"
                      : "text-neutral-300 hover:text-white hover:bg-white/[0.06]"
                  )}
                >
                  <div className="flex flex-col min-w-0 pr-1">
                    <span className="truncate">{option.label}</span>
                    {option.description && (
                      <span className="text-[10px] text-neutral-500 truncate">
                        {option.description}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {option.badge && (
                      <span className="text-[10px] text-neutral-400 bg-white/[0.05] px-1.5 py-0.5 rounded">
                        {option.badge}
                      </span>
                    )}
                    {isSelected && (
                      <span className="text-emerald-400 text-xs font-bold">✓</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
