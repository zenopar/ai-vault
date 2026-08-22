import "server-only";
import { VaultApiClient } from "@/shared/lib/vault-client";
import { GetSettingsResponse, UpdateSettingsRequest, UpdateSettingsResponse } from "@ai-vault/types";

export async function getSettingsService(sessionToken: string): Promise<GetSettingsResponse> {
    const response = await VaultApiClient.sendGetRequest<GetSettingsResponse>("/settings", { sessionToken });

    if (response.error || !response.data) {
        throw new Error(response.errorDetails || response.error || "Failed to connect to Vault backend.");
    }

    if (!response.data.success) {
        throw new Error(response.data.error || "Failed to fetch settings.");
    }

    return response.data;
}

export async function updateSettingsService(sessionToken: string, request: UpdateSettingsRequest): Promise<UpdateSettingsResponse> {
    const response = await VaultApiClient.sendPutRequest<UpdateSettingsResponse, UpdateSettingsRequest>("/settings", request, { sessionToken });

    if (response.error || !response.data) {
        throw new Error(response.errorDetails || response.error || "Failed to connect to Vault backend.");
    }

    if (!response.data.success) {
        throw new Error(response.data.error || "Failed to update settings.");
    }

    return response.data;
}
