"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { verifySolution } from "altcha-lib/v1";
import { checkRateLimit, checkBruteForceLock, recordFailedAttempt, clearFailedAttempts } from "@/shared/lib/rate-limit";
import { getClientIp } from "@/shared/lib/get-ip";
import { unlockVaultService } from "../services/unlock-vault.service";
import { createSession } from "@/shared/lib/session";
import { getAltchaSecret } from "@/shared/lib/altcha-secret";
import { parseFormData } from "@/shared/lib/safe-action";

export type UnlockVaultActionResult = {
  success: boolean;
  error?: string;
};

const unlockVaultSchema = z.object({
  altcha: z.string().min(1, "Proof of work (Altcha) is required. Please solve the captcha."),
  password: z.string().min(1, "Password or recovery code is required."),
});

export async function unlockVaultAction(formData: FormData): Promise<UnlockVaultActionResult> {
  const ip = await getClientIp();
  
  // 1. Check brute force lockout (Progressive delay)
  const lockoutRemainingMs = checkBruteForceLock(ip);
  if (lockoutRemainingMs > 0) {
    const seconds = Math.ceil(lockoutRemainingMs / 1000);
    return { success: false, error: `Too many failed attempts. Try again in ${seconds} seconds.` };
  }

  // 2. Generic Rate limiting (max 10 attempts per 5 minutes to prevent spam)
  if (!checkRateLimit(ip, 10, 5 * 60 * 1000)) {
    return { success: false, error: "Too many login attempts. Please try again later." };
  }

  // 3. Validate form data with Zod
  let altcha: string;
  let password: string;
  try {
    const parsed = parseFormData(unlockVaultSchema, formData);
    altcha = parsed.altcha;
    password = parsed.password;
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      recordFailedAttempt(ip);
      return { success: false, error: err.issues[0]?.message || "Validation failed." };
    }
    return { success: false, error: "Invalid form submission." };
  }

  // 4. Verify Altcha (Proof of Work)
  try {
    const isValidAltcha = await verifySolution(altcha, getAltchaSecret());
    if (!isValidAltcha) {
      recordFailedAttempt(ip);
      return { success: false, error: "Invalid proof of work." };
    }
  } catch (error) {
    console.error("Altcha verification error:", error);
    return { success: false, error: "Proof of work verification failed." };
  }

  // 5. Verify Password & Unlock
  let success = false;
  let sessionToken: string | undefined = undefined;
  try {
    const result = await unlockVaultService(password);
    success = result.success;
    sessionToken = result.sessionToken;
  } catch (error: unknown) {
    console.error("[unlockVaultAction] Error:", error);
    recordFailedAttempt(ip);
    
    if (error instanceof Error && error.message.includes("Invalid password")) {
      return { success: false, error: "Invalid password or recovery code." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }

  if (success && sessionToken) {
    clearFailedAttempts(ip);
    await createSession(sessionToken);
    redirect("/app");
  }
  
  recordFailedAttempt(ip);
  return { success: false, error: "Invalid password or recovery code." };
}
