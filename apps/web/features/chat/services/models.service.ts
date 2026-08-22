import "server-only";
import { VaultApiClient } from "@/shared/lib/vault-client";
import { getSessionToken } from "@/shared/lib/session";
import { ListModelsResponse, AiModelMetadata } from "@ai-vault/types";

export async function listModelsService(provider?: string): Promise<AiModelMetadata[]> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    throw new Error("No active session. Please unlock the vault.");
  }

  const query = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  const response = await VaultApiClient.sendGetRequest<ListModelsResponse>(`/models${query}`, {
    sessionToken,
  });

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  if (!response.data || !response.data.success) {
    throw new Error(response.data?.error || "Failed to retrieve AI models.");
  }

  return response.data.models || [];
}
