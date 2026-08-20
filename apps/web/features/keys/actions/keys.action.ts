"use server";

import { revalidatePath } from "next/cache";
import { addApiKeyService, deleteApiKeyService } from "../services/keys.service";
import { AiApiKeyMetadata } from "@ai-vault/types";

export type AddApiKeyActionResult = {
  success: boolean;
  key?: AiApiKeyMetadata;
  error?: string;
};

export type DeleteApiKeyActionResult = {
  success: boolean;
  error?: string;
};

export async function addApiKeyAction(formData: FormData): Promise<AddApiKeyActionResult> {
  const provider = formData.get("provider")?.toString()?.trim() || "";
  const name = formData.get("name")?.toString()?.trim() || "";
  const apiKey = formData.get("apiKey")?.toString()?.trim() || "";

  if (!provider) {
    return { success: false, error: "Please select an AI provider." };
  }
  if (!name) {
    return { success: false, error: "Please provide a name for this key." };
  }
  if (!apiKey) {
    return { success: false, error: "API Key cannot be empty." };
  }

  try {
    const key = await addApiKeyService({ provider, name, apiKey });
    revalidatePath("/keys");
    return { success: true, key };
  } catch (err: unknown) {
    console.error("[addApiKeyAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to add API key.",
    };
  }
}

export async function deleteApiKeyAction(keyId: string): Promise<DeleteApiKeyActionResult> {
  if (!keyId || typeof keyId !== "string") {
    return { success: false, error: "Invalid Key ID." };
  }

  try {
    await deleteApiKeyService(keyId);
    revalidatePath("/keys");
    return { success: true };
  } catch (err: unknown) {
    console.error("[deleteApiKeyAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete API key.",
    };
  }
}
