import "server-only";
import { VaultApiClient } from "@/shared/lib/vault-client";
import { VaultStatusResponse } from "@ai-vault/types";

/**
 * Retrieves the current state of the vault by calling its internal API.
 * Only call this from the server (Server Components, API Routes, Server Actions).
 */
export async function getVaultStatus(): Promise<VaultStatusResponse> {
  try {
    const response = await VaultApiClient.sendGetRequest<VaultStatusResponse>("/status");

    if (response.error) {
      console.error("Error communicating with Vault:", response.error, response.errorDetails);
      throw new Error(`Vault returned an error: ${response.errorDetails || response.error}`);
    }

    if (!response.data) {
      throw new Error("Vault returned no data.");
    }

    return response.data;
  } catch (error) {
    console.error("Failed to connect to Vault service:", error);
    throw new Error("Cannot connect to Vault. Is the service running on port 4000?");
  }
}
