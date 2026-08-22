"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Button } from "@/shared/components";

interface MarkdownRendererProps {
  content: string;
}

function CodeBlock({
  language,
  code,
}: {
  language?: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Failed to copy code:", e);
    }
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden bg-[#131418] border border-white/[0.08] shadow-md">
      <div className="flex items-center justify-between px-4 py-1.5 text-[11px] font-mono text-neutral-400 bg-white/[0.03] border-b border-white/[0.05]">
        <span className="font-medium text-neutral-300">{language || "code"}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="text-neutral-400 hover:text-white px-1.5 py-0.5 h-auto text-[10.5px]"
        >
          {copied ? "✓ copied" : "copy"}
        </Button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] font-mono text-neutral-200 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export const MarkdownRenderer = React.memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const codeString = String(children).replace(/\n$/, "");
          const isInline = !match && !String(children).includes("\n");

          if (isInline) {
            return (
              <code
                className="px-1.5 py-0.5 rounded-md bg-white/[0.08] font-mono text-[13px] text-indigo-200 border border-white/[0.06]"
                {...props}
              >
                {children}
              </code>
            );
          }

          return (
            <CodeBlock
              language={match ? match[1] : undefined}
              code={codeString}
            />
          );
        },
        p({ children }) {
          return (
            <p className="mb-3.5 leading-[1.75] text-[15px] text-neutral-200 last:mb-0 font-sans">
              {children}
            </p>
          );
        },
        strong({ children }) {
          return <strong className="font-semibold text-white">{children}</strong>;
        },
        em({ children }) {
          return <em className="italic text-neutral-300">{children}</em>;
        },
        ul({ children }) {
          return (
            <ul className="list-disc list-outside pl-5 mb-3.5 space-y-1 text-[15px] leading-[1.75] text-neutral-200">
              {children}
            </ul>
          );
        },
        ol({ children }) {
          return (
            <ol className="list-decimal list-outside pl-5 mb-3.5 space-y-1 text-[15px] leading-[1.75] text-neutral-200">
              {children}
            </ol>
          );
        },
        li({ children }) {
          return <li className="leading-[1.75]">{children}</li>;
        },
        h1({ children }) {
          return (
            <h1 className="text-xl font-semibold text-white mt-6 mb-3 tracking-tight font-sans border-b border-white/[0.08] pb-1.5">
              {children}
            </h1>
          );
        },
        h2({ children }) {
          return (
            <h2 className="text-lg font-semibold text-white mt-5 mb-2.5 tracking-tight font-sans">
              {children}
            </h2>
          );
        },
        h3({ children }) {
          return (
            <h3 className="text-base font-medium text-white mt-4 mb-2 tracking-tight font-sans">
              {children}
            </h3>
          );
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-indigo-500/50 pl-4 py-1 my-3.5 text-neutral-400 italic text-[14.5px] bg-white/[0.01] rounded-r-lg">
              {children}
            </blockquote>
          );
        },
        table({ children }) {
          return (
            <div className="my-4 overflow-x-auto rounded-xl border border-white/[0.08]">
              <table className="w-full text-left text-xs font-mono">{children}</table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th className="px-3.5 py-2.5 font-medium text-neutral-300 bg-white/[0.04] border-b border-white/[0.06]">
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="px-3.5 py-2.5 text-neutral-300 border-b border-white/[0.03]">
              {children}
            </td>
          );
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:text-sky-300 underline underline-offset-2 transition-colors cursor-pointer"
            >
              {children}
            </a>
          );
        },
        hr() {
          return <hr className="my-5 border-white/[0.08]" />;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

