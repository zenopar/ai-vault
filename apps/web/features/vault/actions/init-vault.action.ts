"use server";

import { z } from "zod";
import { checkRateLimit } from "@/shared/lib/rate-limit";
import { getClientIp } from "@/shared/lib/get-ip";
import { initVaultService } from "../services/init-vault.service";
import { createSession } from "@/shared/lib/session";
import { redirect } from "next/navigation";
import { withSafeAction, parseFormData } from "@/shared/lib/safe-action";

export type InitVaultActionResult = {
  success: boolean;
  recoveryPassword?: string;
  sessionToken?: string;
  error?: string;
};

const initVaultSchema = z.object({
  masterPassword: z
    .string()
    .min(16, "Master password must be between 16 and 128 characters long.")
    .max(128, "Master password must be between 16 and 128 characters long.")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).*$/,
      "Master password does not meet complexity requirements."
    ),
});

export async function initVaultAction(formData: FormData): Promise<InitVaultActionResult> {
  const ip = await getClientIp();
  if (!checkRateLimit(ip, 5, 15 * 60 * 1000)) {
    return { success: false, error: "Too many attempts. Please try again in 15 minutes." };
  }

  const wrapped = withSafeAction("initVaultAction", async () => {
    const { masterPassword } = parseFormData(initVaultSchema, formData);
    return initVaultService(masterPassword);
  });

  const res = await wrapped();
  if (!res.success) {
    return {
      success: false,
      error: res.error || "An unexpected error occurred during initialization.",
    };
  }

  return {
    success: true,
    recoveryPassword: res.data?.recoveryPassword,
    sessionToken: res.data?.sessionToken,
  };
}

export async function completeInitAction(sessionToken: string): Promise<void> {
  if (sessionToken) {
    await createSession(sessionToken);
  }
  redirect("/app");
}