"use server";

import { redirect } from "next/navigation";
import { withSafeAction } from "@/shared/lib/safe-action";
import { createSession } from "@/shared/lib/session";
import { getClientIp } from "@/shared/lib/get-ip";
import {
  checkRateLimit,
  checkBruteForceLock,
  recordFailedAttempt,
  clearFailedAttempts,
} from "@/shared/lib/rate-limit";
import {
  getPasskeyChallengeService,
  unlockWithPasskeyService,
  listPasskeysService,
  registerPasskeyService,
  removePasskeyService,
} from "../services/passkey.service";
import {
  PasskeyChallengeResponse,
  RegisterPasskeyRequest,
  VerifyPasskeyUnlockRequest,
  PasskeyDto,
} from "@ai-vault/types";

export async function getPasskeyChallengeAction(login = false): Promise<PasskeyChallengeResponse> {
  try {
    return await getPasskeyChallengeService(login);
  } catch (err: unknown) {
    return {
      success: false,
      challenge: "",
      error: err instanceof Error ? err.message : "Failed to generate challenge.",
    };
  }
}

export async function unlockWithPasskeyAction(
  payload: VerifyPasskeyUnlockRequest
): Promise<{ success: boolean; error?: string }> {
  const ip = await getClientIp();

  const lockoutRemainingMs = checkBruteForceLock(ip);
  if (lockoutRemainingMs > 0) {
    const seconds = Math.ceil(lockoutRemainingMs / 1000);
    return { success: false, error: `Too many failed attempts. Try again in ${seconds} seconds.` };
  }

  if (!checkRateLimit(ip, 15, 5 * 60 * 1000)) {
    return { success: false, error: "Too many login attempts. Please try again later." };
  }

  let sessionToken: string | undefined;
  try {
    const result = await unlockWithPasskeyService(payload);
    if (result.success && result.sessionToken) {
      sessionToken = result.sessionToken;
    }
  } catch (err: unknown) {
    recordFailedAttempt(ip);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Biometric verification failed.",
    };
  }

  if (sessionToken) {
    clearFailedAttempts(ip);
    await createSession(sessionToken);
    redirect("/app");
  }

  recordFailedAttempt(ip);
  return { success: false, error: "Biometric verification failed." };
}

export async function listPasskeysAction(): Promise<{
  success: boolean;
  passkeys?: PasskeyDto[];
  error?: string;
}> {
  const wrapped = withSafeAction("listPasskeysAction", async () => {
    return await listPasskeysService();
  });
  const res = await wrapped();
  return {
    success: res.success,
    passkeys: res.data,
    error: res.error,
  };
}

export async function registerPasskeyAction(
  request: RegisterPasskeyRequest
): Promise<{ success: boolean; passkey?: PasskeyDto; error?: string }> {
  const wrapped = withSafeAction("registerPasskeyAction", async () => {
    return await registerPasskeyService(request);
  });
  const res = await wrapped();
  return {
    success: res.success,
    passkey: res.data,
    error: res.error,
  };
}

export async function removePasskeyAction(id: string): Promise<{ success: boolean; error?: string }> {
  const wrapped = withSafeAction("removePasskeyAction", async () => {
    await removePasskeyService(id);
    return true;
  });
  const res = await wrapped();
  return {
    success: res.success,
    error: res.error,
  };
}

