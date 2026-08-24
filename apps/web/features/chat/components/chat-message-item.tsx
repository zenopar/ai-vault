"use client";

import { useState, memo } from "react";
import { ChatMessageDto } from "@ai-vault/types";
import { MarkdownRenderer } from "./markdown-renderer";
import { Button } from "@/shared/components";

interface ChatMessageItemProps {
  message: ChatMessageDto;
}

export const ChatMessageItem = memo(function ChatMessageItem({ message }: ChatMessageItemProps) {
  const [copied, setCopied] = useState(false);
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

  return (
    <div className={`w-full flex my-6 animate-enter ${isAssistant ? "justify-start" : "justify-end"}`}>
      <div className={`${isAssistant ? "w-full text-neutral-200" : "max-w-[85%] sm:max-w-[80%] text-neutral-100"}`}>
        {/* Content */}
        <div className={`${isAssistant ? "w-full" : "text-right"}`}>
          {isAssistant ? (
            <div className="prose-dark font-sans leading-relaxed">
              <MarkdownRenderer content={message.content} />
            </div>
          ) : (
            <div className="inline-block text-left text-[14.5px] leading-[1.7] whitespace-pre-wrap bg-[#1a1b22] border border-white/[0.08] rounded-2xl px-5 py-3.5 shadow-sm text-neutral-100 font-sans">
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
  );
});