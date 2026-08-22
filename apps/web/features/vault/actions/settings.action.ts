"use server";

import { getSessionToken } from "@/shared/lib/session";
import { getSettingsService, updateSettingsService } from "../services/settings.service";
import { SettingsDto, UpdateSettingsRequest } from "@ai-vault/types";

export async function getSettingsAction(): Promise<{ success: boolean; settings?: SettingsDto; error?: string }> {
    try {
        const token = await getSessionToken();
        if (!token) {
            return { success: false, error: "Not authenticated. Please unlock your vault." };
        }

        const data = await getSettingsService(token);
        return { success: true, settings: data.settings };
    } catch (error: any) {
        console.error("Get Settings Error:", error);
        return { success: false, error: error.message || "Failed to load settings." };
    }
}

export async function updateSettingsAction(request: UpdateSettingsRequest): Promise<{ success: boolean; settings?: SettingsDto; error?: string }> {
    try {
        const token = await getSessionToken();
        if (!token) {
            return { success: false, error: "Not authenticated. Please unlock your vault." };
        }

        const data = await updateSettingsService(token, request);
        return { success: true, settings: data.settings };
    } catch (error: any) {
        console.error("Update Settings Error:", error);
        return { success: false, error: error.message || "Failed to update settings." };
    }
}
