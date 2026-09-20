"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withSafeAction, parseFormData } from "@/shared/lib/safe-action";
import { addApiKeyService, deleteApiKeyService, addModelService, deleteModelService } from "../services/keys.service";
import { AiApiKeyMetadata, AiModelMetadata } from "@ai-vault/types";

export type AddApiKeyActionResult = {
  success: boolean;
  key?: AiApiKeyMetadata;
  data?: AiApiKeyMetadata;
  error?: string;
};

export type DeleteApiKeyActionResult = {
  success: boolean;
  error?: string;
};

export type AddModelActionResult = {
  success: boolean;
  model?: AiModelMetadata;
  data?: AiModelMetadata;
  error?: string;
};

export type DeleteModelActionResult = {
  success: boolean;
  error?: string;
};

const addApiKeySchema = z.object({
  provider: z.string().trim().min(1, "Please select an AI provider."),
  name: z.string().trim().min(1, "Please provide a name for this key."),
  apiKey: z.string().trim().min(1, "API Key cannot be empty."),
  baseUrl: z.string().trim().optional().transform((val) => val || undefined),
});

export async function addApiKeyAction(formData: FormData): Promise<AddApiKeyActionResult> {
  const wrapped = withSafeAction("addApiKeyAction", async () => {
    const parsed = parseFormData(addApiKeySchema, formData);
    const key = await addApiKeyService(parsed);
    revalidatePath("/keys");
    return key;
  });
  const res = await wrapped();
  return {
    success: res.success,
    key: res.data,
    data: res.data,
    error: res.error,
  };
}

export async function deleteApiKeyAction(keyId: string): Promise<DeleteApiKeyActionResult> {
  const wrapped = withSafeAction("deleteApiKeyAction", async () => {
    const validId = z.string().min(1, "Invalid Key ID.").parse(keyId);
    await deleteApiKeyService(validId);
    revalidatePath("/keys");
  });
  const res = await wrapped();
  return {
    success: res.success,
    error: res.error,
  };
}

const addModelSchema = z.object({
  provider: z.string().trim().min(1, "Provider and Model Name are required."),
  name: z.string().trim().min(1, "Provider and Model Name are required."),
  displayName: z.string().trim().optional(),
}).transform((val) => ({
  provider: val.provider,
  name: val.name,
  displayName: val.displayName || val.name,
}));

export async function addModelAction(formData: FormData): Promise<AddModelActionResult> {
  const wrapped = withSafeAction("addModelAction", async () => {
    const parsed = parseFormData(addModelSchema, formData);
    const model = await addModelService(parsed);
    revalidatePath("/keys");
    return model;
  });
  const res = await wrapped();
  return {
    success: res.success,
    model: res.data,
    data: res.data,
    error: res.error,
  };
}

export async function deleteModelAction(modelId: string): Promise<DeleteModelActionResult> {
  const wrapped = withSafeAction("deleteModelAction", async () => {
    const validId = z.string().min(1, "Invalid Model ID.").parse(modelId);
    await deleteModelService(validId);
    revalidatePath("/keys");
  });
  const res = await wrapped();
  return {
    success: res.success,
    error: res.error,
  };
}
