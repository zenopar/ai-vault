"use client";

import { useState, useEffect } from "react";
import { ProjectDto } from "@ai-vault/types";
import { Button, Input } from "@/shared/components";

interface ProjectModalProps {
  isOpen: boolean;
  project?: ProjectDto | null;
  onClose: () => void;
  onSave: (data: { id?: string; name: string; systemPrompt: string }) => Promise<void>;
}

export function ProjectModal({ isOpen, project, onClose, onSave }: ProjectModalProps) {
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(project?.name || "");
      setSystemPrompt(project?.systemPrompt || "");
    }
  }, [isOpen, project]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await onSave({
        id: project?.id,
        name: name.trim(),
        systemPrompt,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-[#14151a] border border-white/[0.08] p-6 shadow-2xl animate-enter font-sans">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-medium text-neutral-100">
              {project ? "Edit Project" : "New Project"}
            </h3>
            <p className="text-xs text-neutral-500 font-mono mt-0.5">
              {project
                ? "Configure project name and custom system prompt"
                : "Create an isolated workspace with its own chats & system prompt"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-white text-sm px-2 py-1 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Project Name"
            type="text"
            placeholder="e.g. TypeScript Refactoring, Legal Advisor..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <div className="space-y-1.5 w-full">
            <label className="text-[13px] font-medium text-neutral-300 font-sans block">
              Project System Prompt
            </label>
            <p className="text-[11px] text-neutral-500 font-mono">
              Used exclusively for chats inside this project (replaces global system prompt).
            </p>
            <textarea
              className="w-full h-36 px-3.5 py-2.5 bg-[#181920] border border-white/[0.08] rounded-xl text-neutral-100 placeholder:text-neutral-600 text-sm focus:outline-none focus:border-white/25 transition-colors resize-y font-mono"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter system instructions for this project..."
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSaving} disabled={!name.trim()}>
              {project ? "Save Changes" : "Create Project"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
