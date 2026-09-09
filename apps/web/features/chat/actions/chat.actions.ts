"use server";

import { z } from "zod";
import { withSafeAction, parseFormData, type ActionResult } from "@/shared/lib/safe-action";
import {
  listChatsService,
  getChatMessagesService,
  sendMessageService,
  deleteChatService,
} from "../services/chat.service";
import { listModelsService } from "../services/models.service";
import { ChatMetadata, ChatMessageDto, SendChatMessageResponse, AiModelMetadata } from "@ai-vault/types";

export type { ActionResult };

export const listModelsAction = withSafeAction(
  "listModelsAction",
  async (provider?: string): Promise<AiModelMetadata[]> => listModelsService(provider)
);

export const listChatsAction = withSafeAction(
  "listChatsAction",
  async (limit = 50, offset = 0): Promise<ChatMetadata[]> => listChatsService(limit, offset)
);

export const getChatMessagesAction = withSafeAction(
  "getChatMessagesAction",
  async (chatId: string, limit = 30, offset = 0, sort = "desc") =>
    getChatMessagesService(chatId, limit, offset, sort)
);

export const sendMessageSchema = z.object({
  chatId: z.string().optional().transform((val) => val || undefined),
  message: z.string().min(1, "Message cannot be empty."),
  provider: z.string().optional().transform((val) => val || undefined),
  model: z.string().optional().transform((val) => val || undefined),
  thinkingLevel: z.enum(["low", "medium", "high", "none"]).optional(),
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
