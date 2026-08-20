"use server";

import {
  listChatsService,
  getChatMessagesService,
  sendMessageService,
  deleteChatService,
} from "../services/chat.service";
import { ChatMetadata, ChatMessageDto, SendChatMessageResponse } from "@ai-vault/types";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function listChatsAction(): Promise<ActionResult<ChatMetadata[]>> {
  try {
    const chats = await listChatsService();
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
  limit?: number,
  offset?: number,
  sort?: string
): Promise<ActionResult<{ chat?: ChatMetadata; messages: ChatMessageDto[] }>> {
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

  try {
    const result = await sendMessageService({
      chatId,
      message,
      provider,
      model,
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
