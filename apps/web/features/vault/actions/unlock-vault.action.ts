"use server";

import { redirect } from "next/navigation";
import { verifySolution } from "altcha-lib/v1";
import { checkRateLimit, checkBruteForceLock, recordFailedAttempt, clearFailedAttempts } from "@/shared/lib/rate-limit";
import { getClientIp } from "@/shared/lib/get-ip";
import { unlockVaultService } from "../services/unlock-vault.service";
import { createSession } from "@/shared/lib/session";
import { getAltchaSecret } from "@/shared/lib/altcha-secret";

export type UnlockVaultActionResult = {
  success: boolean;
  error?: string;
};

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

  // 3. Verify Altcha (Proof of Work)
  const altchaPayload = formData.get("altcha")?.toString();
  if (!altchaPayload) {
    recordFailedAttempt(ip);
    return { success: false, error: "Proof of work (Altcha) is required. Please solve the captcha." };
  }

  try {
    const isValidAltcha = await verifySolution(altchaPayload, getAltchaSecret());
    if (!isValidAltcha) {
      recordFailedAttempt(ip);
      return { success: false, error: "Invalid proof of work." };
    }
  } catch (error) {
    console.error("Altcha verification error:", error);
    return { success: false, error: "Proof of work verification failed." };
  }

  // 4. Verify Password
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
    
    // Record failed attempt for progressive delay
    recordFailedAttempt(ip);
    
    if (error instanceof Error && error.message.includes("Invalid password")) {
        return { success: false, error: "Invalid password or recovery code." };
    }
    
    return { success: false, error: "An unexpected error occurred." };
  }

  if (success && sessionToken) {
    // Clear failed attempts on successful login
    clearFailedAttempts(ip);
    
    await createSession(sessionToken);
    // redirect throws a NEXT_REDIRECT error under the hood, so it must be outside the try/catch
    redirect("/app");
  }
  
  // If we reach here without throwing, it's still a failure
  recordFailedAttempt(ip);
  return { success: false, error: "Invalid password or recovery code." };
}
