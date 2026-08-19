import "server-only";
import { VaultApiClient } from "@/shared/lib/vault-client";
import { VaultInitResponse } from "@ai-vault/types";

export async function initVaultService(masterPassword: string): Promise<string | undefined> {
    const response = await VaultApiClient.sendPostRequest<VaultInitResponse>("/init", {
        masterPassword,
    });

    if (response.error || !response.data) {
        throw new Error(response.errorDetails || response.error || "Failed to connect to Vault backend.");
    }

    if (!response.data.success) {
        throw new Error(response.data.error || "Vault initialization failed.");
    }

    return response.data.recoveryPassword;
}