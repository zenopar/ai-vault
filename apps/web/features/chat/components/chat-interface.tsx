"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChatMetadata, ChatMessageDto, AiApiKeyMetadata } from "@ai-vault/types";
import {
  sendMessageAction,
  getChatMessagesAction,
  deleteChatAction,
} from "../actions/chat.actions";

interface ChatInterfaceProps {
  initialChats: ChatMetadata[];
  initialKeys: AiApiKeyMetadata[];
}

export function ChatInterface({ initialChats, initialKeys }: ChatInterfaceProps) {
  const [chats, setChats] = useState<ChatMetadata[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(
    initialChats.length > 0 ? initialChats[0].id : null
  );
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected Key & Model state
  const [selectedKeyId, setSelectedKeyId] = useState<string>(
    initialKeys.length > 0 ? initialKeys[0].id : ""
  );

  const selectedKey = initialKeys.find((k) => k.id === selectedKeyId) || initialKeys[0];

  const availableModels = selectedKey?.models && selectedKey.models.length > 0
    ? selectedKey.models
    : [];

  const [selectedModelName, setSelectedModelName] = useState<string>(() => {
    if (initialKeys[0]?.models && initialKeys[0].models.length > 0) {
      return initialKeys[0].models[0].name;
    }
    return "";
  });

  const handleKeyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const keyId = e.target.value;
    setSelectedKeyId(keyId);
    const key = initialKeys.find((k) => k.id === keyId);
    if (key?.models && key.models.length > 0) {
      setSelectedModelName(key.models[0].name);
    } else {
      setSelectedModelName("");
    }
  };

  // Load chat messages on select
  const handleSelectChat = async (chatId: string) => {
    setActiveChatId(chatId);
    setError(null);
    setIsLoadingMessages(true);

    try {
      const res = await getChatMessagesAction(chatId);
      if (res.success && res.data) {
        setMessages(res.data.messages);
      } else {
        setError(res.error || "Failed to load messages.");
        setMessages([]);
      }
    } catch {
      setError("Failed to load messages.");
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setError(null);
    setInputMessage("");
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!window.confirm("Delete this conversation?")) return;

    try {
      const res = await deleteChatAction(chatId);
      if (res.success) {
        setChats((prev) => prev.filter((c) => c.id !== chatId));
        if (activeChatId === chatId) {
          const remaining = chats.filter((c) => c.id !== chatId);
          if (remaining.length > 0) {
            handleSelectChat(remaining[0].id);
          } else {
            handleNewChat();
          }
        }
      } else {
        setError(res.error || "Failed to delete chat.");
      }
    } catch {
      setError("Failed to delete chat.");
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputMessage.trim();
    if (!text || isSending) return;

    setError(null);
    setInputMessage("");

    const tempMsg: ChatMessageDto = {
      id: `temp-${Date.now()}`,
      chatId: activeChatId || "new",
      role: "user",
      content: text,
      sequenceNumber: messages.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMsg]);
    setIsSending(true);

    try {
      const formData = new FormData();
      if (activeChatId) formData.append("chatId", activeChatId);
      formData.append("message", text);
      if (selectedKey?.provider) formData.append("provider", selectedKey.provider);
      if (selectedModelName) formData.append("model", selectedModelName);

      const res = await sendMessageAction(formData);

      if (res.success && res.data) {
        const { chat, userMessage, assistantMessage } = res.data;

        setActiveChatId(chat.id);
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempMsg.id),
          userMessage,
          assistantMessage,
        ]);

        // Add or update chat in sidebar list
        setChats((prev) => {
          const exists = prev.some((c) => c.id === chat.id);
          if (exists) {
            return prev.map((c) => (c.id === chat.id ? chat : c));
          }
          return [chat, ...prev];
        });
      } else {
        setError(res.error || "Failed to send message.");
        setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
        setInputMessage(text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setInputMessage(text);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-lg shadow-md border border-gray-100 p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">AI Chat</h2>
            <p className="text-gray-500 text-sm">
              All messages are encrypted at rest with AES-256-GCM.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/keys"
              className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-colors"
            >
              API Keys ({initialKeys.length})
            </Link>
          </div>
        </div>

        {/* Key and Model Selector */}
        {initialKeys.length > 0 ? (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <label className="font-medium text-gray-700">API Key:</label>
              <select
                value={selectedKeyId}
                onChange={handleKeyChange}
                className="px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black bg-white text-gray-800 font-medium"
              >
                {initialKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.provider.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {availableModels.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="font-medium text-gray-700">Model:</label>
                <select
                  value={selectedModelName}
                  onChange={(e) => setSelectedModelName(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black bg-white text-gray-800 font-medium"
                >
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-amber-700 bg-amber-50 p-2.5 rounded-md">
            <span>No active AI API keys configured.</span>
            <Link href="/keys" className="font-semibold underline">
              Add Key →
            </Link>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md flex justify-between items-center">
            <span>{error}</span>
            {error.includes("API key") && (
              <Link href="/keys" className="font-semibold underline ml-2">
                Configure Keys
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Main Content Layout: Sidebar + Chat Thread */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Chat History List */}
        <div className="bg-white rounded-lg shadow-md border border-gray-100 p-6 flex flex-col h-[520px]">
          <button
            onClick={handleNewChat}
            className="w-full px-4 py-2 mb-4 text-white bg-black rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black font-medium text-sm transition-colors cursor-pointer"
          >
            + New Chat
          </button>

          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Conversations
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {chats.length === 0 ? (
              <p className="text-gray-400 text-xs py-4 text-center">No saved chats yet.</p>
            ) : (
              chats.map((c) => {
                const isActive = c.id === activeChatId;
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectChat(c.id)}
                    className={`p-2.5 rounded-md text-xs cursor-pointer flex items-center justify-between group transition-colors ${
                      isActive
                        ? "bg-gray-100 text-gray-900 font-semibold border border-gray-200"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <span className="truncate flex-1 mr-2">{c.title || "Untitled Chat"}</span>
                    <button
                      onClick={(e) => handleDeleteChat(e, c.id)}
                      className="text-gray-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete chat"
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Chat Thread & Input */}
        <div className="md:col-span-2 bg-white rounded-lg shadow-md border border-gray-100 p-6 flex flex-col h-[520px]">
          {/* Chat Header with Totals */}
          {activeChatId && (
            <div className="mb-3 pb-3 border-b border-gray-100 flex justify-between items-center text-xs text-gray-500">
              <span className="font-semibold text-gray-700 truncate mr-4">
                {chats.find((c) => c.id === activeChatId)?.title || "Untitled Chat"}
              </span>
              <div className="font-mono flex items-center gap-3 whitespace-nowrap bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-lg shadow-sm">
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Input</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-700 font-bold">{chats.find((c) => c.id === activeChatId)?.inputTokens ?? 0}</span>
                    {chats.find((c) => c.id === activeChatId)?.inputCost !== undefined && (
                      <span className="text-emerald-600 text-xs font-medium">(${chats.find((c) => c.id === activeChatId)?.inputCost?.toFixed(6)})</span>
                    )}
                  </div>
                </div>
                <div className="w-px h-6 bg-gray-200"></div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Output</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-700 font-bold">{chats.find((c) => c.id === activeChatId)?.outputTokens ?? 0}</span>
                    {chats.find((c) => c.id === activeChatId)?.outputCost !== undefined && (
                      <span className="text-emerald-600 text-xs font-medium">(${chats.find((c) => c.id === activeChatId)?.outputCost?.toFixed(6)})</span>
                    )}
                  </div>
                </div>
                {chats.find((c) => c.id === activeChatId)?.totalCost !== undefined && (
                  <>
                    <div className="w-px h-6 bg-gray-200"></div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Total Cost</span>
                      <span className="text-emerald-600 font-bold flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        ${chats.find((c) => c.id === activeChatId)?.totalCost?.toFixed(6)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto space-y-4 p-2">
            {isLoadingMessages ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-xs">
                Loading messages...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                <p className="text-sm">No messages in this conversation yet.</p>
                <p className="text-xs text-gray-400 mt-1">Type a prompt below to get started.</p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={m.id || i}
                  className={`p-4 rounded-lg text-sm max-w-[85%] ${
                    m.role === "user"
                      ? "bg-black text-white ml-auto"
                      : "bg-gray-50 border border-gray-200 text-gray-900 mr-auto"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div
                      className={`text-xs font-semibold ${
                        m.role === "user" ? "text-gray-300" : "text-gray-600"
                      }`}
                    >
                      {m.role === "user" ? "You" : "AI"}
                    </div>

                    {(m.inputTokens !== undefined || m.outputTokens !== undefined || m.cost !== undefined) && (
                      <div className="text-[10px] text-gray-400 font-mono flex items-center gap-2">
                        {m.inputTokens !== undefined && <span>in: <strong className="text-gray-600 font-bold">{m.inputTokens}</strong></span>}
                        {m.inputTokens !== undefined && m.outputTokens !== undefined && <span>•</span>}
                        {m.outputTokens !== undefined && <span>out: <strong className="text-gray-600 font-bold">{m.outputTokens}</strong></span>}
                        {m.cost !== undefined && (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-bold ml-1 flex items-center gap-1 shadow-sm transition-transform hover:scale-105">
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            ${m.cost.toFixed(6)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                </div>
              ))
            )}

            {isSending && (
              <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 mr-auto text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-black animate-pulse"></span>
                Generating & encrypting response...
              </div>
            )}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSend} className="pt-4 mt-2 border-t border-gray-100 flex gap-2">
            <input
              type="text"
              required
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your message..."
              disabled={isSending}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black text-sm"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isSending}
              className="px-5 py-2 text-white bg-black rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium text-sm cursor-pointer"
            >
              {isSending ? "Sending..." : "Send"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
