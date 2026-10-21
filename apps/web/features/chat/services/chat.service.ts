import "server-only";
import { VaultApiClient } from "@/shared/lib/vault-client";
import { fetchWithSession } from "@/shared/lib/session";
import {
  ListChatsResponse,
  GetChatMessagesResponse,
  SendChatMessageResponse,
  ChatMetadata,
  ChatMessageDto,
  ListProjectsResponse,
  ProjectResponse,
  ProjectDto,
} from "@ai-vault/types";

export async function listProjectsService(): Promise<ProjectDto[]> {
  const response = await fetchWithSession((sessionToken) =>
    VaultApiClient.sendGetRequest<ListProjectsResponse>("/projects", { sessionToken })
  );

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  if (!response.data || !response.data.success) {
    throw new Error(response.data?.error || "Failed to retrieve projects.");
  }

  return response.data.projects || [];
}

export async function createProjectService(params: {
  name: string;
  systemPrompt?: string;
}): Promise<ProjectDto> {
  const response = await fetchWithSession((sessionToken) =>
    VaultApiClient.sendPostRequest<ProjectResponse>(
      "/projects",
      {
        name: params.name,
        systemPrompt: params.systemPrompt,
      },
      { sessionToken }
    )
  );

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  if (!response.data || !response.data.success || !response.data.project) {
    throw new Error(response.data?.error || "Failed to create project.");
  }

  return response.data.project;
}

export async function updateProjectService(
  id: string,
  params: { name?: string; systemPrompt?: string }
): Promise<ProjectDto> {
  const response = await fetchWithSession((sessionToken) =>
    VaultApiClient.sendPutRequest<ProjectResponse>(
      `/projects/${encodeURIComponent(id)}`,
      params,
      { sessionToken }
    )
  );

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  if (!response.data || !response.data.success || !response.data.project) {
    throw new Error(response.data?.error || "Failed to update project.");
  }

  return response.data.project;
}

export async function deleteProjectService(id: string): Promise<boolean> {
  const response = await fetchWithSession((sessionToken) =>
    VaultApiClient.sendDeleteRequest<{ success: boolean }>(
      `/projects/${encodeURIComponent(id)}`,
      { sessionToken }
    )
  );

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  return Boolean(response.data?.success);
}

export async function listChatsService(limit = 50, offset = 0, projectId?: string | null): Promise<ChatMetadata[]> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.append("limit", limit.toString());
  if (offset !== undefined) params.append("offset", offset.toString());
  if (projectId !== undefined) params.append("projectId", projectId === null ? "null" : projectId);
  const query = params.toString() ? `?${params.toString()}` : "";

  const response = await fetchWithSession((sessionToken) =>
    VaultApiClient.sendGetRequest<ListChatsResponse>(`/chats${query}`, { sessionToken })
  );

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
  limit = 30,
  offset = 0,
  sort = "desc"
): Promise<{
  chat?: ChatMetadata;
  messages: ChatMessageDto[];
  hasMore: boolean;
  total: number;
}> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.append("limit", limit.toString());
  if (offset !== undefined) params.append("offset", offset.toString());
  if (sort) params.append("sort", sort);
  const query = params.toString() ? `?${params.toString()}` : "";

  const response = await fetchWithSession((sessionToken) =>
    VaultApiClient.sendGetRequest<GetChatMessagesResponse>(
      `/chats/${encodeURIComponent(chatId)}/messages${query}`,
      { sessionToken }
    )
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
    hasMore: Boolean(response.data.hasMore),
    total: response.data.total ?? (response.data.messages?.length || 0),
  };
}

export async function sendMessageService(params: {
  chatId?: string;
  projectId?: string | null;
  message: string;
  provider?: string;
  model?: string;
  thinkingLevel?: "low" | "medium" | "high" | "none" | string;
  fileIds?: string[];
}): Promise<SendChatMessageResponse> {
  const response = await fetchWithSession((sessionToken) =>
    VaultApiClient.sendPostRequest<SendChatMessageResponse>(
      "/chats/messages",
      {
        chatId: params.chatId,
        projectId: params.projectId,
        message: params.message,
        provider: params.provider,
        model: params.model,
        thinkingLevel: params.thinkingLevel,
        fileIds: params.fileIds,
      },
      { sessionToken }
    )
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
  const response = await fetchWithSession((sessionToken) =>
    VaultApiClient.sendDeleteRequest<{ success: boolean }>(
      `/chats/${encodeURIComponent(chatId)}`,
      { sessionToken }
    )
  );

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  return Boolean(response.data?.success);
}

