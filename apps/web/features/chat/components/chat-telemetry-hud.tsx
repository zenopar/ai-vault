"use client";

import Link from "next/link";
import { ChatMetadata } from "@ai-vault/types";

interface ChatTelemetryHudProps {
  chat?: ChatMetadata | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeModelName?: string;
  isThinking?: boolean;
}

export function ChatTelemetryHud({
  chat,
  onToggleSidebar,
}: ChatTelemetryHudProps) {
  const inputTokens = chat?.inputTokens ?? 0;
  const outputTokens = chat?.outputTokens ?? 0;
  const thoughtTokens = chat?.thoughtTokens ?? 0;
  const totalCost = chat?.totalCost ?? 0;

  const formatCost = (cost: number) => {
    if (cost === 0) return "$0.00";
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const hasStats = inputTokens > 0 || outputTokens > 0;

  return (
    <header className="w-full px-5 py-3 flex items-center justify-between text-[11px] font-mono text-neutral-400 bg-[#0e0f12]/40 backdrop-blur-md border-b border-white/[0.04] select-none z-10">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-all cursor-pointer"
          title="Toggle sidebar"
        >
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <span className="text-neutral-200 text-xs font-sans font-medium truncate max-w-xs sm:max-w-md">
          {chat?.title || "New Chat"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {hasStats && (
          <span className="text-neutral-500 hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.05]">
            <span>{inputTokens.toLocaleString()} in</span>
            <span>·</span>
            <span>{outputTokens.toLocaleString()} out</span>
            {thoughtTokens > 0 && (
              <>
                <span>·</span>
                <span>{thoughtTokens.toLocaleString()} thought</span>
              </>
            )}
            <span>·</span>
            <span className="text-neutral-300 font-medium">{formatCost(totalCost)}</span>
          </span>
        )}

        <Link
          href="/keys"
          className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white border border-white/[0.06] transition-all"
        >
          keys
        </Link>
      </div>
    </header>
  );
}

