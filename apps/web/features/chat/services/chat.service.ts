import "server-only";
import { VaultApiClient } from "@/shared/lib/vault-client";
import { getSessionToken } from "@/shared/lib/session";
import {
  ListChatsResponse,
  GetChatMessagesResponse,
  SendChatMessageResponse,
  ChatMetadata,
  ChatMessageDto,
} from "@ai-vault/types";

export async function listChatsService(): Promise<ChatMetadata[]> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    throw new Error("No active session. Please unlock the vault.");
  }

  const response = await VaultApiClient.sendGetRequest<ListChatsResponse>("/chats", {
    sessionToken,
  });

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  if (!response.data || !response.data.success) {
    throw new Error(response.data?.error || "Failed to retrieve chats.");
  }

  return response.data.chats || [];
}

export async function getChatMessagesService(
  chatId: string,
  limit?: number,
  offset?: number,
  sort?: string
): Promise<{
  chat?: ChatMetadata;
  messages: ChatMessageDto[];
}> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    throw new Error("No active session. Please unlock the vault.");
  }

  const params = new URLSearchParams();
  if (limit) params.append("limit", limit.toString());
  if (offset) params.append("offset", offset.toString());
  if (sort) params.append("sort", sort);
  const query = params.toString() ? `?${params.toString()}` : "";

  const response = await VaultApiClient.sendGetRequest<GetChatMessagesResponse>(
    `/chats/${encodeURIComponent(chatId)}/messages${query}`,
    {
      sessionToken,
    }
  );

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  if (!response.data || !response.data.success) {
    throw new Error(response.data?.error || "Failed to retrieve chat messages.");
  }

  return {
    chat: response.data.chat,
    messages: response.data.messages || [],
  };
}

export async function sendMessageService(params: {
  chatId?: string;
  message: string;
  provider?: string;
  model?: string;
}): Promise<SendChatMessageResponse> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    throw new Error("No active session. Please unlock the vault.");
  }

  const response = await VaultApiClient.sendPostRequest<SendChatMessageResponse>(
    "/chats/messages",
    {
      chatId: params.chatId,
      message: params.message,
      provider: params.provider,
      model: params.model,
    },
    {
      sessionToken,
    }
  );

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  if (!response.data || !response.data.success) {
    throw new Error(response.data?.error || "Failed to process chat message.");
  }

  return response.data;
}

export async function deleteChatService(chatId: string): Promise<boolean> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    throw new Error("No active session. Please unlock the vault.");
  }

  const response = await VaultApiClient.sendDeleteRequest<{ success: boolean }>(
    `/chats/${encodeURIComponent(chatId)}`,
    {
      sessionToken,
    }
  );

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  return Boolean(response.data?.success);
}
