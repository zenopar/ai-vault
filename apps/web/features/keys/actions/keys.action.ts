"use server";

import { revalidatePath } from "next/cache";
import { addApiKeyService, deleteApiKeyService, addModelService, deleteModelService } from "../services/keys.service";
import { AiApiKeyMetadata, AiModelMetadata } from "@ai-vault/types";

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
  const baseUrl = formData.get("baseUrl")?.toString()?.trim() || undefined;

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
    const key = await addApiKeyService({ provider, name, apiKey, baseUrl });
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

export type AddModelActionResult = {
  success: boolean;
  model?: AiModelMetadata;
  error?: string;
};

export async function addModelAction(formData: FormData): Promise<AddModelActionResult> {
  const provider = formData.get("provider")?.toString()?.trim() || "";
  const name = formData.get("name")?.toString()?.trim() || "";
  const displayName = formData.get("displayName")?.toString()?.trim() || name;

  if (!provider || !name) {
    return { success: false, error: "Provider and Model Name are required." };
  }

  try {
    const model = await addModelService({ provider, name, displayName });
    revalidatePath("/keys");
    return { success: true, model };
  } catch (err: unknown) {
    console.error("[addModelAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to add model.",
    };
  }
}

export type DeleteModelActionResult = {
  success: boolean;
  error?: string;
};

export async function deleteModelAction(modelId: string): Promise<DeleteModelActionResult> {
  if (!modelId || typeof modelId !== "string") {
    return { success: false, error: "Invalid Model ID." };
  }

  try {
    await deleteModelService(modelId);
    revalidatePath("/keys");
    return { success: true };
  } catch (err: unknown) {
    console.error("[deleteModelAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete model.",
    };
  }
}
