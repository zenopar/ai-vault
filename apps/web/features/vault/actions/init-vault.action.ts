"use server";

import { checkRateLimit } from "@/shared/lib/rate-limit";
import { getClientIp } from "@/shared/lib/get-ip";
import { initVaultService } from "../services/init-vault.service";
import { createSession } from "@/shared/lib/session";
import { redirect } from "next/navigation";

export type InitVaultActionResult = {
  success: boolean;
  recoveryPassword?: string;
  sessionToken?: string;
  error?: string;
};

export async function initVaultAction(formData: FormData): Promise<InitVaultActionResult> {
  const masterPassword = formData.get("masterPassword")?.toString() || "";

  const ip = await getClientIp();
  if (!checkRateLimit(ip, 5, 15 * 60 * 1000)) {
    return { success: false, error: "Too many attempts. Please try again in 15 minutes." };
  }

  if (!masterPassword || masterPassword.length < 16 || masterPassword.length > 128) {
    return { success: false, error: "Master password must be between 16 and 128 characters long." };
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/;
  if (!passwordRegex.test(masterPassword)) {
    return { success: false, error: "Master password does not meet complexity requirements." };
  }

  try {
    const result = await initVaultService(masterPassword);

    return {
      success: true,
      recoveryPassword: result.recoveryPassword,
      sessionToken: result.sessionToken,
    };
  } catch (error: unknown) {
    console.error("[initVaultAction] Critical error:", error);
    return { success: false, error: "An unexpected error occurred during initialization." };
  }
}

export async function completeInitAction(sessionToken: string): Promise<void> {
  if (sessionToken) {
    await createSession(sessionToken);
  }
  redirect("/app");
}