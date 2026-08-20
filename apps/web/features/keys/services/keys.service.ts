import "server-only";
import { VaultApiClient } from "@/shared/lib/vault-client";
import { getSessionToken } from "@/shared/lib/session";
import { ListApiKeysResponse, AddApiKeyResponse, AiApiKeyMetadata } from "@ai-vault/types";

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
}): Promise<AiApiKeyMetadata> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    throw new Error("No active session. Please unlock the vault.");
  }

  const response = await VaultApiClient.sendPostRequest<AddApiKeyResponse>("/keys", {
    provider: params.provider,
    name: params.name,
    apiKey: params.apiKey,
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
