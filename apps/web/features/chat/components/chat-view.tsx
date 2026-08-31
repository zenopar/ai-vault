"use client";

import { useState, useEffect, useRef } from "react";
import {
  ChatMetadata,
  ChatMessageDto,
  AiApiKeyMetadata,
  AiModelMetadata,
} from "@ai-vault/types";
import {
  sendMessageAction,
  getChatMessagesAction,
  deleteChatAction,
} from "../actions/chat.actions";
import { ChatSidebar } from "./chat-sidebar";
import { ChatMessageItem } from "./chat-message-item";
import { ThinkingAura } from "./thinking-aura";
import { ChatInputDeck } from "./chat-input-deck";
import { ErrorAlert, Button } from "@/shared/components";
import { AutoLockGuard } from "@/features/vault/components/auto-lock-guard";

interface ChatViewProps {
  initialChats: ChatMetadata[];
  initialKeys: AiApiKeyMetadata[];
  initialModels: AiModelMetadata[];
  initialChatId?: string | null;
  initialMessages?: ChatMessageDto[];
  initialHasMore?: boolean;
  initialTotal?: number;
}

export function ChatView({
  initialChats,
  initialKeys,
  initialModels,
  initialChatId = null,
  initialMessages = [],
  initialHasMore = false,
}: ChatViewProps) {
  const [chats, setChats] = useState<ChatMetadata[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatId);
  const [messages, setMessages] = useState<ChatMessageDto[]>(initialMessages);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [keys] = useState<AiApiKeyMetadata[]>(initialKeys);
  const [models] = useState<AiModelMetadata[]>(initialModels);

  const defaultKey = keys[0];
  const [selectedKeyId, setSelectedKeyId] = useState<string>(defaultKey?.id || "");

  const getInitialModel = () => {
    if (defaultKey) {
      const match = models.find(
        (m) => m.provider.toLowerCase() === defaultKey.provider.toLowerCase()
      );
      if (match) return match.name;
    }
    return models[0]?.name || "gemini-3.7-flash";
  };

  const [selectedModel, setSelectedModel] = useState<string>(getInitialModel());
  const [thinkingLevel, setThinkingLevel] = useState<"none" | "low" | "medium" | "high">("medium");
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollToBottomRef = useRef<boolean>(true);

  useEffect(() => {
    if (shouldAutoScrollToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isPending]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    shouldAutoScrollToBottomRef.current = isNearBottom;

    if (container.scrollTop < 40 && hasMore && !isLoadingMore && activeChatId) {
      handleLoadMore();
    }
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore || !activeChatId) return;

    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;
    const prevScrollTop = container?.scrollTop || 0;

    shouldAutoScrollToBottomRef.current = false;
    setIsLoadingMore(true);
    setError(null);

    try {
      const res = await getChatMessagesAction(activeChatId, 30, messages.length, "desc");
      if (res.success && res.data) {
        const olderMessages = (res.data.messages || []).slice().reverse();
        setMessages((prev) => [...olderMessages, ...prev]);
        setHasMore(Boolean(res.data.hasMore));

        // Preserve viewport position after prepending older messages
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
          }
        });
      } else {
        setError(res.error || "Failed to load earlier messages.");
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSelectChat = async (chatId: string) => {
    if (chatId === activeChatId) return;
    setError(null);
    setActiveChatId(chatId);
    shouldAutoScrollToBottomRef.current = true;
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/app?c=${chatId}`);
    }
    setIsPending(true);
    try {
      const res = await getChatMessagesAction(chatId, 30, 0, "desc");
      if (res.success && res.data) {
        const reversed = (res.data.messages || []).slice().reverse();
        setMessages(reversed);
        setHasMore(Boolean(res.data.hasMore));
        if (res.data.chat) {
          setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, ...res.data?.chat } : c)));
        }
      } else {
        setError(res.error || "Failed to load chat.");
      }
    } finally {
      setIsPending(false);
    }
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setHasMore(false);
    setError(null);
    shouldAutoScrollToBottomRef.current = true;
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/app");
    }
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const handleDeleteChat = async (chatId: string) => {
    setIsPending(true);
    try {
      const res = await deleteChatAction(chatId);
      if (res.success) {
        setChats((prev) => prev.filter((c) => c.id !== chatId));
        if (activeChatId === chatId) {
          handleNewChat();
        }
      } else {
        setError(res.error || "Failed to delete chat.");
      }
    } finally {
      setIsPending(false);
    }
  };

  const handleSendMessage = async (messageText: string) => {
    const trimmed = messageText.trim();
    if (!trimmed || isPending) return;
    setError(null);
    shouldAutoScrollToBottomRef.current = true;

    const activeKey = keys.find((k) => k.id === selectedKeyId) || keys[0];
    const provider = activeKey?.provider || "google";

    const tempUserMsg: ChatMessageDto = {
      id: `temp-${Date.now()}`,
      chatId: activeChatId || "pending",
      role: "user",
      content: trimmed,
      sequenceNumber: messages.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);

    const formData = new FormData();
    if (activeChatId) formData.append("chatId", activeChatId);
    formData.append("message", trimmed);
    formData.append("provider", provider);
    formData.append("model", selectedModel);
    formData.append("thinkingLevel", thinkingLevel);

    setIsPending(true);
    try {
      const res = await sendMessageAction(formData);
      if (!res.success || !res.data) {
        setError(res.error || "Failed to process message.");
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        return;
      }

      const { chat, userMessage, assistantMessage } = res.data;

      setChats((prev) => {
        const exists = prev.some((c) => c.id === chat.id);
        return exists
          ? prev.map((c) => (c.id === chat.id ? { ...c, ...chat } : c))
          : [chat, ...prev];
      });

      setActiveChatId(chat.id);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `/app?c=${chat.id}`);
      }
      setMessages((prev) => [...prev.filter((m) => m.id !== tempUserMsg.id), userMessage, assistantMessage]);
    } finally {
      setIsPending(false);
    }
  };

  const totalInputTokens = messages.reduce((acc, m) => acc + (m.inputTokens || 0), 0);
  const totalOutputTokens = messages.reduce((acc, m) => acc + (m.outputTokens || 0), 0);
  const totalThoughtTokens = messages.reduce((acc, m) => acc + (m.thoughtTokens || 0), 0);
  const totalCost = messages.reduce((acc, m) => acc + (m.totalCost || 0), 0);

  return (
    <AutoLockGuard>
      <div className="flex h-screen w-full bg-[#0e0f12] bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(120,119,198,0.08),transparent)] text-neutral-100 overflow-hidden relative">
        {/* Mobile sidebar toggle button */}
        {!sidebarOpen && (
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="fixed top-3 left-3 z-30 md:hidden bg-[#14151a]/80 backdrop-blur-md border-white/[0.08] text-neutral-400 hover:text-white shadow-md p-2 rounded-lg"
            title="Open sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </Button>
        )}

        <ChatSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          keys={keys}
          telemetry={{
            totalInputTokens,
            totalOutputTokens,
            totalThoughtTokens,
            totalCost,
          }}
        />

        <main className="flex-1 flex flex-col h-full overflow-hidden transition-[padding] duration-200 md:pl-56">

          {/* Messages */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-12 py-8"
          >
            <div className="max-w-4xl mx-auto mb-6">
              <ErrorAlert message={error} onDismiss={() => setError(null)} />
            </div>

            {hasMore && (
              <div className="flex justify-center mb-6">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="group inline-flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15] rounded-full transition-all duration-200 backdrop-blur-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isLoadingMore ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Načítání starších zpráv...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 text-neutral-400 group-hover:-translate-y-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      <span>Načíst předchozí zprávy</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {!hasMore && messages.length > 10 && (
              <div className="flex items-center justify-center gap-2 my-6 text-[11px] font-mono tracking-wider text-neutral-500 uppercase">
                <span className="w-8 h-px bg-white/[0.06]" />
                <span>Začátek konverzace</span>
                <span className="w-8 h-px bg-white/[0.06]" />
              </div>
            )}

            {messages.length > 0 && (
              <div className="max-w-4xl mx-auto">
                {messages.map((m) => (
                  <ChatMessageItem key={m.id} message={m} />
                ))}
                {isPending && <ThinkingAura modelName={selectedModel} thinkingLevel={thinkingLevel} />}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <ChatInputDeck
            key={activeChatId || "new-chat"}
            onSubmit={handleSendMessage}
            disabled={isPending}
            keys={keys}
            selectedKeyId={selectedKeyId}
            setSelectedKeyId={setSelectedKeyId}
            models={models}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            thinkingLevel={thinkingLevel}
            setThinkingLevel={setThinkingLevel}
          />
        </main>
      </div>
    </AutoLockGuard>
  );
}