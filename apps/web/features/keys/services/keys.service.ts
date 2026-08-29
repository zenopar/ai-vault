import "server-only";
import { VaultApiClient } from "@/shared/lib/vault-client";
import { getSessionToken } from "@/shared/lib/session";
import { ListApiKeysResponse, AddApiKeyResponse, AiApiKeyMetadata, AiModelMetadata } from "@ai-vault/types";

export async function listApiKeysService(): Promise<AiApiKeyMetadata[]> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    throw new Error("No active session. Please unlock the vault.");
  }

  const response = await VaultApiClient.sendGetRequest<ListApiKeysResponse>("/keys", {
    sessionToken,
  });

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  if (!response.data || !response.data.success) {
    throw new Error(response.data?.error || "Failed to retrieve API keys.");
  }

  return response.data.keys || [];
}

export async function addApiKeyService(params: {
  provider: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
}): Promise<AiApiKeyMetadata> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    throw new Error("No active session. Please unlock the vault.");
  }

  const response = await VaultApiClient.sendPostRequest<AddApiKeyResponse>("/keys", {
    provider: params.provider,
    name: params.name,
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    sessionToken,
  }, {
    sessionToken,
  });

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  if (!response.data || !response.data.success || !response.data.key) {
    throw new Error(response.data?.error || "Failed to save API key.");
  }

  return response.data.key;
}

export async function deleteApiKeyService(id: string): Promise<boolean> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    throw new Error("No active session. Please unlock the vault.");
  }

  const response = await VaultApiClient.sendDeleteRequest<{ success: boolean }>(`/keys/${id}`, {
    sessionToken,
  });

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  return Boolean(response.data?.success);
}

export async function addModelService(params: {
  provider: string;
  name: string;
  displayName: string;
}): Promise<AiModelMetadata> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    throw new Error("No active session. Please unlock the vault.");
  }

  const response = await VaultApiClient.sendPostRequest<{ success: boolean; model?: AiModelMetadata; error?: string }>("/models", {
    provider: params.provider,
    name: params.name,
    displayName: params.displayName,
    sessionToken,
  }, {
    sessionToken,
  });

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  if (!response.data || !response.data.success || !response.data.model) {
    throw new Error(response.data?.error || "Failed to add model.");
  }

  return response.data.model;
}

export async function deleteModelService(id: string): Promise<boolean> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    throw new Error("No active session. Please unlock the vault.");
  }

  const response = await VaultApiClient.sendDeleteRequest<{ success: boolean }>(`/models/${id}`, {
    sessionToken,
  });

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  return Boolean(response.data?.success);
}
