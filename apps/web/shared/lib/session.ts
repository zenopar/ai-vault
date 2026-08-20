import { cookies } from "next/headers";
import "server-only";
import { VaultApiClient } from "./vault-client";

const SESSION_COOKIE_NAME = "ai_vault_session";
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Stores the session token in a secure HttpOnly cookie.
 * (The token was already generated and securely hashed by the Vault backend).
 */
export async function createSession(token: string): Promise<void> {
  const expiresAt = Date.now() + SESSION_EXPIRY_MS;
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

/**
 * Gets the current session token from the HttpOnly cookie.
 */
export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

/**
 * Verifies if the request has a valid session cookie by asking the Vault backend.
 */
export async function verifySession(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  
  if (!sessionCookie || !sessionCookie.value) {
    return false;
  }

  try {
    const response = await VaultApiClient.sendPostRequest<{ valid: boolean }>("/verify-session", {
      token: sessionCookie.value
    });

    if (response.error || !response.data) {
      return false;
    }

    return response.data.valid;
  } catch (err) {
    console.error("[verifySession] Failed to verify session against Vault:", err);
    return false;
  }
}

/**
 * Destroys the current session from the browser cookie.
 * Note: A full implementation might also want an endpoint on Vault to delete the session hash.
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
