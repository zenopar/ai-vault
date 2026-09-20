"use client";

import {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
  KeyboardEvent,
} from "react";
import Link from "next/link";
import { Paperclip, FolderOpen, FileText, Film, Check, Loader2, X } from "lucide-react";
import { AiApiKeyMetadata, AiModelMetadata, ChatAttachmentDto } from "@ai-vault/types";
import { Button, DropdownSelect } from "@/shared/components";
import { AttachmentPreviewDeck, PendingAttachment } from "./attachment-preview-deck";

export interface ChatInputDeckHandle {
  attachFile: (dto: ChatAttachmentDto) => void;
  focus: () => void;
}

interface ChatInputDeckProps {
  onSubmit: (message: string, fileIds?: string[]) => void;
  disabled: boolean;
  keys: AiApiKeyMetadata[];
  selectedKeyId: string;
  setSelectedKeyId: (id: string) => void;
  models: AiModelMetadata[];
  selectedModel: string;
  setSelectedModel: (modelName: string) => void;
  thinkingLevel: "none" | "low" | "medium" | "high";
  setThinkingLevel: (level: "none" | "low" | "medium" | "high") => void;
  activeChatId?: string | null;
}

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const ChatInputDeck = forwardRef<ChatInputDeckHandle, ChatInputDeckProps>(function ChatInputDeck(
  {
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
    activeChatId,
  }: ChatInputDeckProps,
  ref
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [showChatFilesPopover, setShowChatFilesPopover] = useState(false);
  const [chatFiles, setChatFiles] = useState<ChatAttachmentDto[]>([]);
  const [isLoadingChatFiles, setIsLoadingChatFiles] = useState(false);

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

  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const newFiles = Array.from(fileList);
    if (newFiles.length === 0) return;

    const newPending: PendingAttachment[] = newFiles.map((file) => ({
      localId: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      uploadStatus: "uploading",
    }));

    setAttachments((prev) => [...prev, ...newPending]);

    // Upload each file to /api/files/upload
    for (const item of newPending) {
      const formData = new FormData();
      formData.append("file", item.file!);
      if (activeChatId) formData.append("chatId", activeChatId);

      try {
        const res = await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok && data.success && data.file) {
          setAttachments((prev) =>
            prev.map((p) =>
              p.localId === item.localId ? { ...p, uploadStatus: "ready", dto: data.file } : p
            )
          );
        } else {
          setAttachments((prev) =>
            prev.map((p) =>
              p.localId === item.localId
                ? { ...p, uploadStatus: "error", error: data.error || "Upload failed" }
                : p
            )
          );
        }
      } catch (err: any) {
        setAttachments((prev) =>
          prev.map((p) =>
            p.localId === item.localId ? { ...p, uploadStatus: "error", error: err.message } : p
          )
        );
      }
    }
  };

  const attachExistingFile = useCallback((dto: ChatAttachmentDto) => {
    setAttachments((prev) => {
      if (prev.some((a) => a.dto?.id === dto.id)) {
        return prev;
      }
      const isImage = dto.mimeType.startsWith("image/");
      const item: PendingAttachment = {
        localId: `existing-${dto.id}-${Date.now()}`,
        name: dto.name,
        size: dto.size,
        mimeType: dto.mimeType,
        previewUrl: isImage ? `/api/files/${encodeURIComponent(dto.id)}` : undefined,
        uploadStatus: "ready",
        dto,
        isExisting: true,
      };
      return [...prev, item];
    });
    textareaRef.current?.focus();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      attachFile: attachExistingFile,
      focus: () => textareaRef.current?.focus(),
    }),
    [attachExistingFile]
  );

  const handleToggleChatFiles = async () => {
    if (!showChatFilesPopover && activeChatId) {
      setIsLoadingChatFiles(true);
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(activeChatId)}/files`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.files) {
            setChatFiles(data.files);
          }
        }
      } catch (e) {
        console.error("Failed to load chat files:", e);
      } finally {
        setIsLoadingChatFiles(false);
      }
    }
    setShowChatFilesPopover((prev) => !prev);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowChatFilesPopover(false);
      }
    };
    if (showChatFilesPopover) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showChatFilesPopover]);

  const handleRemoveAttachment = (localId: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.localId === localId);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((a) => a.localId !== localId);
    });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      handleFilesSelected(e.clipboardData.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const isAnyUploading = attachments.some((a) => a.uploadStatus === "uploading");

  const triggerSubmit = () => {
    const trimmed = input.trim();
    if ((!trimmed && attachments.length === 0) || disabled || isAnyUploading) return;

    const readyFileIds = attachments
      .filter((a) => a.uploadStatus === "ready" && a.dto?.id)
      .map((a) => a.dto!.id);

    onSubmit(trimmed, readyFileIds.length > 0 ? readyFileIds : undefined);
    setInput("");
    setAttachments([]);
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

  const canSubmit = !disabled && !isAnyUploading && (input.trim().length > 0 || attachments.length > 0);

  return (
    <div className="w-full shrink-0 px-3 sm:px-8 md:px-12 pb-4 sm:pb-6 pt-2">
      <div
        className="max-w-4xl mx-auto relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Thinking glowing aura */}
        {disabled && (
          <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-indigo-500/20 via-sky-500/30 to-indigo-500/20 blur-md opacity-75 animate-pulse" />
        )}

        {/* Drag & drop overlay */}
        {isDragging && (
          <div className="absolute -inset-1 rounded-2xl bg-indigo-600/20 border-2 border-dashed border-indigo-400/80 backdrop-blur-sm z-30 flex items-center justify-center pointer-events-none transition-all">
            <div className="flex items-center gap-2 font-mono text-xs text-indigo-200 bg-[#14151a]/90 px-4 py-2 rounded-xl border border-indigo-500/30 shadow-xl">
              <Paperclip className="w-4 h-4 text-indigo-400 animate-bounce" />
              <span>Drop files to encrypt & attach...</span>
            </div>
          </div>
        )}

        {/* Uniform Contour Ambient Glow on Focus */}
        <div
          className={`absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-indigo-500/20 via-sky-500/15 to-purple-500/20 blur-sm pointer-events-none transition-opacity duration-300 ${
            isFocused && !disabled ? "opacity-100" : "opacity-0"
          }`}
        />

        <div className="relative z-10 rounded-2xl border border-white/[0.09] bg-[#14151a]/95 backdrop-blur-xl focus-within:border-white/[0.18] shadow-2xl shadow-black/60 transition-[border-color,box-shadow] duration-200">
          {/* Pending attachments preview */}
          <div className="px-3 pt-3">
            <AttachmentPreviewDeck attachments={attachments} onRemove={handleRemoveAttachment} />
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            placeholder="Send a message or paste images..."
            rows={1}
            autoComplete="off"
            className="chat-textarea w-full bg-transparent text-[14.5px] sm:text-[15px] text-neutral-100 placeholder:text-neutral-500/70 resize-none focus:outline-none leading-[1.6] py-2.5 px-3.5 sm:py-3 sm:px-4.5 font-sans antialiased max-h-[200px] overflow-y-auto block caret-indigo-400 selection:bg-indigo-500/25 selection:text-white"
            style={{
              minHeight: "44px",
              fieldSizing: "content",
            }}
          />

          {/* Bottom bar: selectors + attach + send button */}
          <div className="px-3 sm:px-4 pb-2.5 sm:pb-3 pt-1.5 flex items-center justify-between gap-2 font-mono text-[11px] text-neutral-400 border-t border-white/[0.03]">
            {/* Left side: Attach Button & Selectors */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              {/* Attach File Button */}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="h-7 px-2.5 py-1 text-xs gap-1.5 shrink-0 rounded-lg text-neutral-300 hover:text-white border-white/[0.08]"
                title="Attach images, videos, or files (stored encrypted in R2)"
              >
                <Paperclip className="w-3.5 h-3.5 text-neutral-400" />
                <span className="hidden md:inline text-[11px]">Attach</span>
              </Button>

              {/* Chat Files Button & Popover */}
              {activeChatId && (
                <div className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleToggleChatFiles}
                    disabled={disabled}
                    className="h-7 px-2 py-1 text-xs gap-1.5 shrink-0 rounded-lg text-neutral-400 hover:text-neutral-200 border border-white/[0.05]"
                    title="Reuse a previously uploaded file from this chat"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-neutral-400" />
                    <span className="hidden md:inline text-[11px]">Chat files</span>
                  </Button>

                  {/* Popover */}
                  {showChatFilesPopover && (
                    <div
                      ref={popoverRef}
                      className="absolute bottom-full left-0 mb-2 w-72 sm:w-80 bg-[#16171d] border border-white/[0.1] rounded-xl shadow-2xl p-2 z-40 animate-enter"
                    >
                      <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/[0.06] mb-1 font-mono text-[11px] text-neutral-400">
                        <span className="font-medium text-neutral-200">Files in this chat</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowChatFilesPopover(false)}
                          className="h-4 w-4 p-0 text-neutral-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>

                      {isLoadingChatFiles ? (
                        <div className="flex items-center justify-center py-6 text-neutral-500 font-mono text-xs gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Loading files...</span>
                        </div>
                      ) : chatFiles.length === 0 ? (
                        <div className="py-4 text-center text-neutral-500 font-mono text-xs">
                          No files uploaded in this chat yet.
                        </div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto space-y-1">
                          {chatFiles.map((file) => {
                            const isAttached = attachments.some((a) => a.dto?.id === file.id);
                            const isImage = file.mimeType.startsWith("image/");
                            const isVideo = file.mimeType.startsWith("video/");

                            return (
                              <button
                                key={file.id}
                                type="button"
                                onClick={() => {
                                  if (!isAttached) attachExistingFile(file);
                                }}
                                disabled={isAttached}
                                className={`w-full flex items-center justify-between p-1.5 rounded-lg text-left transition-colors font-mono text-xs ${
                                  isAttached
                                    ? "bg-white/[0.02] text-neutral-500 cursor-default"
                                    : "hover:bg-white/[0.06] text-neutral-200 cursor-pointer"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                                  {isImage ? (
                                    <div className="w-6 h-6 rounded bg-black/40 overflow-hidden shrink-0 border border-white/10">
                                      <img
                                        src={`/api/files/${encodeURIComponent(file.id)}`}
                                        alt=""
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  ) : isVideo ? (
                                    <Film className="w-4 h-4 text-sky-400 shrink-0" />
                                  ) : (
                                    <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[11px] font-medium leading-tight">{file.name}</p>
                                    <span className="text-[10px] text-neutral-500">{formatBytes(file.size)}</span>
                                  </div>
                                </div>
                                {isAttached ? (
                                  <span className="text-[10px] text-emerald-400 flex items-center gap-0.5 shrink-0">
                                    <Check className="w-3 h-3" /> Attached
                                  </span>
                                ) : (
                                  <span className="text-[10.5px] text-indigo-400 hover:text-indigo-300 shrink-0">
                                    + Attach
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.txt,.md,.json,.csv,.zip"
                onChange={(e) => {
                  if (e.target.files) handleFilesSelected(e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />

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
                disabled={!canSubmit}
                className="px-3 py-1.5 sm:px-3.5 sm:py-1 font-mono text-xs shadow-none"
              >
                {disabled ? "..." : isAnyUploading ? "Encrypting..." : (
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
});