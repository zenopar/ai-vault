"use server";

import { VaultApiClient } from "@/shared/lib/vault-client";
import { VaultInitResponse } from "@ai-vault/types";
import { revalidatePath } from "next/cache";

export type InitVaultActionResult = {
  success: boolean;
  recoveryPassword?: string;
  error?: string;
};

export async function initVaultAction(masterPassword: string): Promise<InitVaultActionResult> {
  // 1. Strict password validation
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{16,}$/;
  if (!masterPassword || !passwordRegex.test(masterPassword)) {
    return {
      success: false,
      error: "Master password must be at least 16 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.",
    };
  }

  try {
    // 2. Send the request to the secure Node.js Vault service
    const response = await VaultApiClient.sendPostRequest<VaultInitResponse>("/init", {
      masterPassword,
    });

    // 3. Handle network/IPC errors (e.g. Vault is offline)
    if (response.error || !response.data) {
      return {
        success: false,
        error: response.errorDetails || response.error || "Failed to connect to Vault backend.",
      };
    }

    // 4. Handle Vault business logic errors (e.g. already initialized)
    if (!response.data.success) {
      return {
        success: false,
        error: response.data.error || "Vault initialization failed.",
      };
    }

    // 5. Success! Revalidate the cache so Next.js components realize the vault is now unlocked
    revalidatePath("/");

    return {
      success: true,
      recoveryPassword: response.data.recoveryPassword,
    };
  } catch (error) {
    return {
      success: false,
      error: "An unexpected error occurred during initialization.",
    };
  }
}
