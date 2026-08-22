"use client";

import Link from "next/link";
import { ChatMetadata, AiApiKeyMetadata } from "@ai-vault/types";
import { Button, Badge } from "@/shared/components";
import { lockVaultAction } from "@/features/vault/actions/lock-vault.action";
import { BarChart2, Key, Settings } from "lucide-react";

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chats: ChatMetadata[];
  activeChatId?: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  keys: AiApiKeyMetadata[];
  telemetry?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalThoughtTokens: number;
    totalCost: number;
  };
}

export function ChatSidebar({
  isOpen,
  onClose,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  keys,
  telemetry,
}: ChatSidebarProps) {
  const hasTelemetry =
    activeChatId &&
    telemetry &&
    (telemetry.totalInputTokens > 0 || telemetry.totalOutputTokens > 0 || telemetry.totalCost > 0);

  const formatCost = (cost: number) => {
    if (cost === 0) return "$0.00";
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(3)}`;
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-56 bg-[#0e0f12] border-r border-white/[0.06] flex flex-col transition-transform duration-150 md:translate-x-0 font-mono ${isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        {/* Top Action */}
        <div className="p-2.5 flex items-center gap-2 border-b border-white/[0.04]">
          <Button
            variant="secondary"
            size="sm"
            onClick={onNewChat}
            className="flex-1 justify-center gap-1.5 py-1.5 text-xs text-neutral-300 hover:text-white"
          >
            <span>+</span>
            <span>new chat</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="md:hidden text-neutral-500 hover:text-white text-xs p-1.5 h-auto rounded-lg"
          >
            ✕
          </Button>
        </div>

        {/* Chats list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 select-none">
          {chats.length === 0 ? (
            <div className="p-3 text-[11px] text-neutral-600 text-center">
              no chats
            </div>
          ) : (
            chats.map((c) => {
              const isActive = c.id === activeChatId;
              return (
                <div
                  key={c.id}
                  onClick={() => onSelectChat(c.id)}
                  className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${isActive
                      ? "bg-white/[0.08] text-white font-medium"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
                    }`}
                >
                  <span className="truncate pr-2">{c.title || "untitled"}</span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChat(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 text-xs px-1 py-0 h-auto rounded transition-opacity"
                    title="delete"
                  >
                    ×
                  </Button>
                </div>
              );
            })
          )}
        </div>

        {/* Telemetry info for active chat */}
        {hasTelemetry && (
          <div className="p-3 border-t border-white/[0.04] space-y-1.5 text-[11px] text-neutral-500">
            <div className="text-[10px] text-neutral-600 uppercase tracking-wider">
              session usage
            </div>
            <div className="flex items-center justify-between text-neutral-400">
              <span>tokens in</span>
              <span className="text-neutral-300 font-mono">
                {telemetry.totalInputTokens.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-neutral-400">
              <span>tokens out</span>
              <span className="text-neutral-300 font-mono">
                {telemetry.totalOutputTokens.toLocaleString()}
              </span>
            </div>
            {telemetry.totalThoughtTokens > 0 && (
              <div className="flex items-center justify-between text-neutral-400">
                <span>thought</span>
                <span className="text-indigo-300 font-mono">
                  {telemetry.totalThoughtTokens.toLocaleString()}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-neutral-400 pt-1 border-t border-white/[0.03]">
              <span>total cost</span>
              <span className="text-emerald-400 font-mono font-medium">
                {formatCost(telemetry.totalCost)}
              </span>
            </div>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="p-3 border-t border-white/[0.04] space-y-1">
          <Link
            href="/analytics"
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-center gap-2">
              <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>analytics</span>
            </div>
            <span className="text-[10px] text-neutral-500 font-mono">stats</span>
          </Link>

          <Link
            href="/settings"
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-3.5 h-3.5 text-neutral-500" />
              <span>settings</span>
            </div>
          </Link>

          <Link
            href="/keys"
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Key className="w-3.5 h-3.5 text-neutral-500" />
              <span>keys</span>
            </div>
            <Badge variant="mono" className="text-[10px] px-1.5 py-0.5">
              {keys.length}
            </Badge>
          </Link>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => lockVaultAction()}
            className="w-full justify-between text-neutral-500 hover:text-red-400 font-normal px-2.5 py-1.5 h-auto rounded-lg"
            title="Lock vault immediately"
          >
            <span>lock vault</span>
            <span className="text-[10px] text-neutral-600 font-mono">1h auto</span>
          </Button>
        </div>
      </aside>
    </>
  );
}