"use client";

import Link from "next/link";
import { ChatMetadata, AiApiKeyMetadata } from "@ai-vault/types";

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chats: ChatMetadata[];
  activeChatId?: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  keys: AiApiKeyMetadata[];
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
}: ChatSidebarProps) {
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
        className={`fixed top-0 bottom-0 left-0 z-50 w-56 bg-[#0e0f12] border-r border-white/[0.06] flex flex-col transition-transform duration-150 md:translate-x-0 font-mono ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Top Action */}
        <div className="p-2.5 flex items-center gap-2 border-b border-white/[0.04]">
          <button
            type="button"
            onClick={onNewChat}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-neutral-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.12] rounded-lg transition-all cursor-pointer select-none"
          >
            <span>+</span>
            <span>new chat</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="md:hidden text-neutral-500 hover:text-white text-xs p-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer"
          >
            ✕
          </button>
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
                  className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                    isActive
                      ? "bg-white/[0.08] text-white font-medium"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
                  }`}
                >
                  <span className="truncate pr-2">{c.title || "untitled"}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChat(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 text-xs px-1 rounded transition-opacity cursor-pointer"
                    title="delete"
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Link */}
        <div className="p-3 border-t border-white/[0.04]">
          <Link
            href="/keys"
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <span>keys</span>
            <span className="text-[10px] text-neutral-500 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
              {keys.length}
            </span>
          </Link>
        </div>
      </aside>
    </>
  );
}