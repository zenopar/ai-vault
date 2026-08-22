"use client";

import { useState, useTransition, useEffect, useRef } from "react";
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
import { ErrorAlert } from "@/shared/components";

interface ChatViewProps {
  initialChats: ChatMetadata[];
  initialKeys: AiApiKeyMetadata[];
  initialModels: AiModelMetadata[];
  initialChatId?: string | null;
  initialMessages?: ChatMessageDto[];
}

export function ChatView({
  initialChats,
  initialKeys,
  initialModels,
  initialChatId = null,
  initialMessages = [],
}: ChatViewProps) {
  const [chats, setChats] = useState<ChatMetadata[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatId);
  const [messages, setMessages] = useState<ChatMessageDto[]>(initialMessages);
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
  const [isPending, startTransition] = useTransition();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeChat = chats.find((c) => c.id === activeChatId) || null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  const handleSelectChat = (chatId: string) => {
    if (chatId === activeChatId) return;
    setError(null);
    setActiveChatId(chatId);
    startTransition(async () => {
      const res = await getChatMessagesAction(chatId);
      if (res.success && res.data) {
        setMessages(res.data.messages || []);
        if (res.data.chat) {
          setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, ...res.data?.chat } : c)));
        }
      } else {
        setError(res.error || "Failed to load chat.");
      }
    });
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setError(null);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const handleDeleteChat = (chatId: string) => {
    startTransition(async () => {
      const res = await deleteChatAction(chatId);
      if (res.success) {
        setChats((prev) => prev.filter((c) => c.id !== chatId));
        if (activeChatId === chatId) handleNewChat();
      } else {
        setError(res.error || "Failed to delete chat.");
      }
    });
  };

  const handleSendMessage = (messageText: string) => {
    const trimmed = messageText.trim();
    if (!trimmed || isPending) return;
    setError(null);

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

    startTransition(async () => {
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
      setMessages((prev) => [...prev.filter((m) => m.id !== tempUserMsg.id), userMessage, assistantMessage]);
    });
  };

  const totalInputTokens = messages.reduce((acc, m) => acc + (m.inputTokens || 0), 0);
  const totalOutputTokens = messages.reduce((acc, m) => acc + (m.outputTokens || 0), 0);
  const totalThoughtTokens = messages.reduce((acc, m) => acc + (m.thoughtTokens || 0), 0);
  const totalCost = messages.reduce((acc, m) => acc + (m.totalCost || 0), 0);

  const formatTotalCost = (cost: number) => {
    if (cost === 0) return "$0.00";
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(3)}`;
  };

  return (
    <div className="flex h-screen w-full bg-[#0e0f12] bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(120,119,198,0.08),transparent)] text-neutral-100 overflow-hidden relative">
      {/* Mobile sidebar toggle button */}
      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="fixed top-3 left-3 z-30 md:hidden p-2 rounded-xl bg-[#14151a]/90 backdrop-blur border border-white/[0.08] text-neutral-400 hover:text-white shadow-lg cursor-pointer transition-colors"
          title="Open sidebar"
        >
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Top right cumulative chat telemetry widget */}
      {messages.length > 0 && (totalInputTokens > 0 || totalOutputTokens > 0 || totalCost > 0) && (
        <div className="fixed top-3.5 right-4 z-20 flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#14151a]/85 backdrop-blur-md border border-white/[0.08] font-mono text-[11px] text-neutral-400 shadow-lg select-none animate-enter">
          <div className="flex items-center gap-1">
            <span className="text-neutral-500">in:</span>
            <span className="text-neutral-200">{totalInputTokens.toLocaleString()}</span>
          </div>
          <span className="text-white/10">·</span>
          <div className="flex items-center gap-1">
            <span className="text-neutral-500">out:</span>
            <span className="text-neutral-200">{totalOutputTokens.toLocaleString()}</span>
          </div>
          {totalThoughtTokens > 0 && (
            <>
              <span className="text-white/10">·</span>
              <div className="flex items-center gap-1">
                <span className="text-neutral-500">thought:</span>
                <span className="text-indigo-300">{totalThoughtTokens.toLocaleString()}</span>
              </div>
            </>
          )}
          <span className="text-white/10">·</span>
          <div className="flex items-center gap-1 text-emerald-400 font-medium">
            <span>{formatTotalCost(totalCost)}</span>
          </div>
        </div>
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
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden transition-[padding] duration-200 md:pl-56">

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-12 py-8">
          <div className="max-w-4xl mx-auto mb-6">
            <ErrorAlert message={error} onDismiss={() => setError(null)} />
          </div>

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
  );
}