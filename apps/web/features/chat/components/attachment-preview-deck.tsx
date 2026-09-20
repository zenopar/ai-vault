"use client";

import { useEffect, useState } from "react";
import { X, Loader2, AlertCircle, FileText, Film, File as FileIcon } from "lucide-react";
import type { ChatAttachmentDto } from "@ai-vault/types";

export interface PendingAttachment {
  localId: string;
  file: File;
  previewUrl?: string;
  uploadStatus: "uploading" | "ready" | "error";
  error?: string;
  dto?: ChatAttachmentDto;
}

interface AttachmentPreviewDeckProps {
  attachments: PendingAttachment[];
  onRemove: (localId: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function AttachmentPreviewDeck({ attachments, onRemove }: AttachmentPreviewDeckProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 p-2.5 mb-2 bg-[#181920]/80 border border-white/[0.06] rounded-xl backdrop-blur-md animate-enter">
      {attachments.map((att) => {
        const isImage = att.file.type.startsWith("image/");
        const isVideo = att.file.type.startsWith("video/");

        return (
          <div
            key={att.localId}
            className="group relative flex items-center gap-2 px-2.5 py-1.5 bg-black/40 border border-white/[0.08] rounded-lg max-w-[220px] transition-all hover:border-white/[0.18]"
          >
            {/* Thumbnail or Icon */}
            <div className="relative w-8 h-8 rounded shrink-0 overflow-hidden bg-white/[0.03] flex items-center justify-center">
              {isImage && att.previewUrl ? (
                <img
                  src={att.previewUrl}
                  alt={att.file.name}
                  className="w-full h-full object-cover"
                />
              ) : isVideo ? (
                <Film className="w-4 h-4 text-sky-400" />
              ) : (
                <FileText className="w-4 h-4 text-indigo-400" />
              )}

              {att.uploadStatus === "uploading" && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                </div>
              )}
            </div>

            {/* Name and Size */}
            <div className="min-w-0 flex-1 font-mono text-[11px]">
              <p className="truncate text-neutral-200 font-medium leading-tight" title={att.file.name}>
                {att.file.name}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-neutral-500 text-[10px]">{formatBytes(att.file.size)}</span>
                {att.uploadStatus === "uploading" && (
                  <span className="text-indigo-400 text-[10px]">· encrypting...</span>
                )}
                {att.uploadStatus === "ready" && (
                  <span className="text-emerald-400/90 text-[10px]">· ready</span>
                )}
                {att.uploadStatus === "error" && (
                  <span className="text-rose-400 text-[10px] flex items-center gap-0.5">
                    <AlertCircle className="w-2.5 h-2.5" /> error
                  </span>
                )}
              </div>
            </div>

            {/* Remove Button */}
            <button
              type="button"
              onClick={() => onRemove(att.localId)}
              className="ml-1 p-1 rounded-full text-neutral-500 hover:text-white hover:bg-white/[0.1] transition-colors"
              title="Remove attachment"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
