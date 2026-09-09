"use server";

import { withSafeAction } from "@/shared/lib/safe-action";
import { getSettingsService, updateSettingsService } from "../services/settings.service";
import { SettingsDto, UpdateSettingsRequest } from "@ai-vault/types";

export interface SettingsActionResult {
  success: boolean;
  settings?: SettingsDto;
  error?: string;
}

export async function getSettingsAction(): Promise<SettingsActionResult> {
  const wrapped = withSafeAction("getSettingsAction", async () => {
    const data = await getSettingsService();
    return data.settings;
  });
  const res = await wrapped();
  return {
    success: res.success,
    settings: res.data,
    error: res.error,
  };
}

export async function updateSettingsAction(request: UpdateSettingsRequest): Promise<SettingsActionResult> {
  const wrapped = withSafeAction("updateSettingsAction", async () => {
    const data = await updateSettingsService(request);
    return data.settings;
  });
  const res = await wrapped();
  return {
    success: res.success,
    settings: res.data,
    error: res.error,
  };
}
