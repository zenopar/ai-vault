"use client";

import { useRef, useEffect, useLayoutEffect, useState, KeyboardEvent } from "react";
import Link from "next/link";
import { AiApiKeyMetadata, AiModelMetadata } from "@ai-vault/types";
import { Button, DropdownSelect } from "@/shared/components";

interface ChatInputDeckProps {
  onSubmit: (message: string) => void;
  disabled: boolean;
  keys: AiApiKeyMetadata[];
  selectedKeyId: string;
  setSelectedKeyId: (id: string) => void;
  models: AiModelMetadata[];
  selectedModel: string;
  setSelectedModel: (modelName: string) => void;
  thinkingLevel: "none" | "low" | "medium" | "high";
  setThinkingLevel: (level: "none" | "low" | "medium" | "high") => void;
}

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function ChatInputDeck({
  onSubmit,
  disabled,
  keys,
  selectedKeyId,
  setSelectedKeyId,
  models,
  selectedModel,
  setSelectedModel,
  thinkingLevel,
  setThinkingLevel,
}: ChatInputDeckProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (typeof window !== "undefined" && window.CSS?.supports?.("field-sizing", "content")) {
      return;
    }
    el.style.height = "auto";
    const newHeight = Math.min(Math.max(el.scrollHeight, 52), 220);
    el.style.height = `${newHeight}px`;
  }, [input]);

  const triggerSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      triggerSubmit();
    }
  };

  const selectedKey = keys.find((k) => k.id === selectedKeyId) || keys[0];
  const availableModels = selectedKey
    ? models.filter((m) => m.provider.toLowerCase() === selectedKey.provider.toLowerCase())
    : models;

  const thinkingOpts: Array<{ id: "none" | "low" | "medium" | "high"; label: string }> = [
    { id: "none", label: "off" },
    { id: "low", label: "low" },
    { id: "medium", label: "med" },
    { id: "high", label: "high" },
  ];

  if (keys.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto px-5 pb-8 pt-2 text-center">
        <p className="text-xs text-neutral-600 font-mono">
          No API keys.{" "}
          <Link href="/keys" className="text-neutral-400 underline hover:text-white">
            Add one
          </Link>
        </p>
      </div>
    );
  }

  const keyOptions = keys.map((k) => ({
    value: k.id,
    label: k.name,
    badge: k.provider,
  }));

  const modelOptions = (
    availableModels.length > 0
      ? availableModels
      : [
          {
            id: selectedModel,
            name: selectedModel,
            displayName: selectedModel,
            provider: "google",
            isActive: true,
          } satisfies AiModelMetadata,
        ]
  ).map((m) => ({
    value: m.name,
    label: m.displayName || m.name,
    description: m.description || undefined,
  }));

  const handleKeyChange = (id: string) => {
    setSelectedKeyId(id);
    const k = keys.find((x) => x.id === id);
    if (k) {
      const m = models.find((x) => x.provider.toLowerCase() === k.provider.toLowerCase());
      if (m) setSelectedModel(m.name);
    }
  };

  return (
    <div className="w-full shrink-0 px-3 sm:px-8 md:px-12 pb-4 sm:pb-6 pt-2">
      <div className="max-w-4xl mx-auto relative">
        {/* Thinking glowing aura */}
        {disabled && (
          <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-indigo-500/20 via-sky-500/30 to-indigo-500/20 blur-md opacity-75 animate-pulse" />
        )}

        {/* Uniform Contour Ambient Glow on Focus */}
        <div
          className={`absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-indigo-500/20 via-sky-500/15 to-purple-500/20 blur-sm pointer-events-none transition-opacity duration-300 ${
            isFocused && !disabled ? "opacity-100" : "opacity-0"
          }`}
        />

        <div className="relative z-10 rounded-2xl border border-white/[0.09] bg-[#14151a]/95 backdrop-blur-xl focus-within:border-white/[0.18] shadow-2xl shadow-black/60 transition-[border-color,box-shadow] duration-200">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            placeholder="Send a message..."
            rows={1}
            autoComplete="off"
            className="chat-textarea w-full bg-transparent text-[14.5px] sm:text-[15px] text-neutral-100 placeholder:text-neutral-500/70 resize-none focus:outline-none leading-[1.6] py-3 px-3.5 sm:py-3.5 sm:px-4.5 font-sans antialiased max-h-[200px] overflow-y-auto block caret-indigo-400 selection:bg-indigo-500/25 selection:text-white"
            style={{
              minHeight: "48px",
              fieldSizing: "content",
            }}
          />

          {/* Bottom bar: selectors + send button */}
          <div className="px-3 sm:px-4 pb-2.5 sm:pb-3 pt-1.5 flex items-center justify-between gap-2 font-mono text-[11px] text-neutral-400 border-t border-white/[0.03]">
            {/* Left side: Selectors */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              {/* Key Selector */}
              {keys.length > 0 && (
                <div className="max-w-[130px] sm:max-w-none">
                  <DropdownSelect
                    options={keyOptions}
                    value={selectedKeyId}
                    onChange={handleKeyChange}
                    direction="up"
                  />
                </div>
              )}

              {/* Model Selector */}
              <div className="max-w-[140px] sm:max-w-none">
                <DropdownSelect
                  options={modelOptions}
                  value={selectedModel}
                  onChange={setSelectedModel}
                  direction="up"
                />
              </div>

              {/* Thinking Selector: Dropdown on mobile, inline pills on tablet/desktop */}
              <div className="block sm:hidden">
                <DropdownSelect
                  options={[
                    { value: "none", label: "think: off" },
                    { value: "low", label: "think: low" },
                    { value: "medium", label: "think: med" },
                    { value: "high", label: "think: high" },
                  ]}
                  value={thinkingLevel}
                  onChange={(val) => setThinkingLevel(val as "none" | "low" | "medium" | "high")}
                  direction="up"
                />
              </div>

              <div className="hidden sm:flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.05] p-0.5 rounded-lg shrink-0">
                {thinkingOpts.map((o) => (
                  <Button
                    key={o.id}
                    variant={thinkingLevel === o.id ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setThinkingLevel(o.id)}
                    className={`px-2 py-0.5 h-auto text-[11px] font-mono rounded-md ${
                      thinkingLevel === o.id
                        ? "text-white bg-white/[0.12] font-medium shadow-xs"
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Right side: Send button */}
            <div className="shrink-0 self-end sm:self-center">
              <Button
                type="button"
                size="sm"
                onClick={triggerSubmit}
                disabled={disabled || !input.trim()}
                className="px-3 py-1.5 sm:px-3.5 sm:py-1 font-mono text-xs shadow-none"
              >
                {disabled ? "..." : (
                  <span className="flex items-center gap-1">
                    <span>Send</span>
                    <span className="hidden sm:inline">↵</span>
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}