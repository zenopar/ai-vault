"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChatMetadata, AiApiKeyMetadata, ProjectDto } from "@ai-vault/types";
import { Button, Badge, ConfirmDialog } from "@/shared/components";
import { lockVaultAction } from "@/features/vault/actions/lock-vault.action";
import { BarChart2, Key, Settings, Folder, FolderOpen, Plus, Pencil, Trash2, ChevronRight, ChevronDown } from "lucide-react";

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chats: ChatMetadata[];
  projects: ProjectDto[];
  activeChatId?: string | null;
  activeProjectId?: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: (projectId?: string | null) => void;
  onDeleteChat: (chatId: string) => void;
  onSelectProject: (projectId: string | null) => void;
  onCreateProject: () => void;
  onEditProject: (project: ProjectDto) => void;
  onDeleteProject: (projectId: string) => void;
  keys: AiApiKeyMetadata[];
  telemetry?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalThoughtTokens: number;
    totalCost: number;
  };
}

export function ChatSidebar({
  isOpen,
  onClose,
  chats,
  projects,
  activeChatId,
  activeProjectId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onSelectProject,
  onCreateProject,
  onEditProject,
  onDeleteProject,
  keys,
  telemetry,
}: ChatSidebarProps) {
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<ProjectDto | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (activeProjectId) {
      setExpandedProjects((prev) => ({ ...prev, [activeProjectId]: true }));
    }
  }, [activeProjectId]);

  const toggleProjectExpand = (projectId: string) => {
    setExpandedProjects((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const hasTelemetry =
    activeChatId &&
    telemetry &&
    (telemetry.totalInputTokens > 0 || telemetry.totalOutputTokens > 0 || telemetry.totalCost > 0);

  const formatCost = (cost: number) => {
    if (cost === 0) return "$0.00";
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(3)}`;
  };

  const globalChats = chats.filter((c) => !c.projectId);

  return (
    <>
      <ConfirmDialog
        isOpen={!!chatToDelete}
        title="Delete chat"
        description="Are you sure you want to permanently delete this chat? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={() => {
          if (chatToDelete) {
            onDeleteChat(chatToDelete);
            setChatToDelete(null);
          }
        }}
        onCancel={() => setChatToDelete(null)}
      />

      <ConfirmDialog
        isOpen={!!projectToDelete}
        title="Delete project"
        description={`Are you sure you want to delete project "${projectToDelete?.name}" and all of its chats? This action cannot be undone.`}
        confirmText="Delete Project"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={() => {
          if (projectToDelete) {
            onDeleteProject(projectToDelete.id);
            setProjectToDelete(null);
          }
        }}
        onCancel={() => setProjectToDelete(null)}
      />

      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-60 bg-[#0e0f12] border-r border-white/[0.06] flex flex-col transition-transform duration-150 md:translate-x-0 font-mono ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Top Action */}
        <div className="p-2.5 flex items-center gap-1.5 border-b border-white/[0.04]">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNewChat(activeProjectId)}
            className="flex-1 justify-center gap-1.5 py-1.5 text-xs text-neutral-300 hover:text-white"
          >
            <span>+</span>
            <span>{activeProjectId ? "new project chat" : "new chat"}</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="md:hidden text-neutral-500 hover:text-white text-xs p-1.5 h-auto rounded-lg"
          >
            ✕
          </Button>
        </div>

        {/* Projects & Chats list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4 select-none">
          {/* Projects section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
              <span>projects</span>
              <button
                type="button"
                onClick={onCreateProject}
                className="flex items-center gap-1 text-neutral-400 hover:text-white transition-colors px-1.5 py-0.5 rounded bg-white/[0.03] hover:bg-white/[0.08] cursor-pointer"
                title="Create new project"
              >
                <Plus className="w-3 h-3" />
                <span>new</span>
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="px-2.5 py-2 text-[11px] text-neutral-600">
                no projects yet
              </div>
            ) : (
              <div className="space-y-0.5">
                {projects.map((p) => {
                  const isExpanded = Boolean(expandedProjects[p.id]);
                  const isSelectedProject = activeProjectId === p.id;
                  const projectChats = chats.filter((c) => c.projectId === p.id);

                  return (
                    <div key={p.id} className="space-y-0.5">
                      <div
                        onClick={() => {
                          toggleProjectExpand(p.id);
                          onSelectProject(p.id);
                        }}
                        className={`group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                          isSelectedProject && !activeChatId
                            ? "bg-indigo-500/15 text-indigo-200 border border-indigo-500/20 font-medium"
                            : isSelectedProject
                            ? "bg-white/[0.05] text-neutral-200"
                            : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {isExpanded ? (
                            <ChevronDown className="w-3 h-3 shrink-0 text-neutral-500" />
                          ) : (
                            <ChevronRight className="w-3 h-3 shrink-0 text-neutral-500" />
                          )}
                          {isExpanded ? (
                            <FolderOpen className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                          ) : (
                            <Folder className="w-3.5 h-3.5 shrink-0 text-indigo-400/70" />
                          )}
                          <span className="truncate">{p.name}</span>
                        </div>

                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedProjects((prev) => ({ ...prev, [p.id]: true }));
                              onNewChat(p.id);
                            }}
                            className="p-1 text-neutral-400 hover:text-white rounded hover:bg-white/[0.08]"
                            title="New chat in project"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditProject(p);
                            }}
                            className="p-1 text-neutral-400 hover:text-white rounded hover:bg-white/[0.08]"
                            title="Edit project & system prompt"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectToDelete(p);
                            }}
                            className="p-1 text-neutral-400 hover:text-red-400 rounded hover:bg-white/[0.08]"
                            title="Delete project"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="pl-4 border-l border-white/[0.05] ml-2.5 space-y-0.5 py-0.5">
                          {projectChats.length === 0 ? (
                            <div className="px-2 py-1 text-[10px] text-neutral-600 italic">
                              no chats in project
                            </div>
                          ) : (
                            projectChats.map((c) => {
                              const isActive = c.id === activeChatId;
                              return (
                                <div
                                  key={c.id}
                                  onClick={() => onSelectChat(c.id)}
                                  className={`group flex items-center justify-between px-2 py-1 rounded-md text-[11px] cursor-pointer transition-colors ${
                                    isActive
                                      ? "bg-white/[0.08] text-white font-medium"
                                      : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
                                  }`}
                                >
                                  <span className="truncate pr-1.5">{c.title || "untitled"}</span>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setChatToDelete(c.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 text-xs px-1 py-0 h-auto rounded transition-opacity"
                                    title="delete"
                                  >
                                    ×
                                  </Button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Global chats section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
              <span>chats</span>
              {activeProjectId && (
                <button
                  type="button"
                  onClick={() => onNewChat(null)}
                  className="text-neutral-400 hover:text-white transition-colors px-1.5 py-0.5 rounded bg-white/[0.03] hover:bg-white/[0.08] cursor-pointer"
                  title="New global chat"
                >
                  + global
                </button>
              )}
            </div>

            {globalChats.length === 0 ? (
              <div className="p-3 text-[11px] text-neutral-600 text-center">
                no global chats
              </div>
            ) : (
              globalChats.map((c) => {
                const isActive = c.id === activeChatId;
                return (
                  <div
                    key={c.id}
                    onClick={() => onSelectChat(c.id)}
                    className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                      isActive
                        ? "bg-white/[0.08] text-white font-medium"
                        : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
                    }`}
                  >
                    <span className="truncate pr-2">{c.title || "untitled"}</span>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setChatToDelete(c.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 text-xs px-1 py-0 h-auto rounded transition-opacity"
                      title="delete"
                    >
                      ×
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Telemetry info for active chat */}
        {hasTelemetry && (
          <div className="p-3 border-t border-white/[0.04] space-y-1.5 text-[11px] text-neutral-500">
            <div className="text-[10px] text-neutral-600 uppercase tracking-wider">
              session usage
            </div>
            <div className="flex items-center justify-between text-neutral-400">
              <span>tokens in</span>
              <span className="text-neutral-300 font-mono">
                {telemetry.totalInputTokens.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-neutral-400">
              <span>tokens out</span>
              <span className="text-neutral-300 font-mono">
                {telemetry.totalOutputTokens.toLocaleString()}
              </span>
            </div>
            {telemetry.totalThoughtTokens > 0 && (
              <div className="flex items-center justify-between text-neutral-400">
                <span>thought</span>
                <span className="text-indigo-300 font-mono">
                  {telemetry.totalThoughtTokens.toLocaleString()}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-neutral-400 pt-1 border-t border-white/[0.03]">
              <span>total cost</span>
              <span className="text-emerald-400 font-mono font-medium">
                {formatCost(telemetry.totalCost)}
              </span>
            </div>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="p-3 border-t border-white/[0.04] space-y-1">
          <Link
            href="/analytics"
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-center gap-2">
              <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>analytics</span>
            </div>
            <span className="text-[10px] text-neutral-500 font-mono">stats</span>
          </Link>

          <Link
            href="/settings"
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-3.5 h-3.5 text-neutral-500" />
              <span>settings</span>
            </div>
          </Link>

          <Link
            href="/keys"
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Key className="w-3.5 h-3.5 text-neutral-500" />
              <span>keys</span>
            </div>
            <Badge variant="mono" className="text-[10px] px-1.5 py-0.5">
              {keys.length}
            </Badge>
          </Link>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => lockVaultAction()}
            className="w-full justify-between text-neutral-500 hover:text-red-400 font-normal px-2.5 py-1.5 h-auto rounded-lg"
            title="Lock vault immediately"
          >
            <span>lock vault</span>
            <span className="text-[10px] text-neutral-600 font-mono">1h auto</span>
          </Button>
        </div>
      </aside>
    </>
  );
}
