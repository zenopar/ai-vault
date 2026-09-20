import { useState, memo } from "react";
import { ChatMessageDto, ChatAttachmentDto } from "@ai-vault/types";
import { MarkdownRenderer } from "./markdown-renderer";
import { MediaLightbox } from "./media-lightbox";
import { Button } from "@/shared/components";
import { FileText, Film, Download, Paperclip } from "lucide-react";

interface ChatMessageItemProps {
  message: ChatMessageDto;
  onAttachFile?: (att: ChatAttachmentDto) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const ChatMessageItem = memo(function ChatMessageItem({ message, onAttachFile }: ChatMessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [activeLightboxAttachment, setActiveLightboxAttachment] = useState<ChatAttachmentDto | null>(null);
  const isAssistant = message.role === "assistant";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  const formatCost = (cost?: number) => {
    if (!cost) return "$0.00";
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return "";
    }
  };

  const attachments = message.attachments || [];
  const imageAttachments = attachments.filter((a) => a.mimeType.startsWith("image/"));
  const videoAttachments = attachments.filter((a) => a.mimeType.startsWith("video/"));
  const fileAttachments = attachments.filter(
    (a) => !a.mimeType.startsWith("image/") && !a.mimeType.startsWith("video/")
  );

  return (
    <>
      <div className={`w-full flex my-6 animate-enter ${isAssistant ? "justify-start" : "justify-end"}`}>
        <div className={`${isAssistant ? "w-full text-neutral-200" : "max-w-[85%] sm:max-w-[80%] text-neutral-100"}`}>
          {/* Content */}
          <div className={`${isAssistant ? "w-full" : "text-right"}`}>
            {isAssistant ? (
              <div className="prose-dark font-sans leading-relaxed">
                <MarkdownRenderer content={message.content} />
              </div>
            ) : (
              <div className="inline-block text-left text-[14.5px] leading-[1.7] whitespace-pre-wrap bg-[#1a1b22] border border-white/[0.08] rounded-2xl px-5 py-3.5 shadow-sm text-neutral-100 font-sans max-w-full">
                {/* Images grid */}
                {imageAttachments.length > 0 && (
                  <div className={`grid gap-2 mb-3 max-w-sm sm:max-w-md ${imageAttachments.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                    {imageAttachments.map((img) => (
                      <div
                        key={img.id}
                        className="group/img relative rounded-xl overflow-hidden border border-white/[0.08] bg-black/40 aspect-video max-h-[220px]"
                      >
                        <img
                          src={`/api/files/${encodeURIComponent(img.id)}`}
                          alt={img.name}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                          onClick={() => setActiveLightboxAttachment(img)}
                        />
                        {onAttachFile && (
                          <div className="absolute top-2 right-2 opacity-0 group-hover/img:opacity-100 transition-opacity z-10 flex items-center gap-1">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onAttachFile(img);
                              }}
                              className="h-6 px-2 py-0.5 text-[10.5px] bg-black/75 hover:bg-black/95 text-indigo-300 hover:text-white rounded-md border-white/20 gap-1 backdrop-blur-xs shadow-md"
                              title="Attach to new message (send to AI again)"
                            >
                              <Paperclip className="w-3 h-3 text-indigo-400" />
                              <span>Attach</span>
                            </Button>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity flex items-end p-2.5 pointer-events-none">
                          <span className="font-mono text-[10.5px] text-white truncate max-w-full drop-shadow">
                            {img.name}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Videos */}
                {videoAttachments.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {videoAttachments.map((vid) => (
                      <div key={vid.id} className="rounded-xl overflow-hidden border border-white/[0.08] bg-black/40">
                        <video
                          src={`/api/files/${encodeURIComponent(vid.id)}`}
                          controls
                          className="w-full max-h-[320px] rounded-xl"
                        />
                        {onAttachFile && (
                          <div className="p-1.5 bg-black/40 border-t border-white/[0.05] flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => onAttachFile(vid)}
                              className="h-6 px-2 py-0.5 text-[10px] text-indigo-300 hover:text-white gap-1"
                              title="Attach to new message"
                            >
                              <Paperclip className="w-3 h-3 text-indigo-400" />
                              <span>Attach to prompt</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Other File Attachments */}
                {fileAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {fileAttachments.map((f) => (
                      <div
                        key={f.id}
                        className="group/file flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-neutral-200 font-mono text-xs transition-colors"
                      >
                        <a
                          href={`/api/files/${encodeURIComponent(f.id)}`}
                          download={f.name}
                          className="flex items-center gap-2 flex-1 min-w-0 hover:text-white"
                          title="Download file"
                        >
                          <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                          <span className="truncate max-w-[180px] font-medium">{f.name}</span>
                          <span className="text-[10px] text-neutral-500 shrink-0">{formatBytes(f.size)}</span>
                          <Download className="w-3.5 h-3.5 text-neutral-400 shrink-0 ml-1 hover:text-white" />
                        </a>

                        {onAttachFile && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onAttachFile(f)}
                            className="h-6 px-2 py-0.5 text-[10.5px] text-indigo-300 hover:text-white hover:bg-indigo-500/20 rounded-md gap-1 shrink-0 ml-1 border border-indigo-500/20"
                            title="Attach to new message (reuse file without re-uploading)"
                          >
                            <Paperclip className="w-3 h-3 text-indigo-400" />
                            <span>Attach</span>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {message.content}
              </div>
            )}
          </div>


        {/* Metrics line for assistant */}
        {isAssistant && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-neutral-500">
            {message.modelName && <span className="text-neutral-400">{message.modelName}</span>}
            {message.thinkingLevel && message.thinkingLevel !== "none" && <span>· {message.thinkingLevel}</span>}
            {(message.inputTokens !== undefined || message.outputTokens !== undefined) && (
              <>
                <span>· {message.inputTokens ?? 0} in</span>
                <span>· {message.outputTokens ?? 0} out</span>
                {(message.thoughtTokens ?? 0) > 0 && <span>· {message.thoughtTokens} thought</span>}
                <span>· {formatCost(message.totalCost)}</span>
              </>
            )}
            {message.createdAt && <span>· {formatTime(message.createdAt)}</span>}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="ml-1 text-neutral-500 hover:text-neutral-200 px-1.5 py-0.5 h-auto text-[11px]"
            >
              {copied ? "✓ copied" : "copy"}
            </Button>
          </div>
        )}

        {/* Copy for user messages */}
        {!isAssistant && (
          <div className="mt-1 flex justify-end items-center gap-2 font-mono text-[11px] text-neutral-600">
            {message.createdAt && <span>{formatTime(message.createdAt)}</span>}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="hover:text-neutral-400 px-1.5 py-0.5 h-auto text-[11px]"
            >
              {copied ? "copied" : "copy"}
            </Button>
          </div>
        )}
      </div>
    </div>

    {/* Lightbox for full size media inspection */}
    <MediaLightbox
      attachment={activeLightboxAttachment}
      onClose={() => setActiveLightboxAttachment(null)}
      onAttach={onAttachFile}
    />
  </>
  );
});