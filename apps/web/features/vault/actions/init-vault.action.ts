"use server";

import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/shared/lib/rate-limit";
import { getClientIp } from "@/shared/lib/get-ip";
import { initVaultService } from "../services/init-vault.service";

export type InitVaultActionResult = {
  success: boolean;
  recoveryPassword?: string;
  error?: string;
};

export async function initVaultAction(masterPassword: string): Promise<InitVaultActionResult> {
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
    const recoveryPassword = await initVaultService(masterPassword);

    revalidatePath("/");

    return { success: true, recoveryPassword };
  } catch (error: any) {
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}