"use server";

import {
  listChatsService,
  getChatMessagesService,
  sendMessageService,
  deleteChatService,
} from "../services/chat.service";
import { listModelsService } from "../services/models.service";
import { ChatMetadata, ChatMessageDto, SendChatMessageResponse, AiModelMetadata } from "@ai-vault/types";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function listModelsAction(provider?: string): Promise<ActionResult<AiModelMetadata[]>> {
  try {
    const models = await listModelsService(provider);
    return { success: true, data: models };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load models.",
    };
  }
}

export async function listChatsAction(limit = 50, offset = 0): Promise<ActionResult<ChatMetadata[]>> {
  try {
    const chats = await listChatsService(limit, offset);
    return { success: true, data: chats };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load chats.",
    };
  }
}

export async function getChatMessagesAction(
  chatId: string,
  limit = 30,
  offset = 0,
  sort = "desc"
): Promise<ActionResult<{ chat?: ChatMetadata; messages: ChatMessageDto[]; hasMore: boolean; total: number }>> {
  try {
    const result = await getChatMessagesService(chatId, limit, offset, sort);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load messages.",
    };
  }
}

export async function sendMessageAction(formData: FormData): Promise<ActionResult<SendChatMessageResponse>> {
  const chatId = (formData.get("chatId") as string) || undefined;
  const message = (formData.get("message") as string) || "";
  const provider = (formData.get("provider") as string) || undefined;
  const model = (formData.get("model") as string) || undefined;
  const thinkingLevel = (formData.get("thinkingLevel") as "low" | "medium" | "high" | "none") || undefined;

  try {
    const result = await sendMessageService({
      chatId,
      message,
      provider,
      model,
      thinkingLevel,
    });
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send message.",
    };
  }
}

export async function deleteChatAction(chatId: string): Promise<ActionResult<boolean>> {
  try {
    const result = await deleteChatService(chatId);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete chat.",
    };
  }
}

