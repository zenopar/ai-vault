import "server-only";
import { VaultApiClient } from "@/shared/lib/vault-client";
import { fetchWithSession } from "@/shared/lib/session";
import {
  PasskeyChallengeResponse,
  RegisterPasskeyRequest,
  RegisterPasskeyResponse,
  ListPasskeysResponse,
  VerifyPasskeyUnlockRequest,
  VaultUnlockResponse,
  PasskeyDto,
} from "@ai-vault/types";

export async function getPasskeyChallengeService(login = false): Promise<PasskeyChallengeResponse> {
  const path = login ? "/passkeys/challenge?login=true" : "/passkeys/challenge";
  const response = await VaultApiClient.sendGetRequest<PasskeyChallengeResponse>(path);

  if (response.error || !response.data) {
    throw new Error(response.errorDetails || response.error || "Failed to get passkey challenge.");
  }

  return response.data;
}

export async function unlockWithPasskeyService(
  payload: VerifyPasskeyUnlockRequest
): Promise<{ success: boolean; sessionToken?: string }> {
  const response = await VaultApiClient.sendPostRequest<VaultUnlockResponse, VerifyPasskeyUnlockRequest>(
    "/passkeys/unlock",
    payload
  );

  if (response.error || !response.data) {
    let message = response.error || "Failed to verify biometric passkey.";
    if (response.errorDetails) {
      try {
        const parsed = JSON.parse(response.errorDetails);
        if (parsed.error) message = parsed.error;
      } catch {
        message = response.errorDetails;
      }
    }
    throw new Error(message);
  }

  if (!response.data.success) {
    throw new Error(response.data.error || "Biometric authentication failed.");
  }

  return {
    success: response.data.success,
    sessionToken: response.data.sessionToken,
  };
}

export async function listPasskeysService(): Promise<PasskeyDto[]> {
  const response = await fetchWithSession((sessionToken) =>
    VaultApiClient.sendGetRequest<ListPasskeysResponse>("/passkeys", { sessionToken })
  );

  if (response.error || !response.data) {
    throw new Error(response.errorDetails || response.error || "Failed to fetch passkeys.");
  }

  return response.data.passkeys || [];
}

export async function registerPasskeyService(request: RegisterPasskeyRequest): Promise<PasskeyDto> {
  const response = await fetchWithSession((sessionToken) =>
    VaultApiClient.sendPostRequest<RegisterPasskeyResponse, RegisterPasskeyRequest>("/passkeys", request, {
      sessionToken,
    })
  );

  if (response.error || !response.data || !response.data.passkey) {
    throw new Error(response.errorDetails || response.error || "Failed to register passkey.");
  }

  return response.data.passkey;
}

export async function removePasskeyService(id: string): Promise<void> {
  const response = await fetchWithSession((sessionToken) =>
    VaultApiClient.sendDeleteRequest<{ success: boolean }>(`/passkeys/${id}`, { sessionToken })
  );

  if (response.error) {
    throw new Error(response.errorDetails || response.error || "Failed to remove passkey.");
  }
}

