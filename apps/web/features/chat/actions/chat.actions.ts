"use server";

import { z } from "zod";
import { withSafeAction, parseFormData, type ActionResult } from "@/shared/lib/safe-action";
import {
  listChatsService,
  getChatMessagesService,
  sendMessageService,
  deleteChatService,
  listProjectsService,
  createProjectService,
  updateProjectService,
  deleteProjectService,
} from "../services/chat.service";
import { listModelsService } from "../services/models.service";
import { ChatMetadata, ChatMessageDto, SendChatMessageResponse, AiModelMetadata, ProjectDto } from "@ai-vault/types";

export type { ActionResult };

export const listProjectsAction = withSafeAction(
  "listProjectsAction",
  async (): Promise<ProjectDto[]> => listProjectsService()
);

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name cannot be empty."),
  systemPrompt: z.string().optional().default(""),
});

export const createProjectAction = withSafeAction(
  "createProjectAction",
  async (params: { name: string; systemPrompt?: string }): Promise<ProjectDto> => {
    const parsed = createProjectSchema.parse(params);
    return createProjectService(parsed);
  }
);

const updateProjectSchema = z.object({
  id: z.string().min(1, "Project ID is required."),
  name: z.string().trim().min(1, "Project name cannot be empty.").optional(),
  systemPrompt: z.string().optional(),
});

export const updateProjectAction = withSafeAction(
  "updateProjectAction",
  async (params: { id: string; name?: string; systemPrompt?: string }): Promise<ProjectDto> => {
    const parsed = updateProjectSchema.parse(params);
    return updateProjectService(parsed.id, { name: parsed.name, systemPrompt: parsed.systemPrompt });
  }
);

export const deleteProjectAction = withSafeAction(
  "deleteProjectAction",
  async (projectId: string): Promise<boolean> => deleteProjectService(projectId)
);

export const listModelsAction = withSafeAction(
  "listModelsAction",
  async (provider?: string): Promise<AiModelMetadata[]> => listModelsService(provider)
);

export const listChatsAction = withSafeAction(
  "listChatsAction",
  async (limit = 50, offset = 0, projectId?: string | null): Promise<ChatMetadata[]> =>
    listChatsService(limit, offset, projectId)
);

export const getChatMessagesAction = withSafeAction(
  "getChatMessagesAction",
  async (chatId: string, limit = 30, offset = 0, sort = "desc") =>
    getChatMessagesService(chatId, limit, offset, sort)
);

const sendMessageSchema = z.object({
  chatId: z.string().optional().transform((val) => val || undefined),
  projectId: z.string().optional().transform((val) => val || undefined),
  message: z.string().min(1, "Message cannot be empty."),
  provider: z.string().optional().transform((val) => val || undefined),
  model: z.string().optional().transform((val) => val || undefined),
  thinkingLevel: z.enum(["low", "medium", "high", "none"]).optional(),
  fileIds: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? (parsed as string[]) : undefined;
      } catch {
        return val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }),
});

export const sendMessageAction = withSafeAction(
  "sendMessageAction",
  async (formData: FormData): Promise<SendChatMessageResponse> => {
    const parsed = parseFormData(sendMessageSchema, formData);
    return sendMessageService(parsed);
  }
);

export const deleteChatAction = withSafeAction(
  "deleteChatAction",
  async (chatId: string): Promise<boolean> => deleteChatService(chatId)
);
