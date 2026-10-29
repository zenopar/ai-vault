"use client";

import { useState, useEffect, useRef } from "react";
import {
  ChatMetadata,
  ChatMessageDto,
  ChatAttachmentDto,
  AiApiKeyMetadata,
  AiModelMetadata,
  ProjectDto,
} from "@ai-vault/types";
import {
  sendMessageAction,
  getChatMessagesAction,
  deleteChatAction,
  createProjectAction,
  updateProjectAction,
  deleteProjectAction,
} from "../actions/chat.actions";
import { ChatSidebar } from "./chat-sidebar";
import { ProjectModal } from "./project-modal";
import { ChatMessageItem } from "./chat-message-item";
import { ThinkingAura } from "./thinking-aura";
import { ChatInputDeck, type ChatInputDeckHandle, type PendingAttachment } from "./chat-input-deck";
import { ErrorAlert, Button } from "@/shared/components";
import { AutoLockGuard } from "@/features/vault/components/auto-lock-guard";

interface ChatViewProps {
  initialChats: ChatMetadata[];
  initialProjects?: ProjectDto[];
  initialKeys: AiApiKeyMetadata[];
  initialModels: AiModelMetadata[];
  initialChatId?: string | null;
  initialProjectId?: string | null;
  initialMessages?: ChatMessageDto[];
  initialHasMore?: boolean;
  initialTotal?: number;
}

export function ChatView({
  initialChats,
  initialProjects = [],
  initialKeys,
  initialModels,
  initialChatId = null,
  initialProjectId = null,
  initialMessages = [],
  initialHasMore = false,
}: ChatViewProps) {
  const [chats, setChats] = useState<ChatMetadata[]>(initialChats);
  const [projects, setProjects] = useState<ProjectDto[]>(initialProjects);
  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatId);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialProjectId);
  const [messages, setMessages] = useState<ChatMessageDto[]>(initialMessages);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isLoadingChat, setIsLoadingChat] = useState<boolean>(false);
  const [keys] = useState<AiApiKeyMetadata[]>(initialKeys);
  const [models] = useState<AiModelMetadata[]>(initialModels);

  // Background request tracking per chat
  const [pendingChatIds, setPendingChatIds] = useState<Set<string>>(new Set());
  const [isNewChatPending, setIsNewChatPending] = useState(false);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectDto | null>(null);

  const defaultKey = keys[0];
  const [selectedKeyId, setSelectedKeyId] = useState<string>(defaultKey?.id || "");

  const getInitialModel = () => {
    if (defaultKey) {
      const match = models.find(
        (m) => m.provider.toLowerCase() === defaultKey.provider.toLowerCase()
      );
      if (match) return match.name;
    }
    return models[0]?.name || "gemini-3.8-flash";
  };

  const [selectedModel, setSelectedModel] = useState<string>(getInitialModel());
  const [thinkingLevel, setThinkingLevel] = useState<"none" | "low" | "medium" | "high">("medium");
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputDeckRef = useRef<ChatInputDeckHandle>(null);
  const shouldAutoScrollToBottomRef = useRef<boolean>(true);

  // Refs for tracking active chat and drafts to prevent race conditions when switching chats
  const activeChatIdRef = useRef<string | null>(initialChatId);
  const currentChatKeyRef = useRef<string>(initialChatId || "new-chat");
  const draftsRef = useRef<Record<string, { text: string; attachments: PendingAttachment[] }>>({});

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;

  const handleAttachFile = (file: ChatAttachmentDto) => {
    inputDeckRef.current?.attachFile(file);
  };

  const isCurrentChatPending = activeChatId ? pendingChatIds.has(activeChatId) : isNewChatPending;

  useEffect(() => {
    if (shouldAutoScrollToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isCurrentChatPending, isLoadingChat]);

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

    // 1. Save draft from currently viewed chat
    if (inputDeckRef.current) {
      draftsRef.current[currentChatKeyRef.current] = inputDeckRef.current.getDraft();
    }

    setError(null);
    setActiveChatId(chatId);
    activeChatIdRef.current = chatId;
    currentChatKeyRef.current = chatId;

    // 2. Restore draft for newly selected chat
    const targetDraft = draftsRef.current[chatId] || { text: "", attachments: [] };
    inputDeckRef.current?.restoreDraft(targetDraft.text, targetDraft.attachments);

    const selectedChatMeta = chats.find((c) => c.id === chatId);
    if (selectedChatMeta) {
      setActiveProjectId(selectedChatMeta.projectId ?? null);
    }
    shouldAutoScrollToBottomRef.current = true;
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/app?c=${chatId}`);
    }

    setIsLoadingChat(true);
    try {
      const res = await getChatMessagesAction(chatId, 30, 0, "desc");
      // Verify user has not navigated away to another chat while fetching
      if (activeChatIdRef.current === chatId) {
        if (res.success && res.data) {
          const reversed = (res.data.messages || []).slice().reverse();
          setMessages(reversed);
          setHasMore(Boolean(res.data.hasMore));
          if (res.data.chat) {
            setActiveProjectId(res.data.chat.projectId ?? null);
            setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, ...res.data?.chat } : c)));
          }
        } else {
          setError(res.error || "Failed to load chat.");
        }
      }
    } finally {
      if (activeChatIdRef.current === chatId) {
        setIsLoadingChat(false);
      }
    }
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const handleNewChat = (projectId?: string | null) => {
    // 1. Save draft from currently viewed chat
    if (inputDeckRef.current) {
      draftsRef.current[currentChatKeyRef.current] = inputDeckRef.current.getDraft();
    }

    const nextProjectId = projectId !== undefined ? projectId : activeProjectId;
    setActiveChatId(null);
    activeChatIdRef.current = null;
    currentChatKeyRef.current = "new-chat";
    setActiveProjectId(nextProjectId);
    setMessages([]);
    setHasMore(false);
    setError(null);

    // 2. Restore draft for new chat
    const targetDraft = draftsRef.current["new-chat"] || { text: "", attachments: [] };
    inputDeckRef.current?.restoreDraft(targetDraft.text, targetDraft.attachments);

    shouldAutoScrollToBottomRef.current = true;
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", nextProjectId ? `/app?p=${nextProjectId}` : "/app");
    }
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const handleSelectProject = (projectId: string | null) => {
    if (inputDeckRef.current) {
      draftsRef.current[currentChatKeyRef.current] = inputDeckRef.current.getDraft();
    }
    setActiveProjectId(projectId);
    setActiveChatId(null);
    activeChatIdRef.current = null;
    currentChatKeyRef.current = "new-chat";
    setMessages([]);
    setHasMore(false);
    setError(null);

    const targetDraft = draftsRef.current["new-chat"] || { text: "", attachments: [] };
    inputDeckRef.current?.restoreDraft(targetDraft.text, targetDraft.attachments);

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", projectId ? `/app?p=${projectId}` : "/app");
    }
  };

  const handleOpenCreateProject = () => {
    setEditingProject(null);
    setProjectModalOpen(true);
  };

  const handleOpenEditProject = (project: ProjectDto) => {
    setEditingProject(project);
    setProjectModalOpen(true);
  };

  const handleSaveProject = async (data: { id?: string; name: string; systemPrompt: string }) => {
    setError(null);
    if (data.id) {
      const res = await updateProjectAction({
        id: data.id,
        name: data.name,
        systemPrompt: data.systemPrompt,
      });
      if (res.success && res.data) {
        setProjects((prev) => prev.map((p) => (p.id === data.id ? res.data! : p)));
      } else {
        setError(res.error || "Failed to update project.");
      }
    } else {
      const res = await createProjectAction({
        name: data.name,
        systemPrompt: data.systemPrompt,
      });
      if (res.success && res.data) {
        setProjects((prev) => [...prev, res.data!]);
        handleNewChat(res.data.id);
      } else {
        setError(res.error || "Failed to create project.");
      }
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      const res = await deleteProjectAction(projectId);
      if (res.success) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        setChats((prev) => prev.filter((c) => c.projectId !== projectId));
        if (activeProjectId === projectId) {
          handleNewChat(null);
        }
      } else {
        setError(res.error || "Failed to delete project.");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to delete project.");
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      const res = await deleteChatAction(chatId);
      if (res.success) {
        delete draftsRef.current[chatId];
        setChats((prev) => prev.filter((c) => c.id !== chatId));
        if (activeChatId === chatId) {
          handleNewChat(activeProjectId);
        }
      } else {
        setError(res.error || "Failed to delete chat.");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to delete chat.");
    }
  };

  const handleSendMessage = async (
    messageText: string,
    fileIds?: string[],
    originalAttachments?: PendingAttachment[],
    rawInput?: string
  ) => {
    const trimmed = messageText.trim();
    if (!trimmed && (!fileIds || fileIds.length === 0)) return;

    const sentChatId = activeChatId;
    const isNewChat = !sentChatId;
    const chatKey = sentChatId || "new-chat";

    // Prevent double sending on the same active chat
    if (sentChatId && pendingChatIds.has(sentChatId)) return;
    if (isNewChat && isNewChatPending) return;

    setError(null);
    shouldAutoScrollToBottomRef.current = true;

    const activeKey = keys.find((k) => k.id === selectedKeyId) || keys[0];
    const provider = activeKey?.provider || "google";

    const tempUserMsg: ChatMessageDto = {
      id: `temp-${Date.now()}`,
      chatId: sentChatId || "pending",
      role: "user",
      content: trimmed,
      sequenceNumber: messages.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const tempAssistantId = `temp-assistant-${Date.now()}`;
    const tempAssistantMsg: ChatMessageDto = {
      id: tempAssistantId,
      chatId: sentChatId || "pending",
      role: "assistant",
      content: "",
      sequenceNumber: messages.length + 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);

    const savedDraft: { text: string; attachments: PendingAttachment[] } = {
      text: rawInput !== undefined ? rawInput : messageText,
      attachments: originalAttachments || [],
    };

    if (sentChatId) {
      setPendingChatIds((prev) => new Set(prev).add(sentChatId));
    } else {
      setIsNewChatPending(true);
    }

    try {
      const res = await fetch("/api/chats/messages/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: sentChatId || undefined,
          projectId: !sentChatId ? (activeProjectId || undefined) : undefined,
          message: trimmed,
          provider,
          model: selectedModel,
          thinkingLevel,
          fileIds: fileIds && fileIds.length > 0 ? fileIds : undefined,
        }),
      });

      if (!res.ok) {
        let errMessage = "Failed to send message.";
        try {
          const errData = await res.json();
          errMessage = errData.error || errMessage;
        } catch {
          // ignore
        }
        throw new Error(errMessage);
      }

      if (!res.body) {
        throw new Error("No response body received from server.");
      }

      // Add temporary assistant placeholder
      setMessages((prev) => [...prev, tempAssistantMsg]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";
      let streamDoneData: {
        chat: ChatMetadata;
        userMessage: ChatMessageDto;
        assistantMessage: ChatMessageDto;
      } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith("data:")) continue;
          const jsonStr = trimmedLine.replace(/^data:\s*/, "");
          if (!jsonStr) continue;

          let evt: any = null;
          try {
            evt = JSON.parse(jsonStr);
            if (evt.type === "chunk" && typeof evt.text === "string") {
              accumulatedText += evt.text;
              const currentContent = accumulatedText;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId ? { ...m, content: currentContent } : m
                )
              );
              if (shouldAutoScrollToBottomRef.current) {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
              }
            } else if (evt.type === "done") {
              streamDoneData = {
                chat: evt.chat,
                userMessage: evt.userMessage,
                assistantMessage: evt.assistantMessage,
              };
            } else if (evt.type === "error") {
              throw new Error(evt.error || "Streaming failed");
            }
          } catch (e: any) {
            if (e.message?.includes("Streaming failed") || evt?.type === "error") {
              throw e;
            }
          }
        }
      }

      if (!streamDoneData) {
        throw new Error("Stream closed before completion.");
      }

      delete draftsRef.current[chatKey];

      const { chat, userMessage, assistantMessage } = streamDoneData;

      setChats((prev) => {
        const exists = prev.some((c) => c.id === chat.id);
        return exists
          ? prev.map((c) => (c.id === chat.id ? { ...c, ...chat } : c))
          : [chat, ...prev];
      });

      const isStillInSameChat = isNewChat
        ? activeChatIdRef.current === null
        : activeChatIdRef.current === sentChatId;

      if (sentChatId) {
        setPendingChatIds((prev) => {
          const next = new Set(prev);
          next.delete(sentChatId);
          return next;
        });
      } else {
        setIsNewChatPending(false);
      }

      if (isStillInSameChat) {
        if (isNewChat) {
          currentChatKeyRef.current = chat.id;
          setActiveChatId(chat.id);
          activeChatIdRef.current = chat.id;
          setActiveProjectId(chat.projectId ?? null);
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", `/app?c=${chat.id}`);
          }
        }
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUserMsg.id && m.id !== tempAssistantId),
          userMessage,
          assistantMessage,
        ]);
      }
    } catch (err: any) {
      console.error("Message stream error:", err);
      setError(err?.message || "Failed to send message.");
      setMessages((prev) =>
        prev.filter((m) => m.id !== tempUserMsg.id && m.id !== tempAssistantId)
      );

      const isStillInSameChat = isNewChat
        ? activeChatIdRef.current === null
        : activeChatIdRef.current === sentChatId;

      if (isStillInSameChat) {
        inputDeckRef.current?.restoreDraft(savedDraft.text, savedDraft.attachments);
        inputDeckRef.current?.focus();
      } else {
        draftsRef.current[chatKey] = savedDraft;
      }
    } finally {
      if (sentChatId) {
        setPendingChatIds((prev) => {
          const next = new Set(prev);
          next.delete(sentChatId);
          return next;
        });
      } else {
        setIsNewChatPending(false);
      }
    }
  };

  const totalInputTokens = messages.reduce((acc, m) => acc + (m.inputTokens || 0), 0);
  const totalOutputTokens = messages.reduce((acc, m) => acc + (m.outputTokens || 0), 0);
  const totalThoughtTokens = messages.reduce((acc, m) => acc + (m.thoughtTokens || 0), 0);
  const totalCost = messages.reduce((acc, m) => acc + (m.totalCost || 0), 0);

  return (
    <AutoLockGuard>
      <div className="flex h-screen w-full bg-[#0e0f12] bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(120,119,198,0.08),transparent)] text-neutral-100 overflow-hidden relative">
        <ProjectModal
          isOpen={projectModalOpen}
          project={editingProject}
          onClose={() => setProjectModalOpen(false)}
          onSave={handleSaveProject}
        />

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
          projects={projects}
          activeChatId={activeChatId}
          activeProjectId={activeProjectId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onSelectProject={handleSelectProject}
          onCreateProject={handleOpenCreateProject}
          onEditProject={handleOpenEditProject}
          onDeleteProject={handleDeleteProject}
          keys={keys}
          telemetry={{
            totalInputTokens,
            totalOutputTokens,
            totalThoughtTokens,
            totalCost,
          }}
        />

        <main className="flex-1 flex flex-col h-full overflow-hidden transition-[padding] duration-200 md:pl-60">
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
                      <span>Loading earlier messages...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 text-neutral-400 group-hover:-translate-y-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      <span>Load previous messages</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {!hasMore && messages.length > 10 && (
              <div className="flex items-center justify-center gap-2 my-6 text-[11px] font-mono tracking-wider text-neutral-500 uppercase">
                <span className="w-8 h-px bg-white/[0.06]" />
                <span>Beginning of conversation</span>
                <span className="w-8 h-px bg-white/[0.06]" />
              </div>
            )}

            {messages.length > 0 && (
              <div className="max-w-4xl mx-auto">
                {messages.map((m) => (
                  <ChatMessageItem
                    key={m.id}
                    message={m}
                    onAttachFile={handleAttachFile}
                    isStreaming={m.id.startsWith("temp-assistant-")}
                  />
                ))}
                {(isCurrentChatPending || isLoadingChat) &&
                  !messages.some(
                    (m) => m.role === "assistant" && m.content.trim().length > 0
                  ) && (
                    <ThinkingAura modelName={selectedModel} thinkingLevel={thinkingLevel} />
                  )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <ChatInputDeck
            ref={inputDeckRef}
            onSubmit={handleSendMessage}
            disabled={isCurrentChatPending}
            keys={keys}
            selectedKeyId={selectedKeyId}
            setSelectedKeyId={setSelectedKeyId}
            models={models}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            thinkingLevel={thinkingLevel}
            setThinkingLevel={setThinkingLevel}
            activeChatId={activeChatId}
            activeProject={activeProject}
            onEditProject={handleOpenEditProject}
            onClearProject={() => handleNewChat(null)}
          />
        </main>
      </div>
    </AutoLockGuard>
  );
}
