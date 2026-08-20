import "server-only";
import { VaultApiClient } from "@/shared/lib/vault-client";
import { VaultUnlockResponse } from "@ai-vault/types";

export async function unlockVaultService(password: string): Promise<{ success: boolean; sessionToken?: string }> {
    const response = await VaultApiClient.sendPostRequest<VaultUnlockResponse>("/unlock", {
        password,
    });

    if (response.error || !response.data) {
        throw new Error(response.errorDetails || response.error || "Failed to connect to Vault backend.");
    }

    if (!response.data.success) {
        throw new Error(response.data.error || "Invalid password or recovery code.");
    }

    return { 
        success: response.data.success, 
        sessionToken: response.data.sessionToken 
    };
}
