"use client";

import { useEffect } from "react";
import { X, Download, ExternalLink, Paperclip } from "lucide-react";
import { Button } from "@/shared/components";
import type { ChatAttachmentDto } from "@ai-vault/types";

interface MediaLightboxProps {
  attachment: ChatAttachmentDto | null;
  onClose: () => void;
  onAttach?: (att: ChatAttachmentDto) => void;
}

export function MediaLightbox({ attachment, onClose, onAttach }: MediaLightboxProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!attachment) return null;

  const isImage = attachment.mimeType.startsWith("image/");
  const isVideo = attachment.mimeType.startsWith("video/");
  const fileUrl = `/api/files/${encodeURIComponent(attachment.id)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-8 animate-fadeIn"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <div
        className="w-full max-w-5xl flex items-center justify-between pb-3 text-neutral-300 font-mono text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate max-w-md font-medium text-neutral-100">{attachment.name}</span>
        <div className="flex items-center gap-2">
          {onAttach && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                onAttach(attachment);
                onClose();
              }}
              className="gap-1.5 text-[11px] h-8 px-3 rounded-lg text-indigo-300 hover:text-white border-white/[0.12]"
              title="Attach to new message (send to AI again)"
            >
              <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
              <span>Attach to prompt</span>
            </Button>
          )}
          <a
            href={fileUrl}
            download={attachment.name}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-neutral-200 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="text-[11px]">Download</span>
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.1]"
            title="Close"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Main Preview */}
      <div
        className="relative max-w-5xl max-h-[82vh] flex items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-black/50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isImage && (
          <img
            src={fileUrl}
            alt={attachment.name}
            className="max-w-full max-h-[80vh] object-contain rounded-xl select-none"
          />
        )}
        {isVideo && (
          <video
            src={fileUrl}
            controls
            autoPlay
            className="max-w-full max-h-[80vh] rounded-xl"
          />
        )}
      </div>
    </div>
  );
}
