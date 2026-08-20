"use server";

import { redirect } from "next/navigation";
import { checkRateLimit } from "@/shared/lib/rate-limit";
import { getClientIp } from "@/shared/lib/get-ip";
import { unlockVaultService } from "../services/unlock-vault.service";
import { createSession } from "@/shared/lib/session";

export type UnlockVaultActionResult = {
  success: boolean;
  error?: string;
};

export async function unlockVaultAction(formData: FormData): Promise<UnlockVaultActionResult> {
  const ip = await getClientIp();
  
  // Rate limiting (max 10 attempts per 5 minutes to prevent brute force)
  if (!checkRateLimit(ip, 10, 5 * 60 * 1000)) {
    return { success: false, error: "Too many login attempts. Please try again later." };
  }

  const password = formData.get("password")?.toString() || "";

  if (!password) {
    return { success: false, error: "Password or recovery code is required." };
  }

  let success = false;
  let sessionToken: string | undefined = undefined;
  try {
    const result = await unlockVaultService(password);
    success = result.success;
    sessionToken = result.sessionToken;
  } catch (error: unknown) {
    console.error("[unlockVaultAction] Error:", error);
    
    if (error instanceof Error && error.message.includes("Invalid password")) {
        return { success: false, error: "Invalid password or recovery code." };
    }
    
    return { success: false, error: "An unexpected error occurred." };
  }

  if (success && sessionToken) {
    await createSession(sessionToken);
    // redirect throws a NEXT_REDIRECT error under the hood, so it must be outside the try/catch
    redirect("/app");
  }

  return { success: false, error: "Invalid password or recovery code." };
}
