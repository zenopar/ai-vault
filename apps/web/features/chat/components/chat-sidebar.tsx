"use client";

import Link from "next/link";
import { ChatMetadata, AiApiKeyMetadata } from "@ai-vault/types";
import { Button, Badge } from "@/shared/components";

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
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-60 bg-[#090a0d] border-r border-white/[0.06] flex flex-col transition-transform duration-200 md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-3.5 flex items-center justify-between border-b border-white/[0.04]">
          <Button
            variant="secondary"
            size="sm"
            onClick={onNewChat}
            className="gap-1.5"
          >
            <span>+</span>
            <span>new chat</span>
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="md:hidden text-neutral-500 hover:text-white text-xs p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {chats.map((c) => (
            <div
              key={c.id}
              onClick={() => onSelectChat(c.id)}
              className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-all ${
                c.id === activeChatId
                  ? "bg-white/[0.08] border border-white/[0.08] text-white shadow-xs"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03] border border-transparent"
              }`}
            >
              <span className="truncate pr-2">{c.title || "untitled"}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(c.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 text-sm leading-none p-0.5 rounded transition-colors cursor-pointer"
                title="Delete chat"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-white/[0.04]">
          <Link
            href="/keys"
            className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-mono text-neutral-400 hover:text-white hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <span>keys</span>
            </div>
            <Badge variant="mono" className="text-[10px] px-1.5 py-0.5">
              {keys.length}
            </Badge>
          </Link>
        </div>
      </aside>
    </>
  );
}