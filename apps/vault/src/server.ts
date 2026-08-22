import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import crypto from "node:crypto";
import { config } from "./config.js";
import { getVaultStatus } from "./vault/status.js";
import { initVault, VaultAlreadyInitializedError } from "./vault/init.js";
import { unlockVault, VaultNotInitializedError, InvalidCredentialsError } from "./vault/unlock.js";
import {
  addApiKey,
  listApiKeys,
  removeApiKey,
  VaultLockedError,
  ApiKeyNotFoundError
} from "./vault/keys.js";
import { listModels } from "./vault/models.js";
import {
  listChats,
  getChat,
  getChatMessages,
  sendMessageAndExecute,
  removeChat,
  ChatNotFoundError
} from "./vault/chats/index.js";
import { NoActiveApiKeyError, UnsupportedProviderError } from "./vault/ai/ai-provider.js";
import { vaultState } from "./vault/state.js";
import {
  VaultStatusResponse,
  VaultInitResponse,
  VaultUnlockResponse,
  AddApiKeyResponse,
  ListApiKeysResponse,
  ListModelsResponse,
  ListChatsResponse,
  SendChatMessageResponse,
  GetChatMessagesResponse
} from "@ai-vault/types";


function readJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_SIZE = 1024 * 1024; // 1 MB limit

    req.on("data", (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > MAX_SIZE) {
        req.destroy();
        for (const c of chunks) {
          c.fill(0);
        }
        reject(new Error("Payload too large"));
        return;
      }
      chunks.push(buf);
    });

    req.on("end", () => {
      let combined: Buffer | null = null;
      try {
        if (chunks.length === 0) {
          resolve({} as T);
          return;
        }
        combined = Buffer.concat(chunks, size);
        const parsed = JSON.parse(combined.toString("utf-8"));
        resolve(parsed);
      } catch (e) {
        reject(new Error("Invalid JSON"));
      } finally {
        for (const chunk of chunks) {
          chunk.fill(0);
        }
        combined?.fill(0);
      }
    });

    req.on("error", (err) => {
      for (const chunk of chunks) {
        chunk.fill(0);
      }
      reject(err);
    });
  });
}

const ALLOWED_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const ALLOWED_HOST_PATTERN = /^(localhost|127\.0\.0\.1)(:\d+)?$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isLoopbackAddress(ip?: string): boolean {
  if (!ip) return true; // Fallback for synthetic/mocked test requests without socket
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip.startsWith("127.");
}

function resolveAllowedOrigin(req: IncomingMessage): string {
  const origin = req.headers["origin"];
  if (origin && ALLOWED_ORIGIN_PATTERN.test(origin)) {
    return origin;
  }
  return "http://localhost:3000";
}

function setCorsHeaders(res: ServerResponse, origin: string): void {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-vault-secret, x-session-token");
}

function sendJson<T = unknown>(res: ServerResponse, statusCode: number, data: T) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(json);
}

function authenticateIpcRequest(req: IncomingMessage): boolean {
  const clientSecret = req.headers["x-vault-secret"] || req.headers["authorization"]?.replace("Bearer ", "");
  const expectedSecret = config.ipcSecret || "";
  const actualSecret = typeof clientSecret === "string" ? clientSecret : "";

  if (!expectedSecret) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedSecret);
  const actualBuffer = Buffer.from(actualSecret);

  // Pad both to the same length before comparing to avoid leaking secret length
  // via a short-circuit before timingSafeEqual. The actual length equality check
  // happens after the constant-time comparison.
  const maxLen = Math.max(expectedBuffer.length, actualBuffer.length);
  const paddedExpected = Buffer.alloc(maxLen);
  const paddedActual = Buffer.alloc(maxLen);
  expectedBuffer.copy(paddedExpected);
  actualBuffer.copy(paddedActual);

  const timingMatch = crypto.timingSafeEqual(paddedExpected, paddedActual);
  const lengthMatch = expectedBuffer.length === actualBuffer.length;

  return timingMatch && lengthMatch;
}

function authenticateSessionToken(req: IncomingMessage): boolean {
  const token =
    typeof req.headers["x-session-token"] === "string" ? req.headers["x-session-token"] : null;

  if (!token) {
    return false;
  }

  return vaultState.verifySession(token);
}

export function createVaultHttpServer() {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // 0. Ensure request originates strictly from localhost IP and Host header
    const remoteIp = req.socket?.remoteAddress;
    if (!isLoopbackAddress(remoteIp)) {
      sendJson(res, 403, { error: "Forbidden: Vault is only accessible from localhost" });
      return;
    }

    const hostHeader = req.headers.host;
    if (hostHeader && !ALLOWED_HOST_PATTERN.test(hostHeader)) {
      sendJson(res, 403, { error: "Forbidden: Invalid Host header. Vault only accepts localhost/127.0.0.1" });
      return;
    }

    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = url.pathname;
    const method = req.method?.toUpperCase();

    // Set CORS headers for every request based on Origin
    const corsOrigin = resolveAllowedOrigin(req);
    setCorsHeaders(res, corsOrigin);

    // 1. Preflight OPTIONS
    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // 2. Health check (Public)
      if (method === "GET" && pathname === "/health") {
        sendJson(res, 200, { ok: true, service: "ai-vault" });
        return;
      }

      // 3. Authenticate IPC Secret (All endpoints below require authentication)
      if (!authenticateIpcRequest(req)) {
        sendJson(res, 401, { error: "Unauthorized: Invalid or missing IPC Secret" });
        return;
      }

      // 4. Status
      if (method === "GET" && pathname === "/status") {
        const status = await getVaultStatus();
        sendJson<VaultStatusResponse>(res, 200, status);
        return;
      }

      // 5. Initialize Vault
      if (method === "POST" && pathname === "/init") {
        const body = await readJsonBody<{ masterPassword?: string }>(req);
        if (!body.masterPassword || typeof body.masterPassword !== "string") {
          sendJson(res, 400, { error: "masterPassword is required and must be a string." });
          return;
        }

        const result = await initVault(body.masterPassword);
        sendJson<VaultInitResponse>(res, 200, result);
        return;
      }

      // 6. Unlock Vault & create session
      if (method === "POST" && pathname === "/unlock") {
        const body = await readJsonBody<{ password?: string }>(req);
        if (!body.password || typeof body.password !== "string") {
          sendJson(res, 400, { error: "password is required and must be a string." });
          return;
        }

        const result = await unlockVault(body.password);
        sendJson<VaultUnlockResponse>(res, 200, result);
        return;
      }

      // 7. Verify session token
      if (method === "POST" && pathname === "/verify-session") {
        const body = await readJsonBody<{ token?: string }>(req);
        if (!body.token || typeof body.token !== "string") {
          sendJson(res, 400, { error: "token is required and must be a string." });
          return;
        }

        const isValid = vaultState.verifySession(body.token);
        sendJson(res, 200, { valid: isValid });
        return;
      }

      // 8. Lock Vault / Destroy Session
      if (method === "POST" && pathname === "/lock") {
        const body = (await readJsonBody<{ token?: string; all?: boolean }>(req).catch(() => ({}))) as {
          token?: string;
          all?: boolean;
        };
        const token =
          body.token ||
          (typeof req.headers["x-session-token"] === "string" ? req.headers["x-session-token"] : undefined);

        if (body.all || !token) {
          vaultState.lock();
        } else {
          vaultState.destroySession(token);
        }

        sendJson(res, 200, { success: true, isUnlocked: vaultState.isUnlocked() });
        return;
      }

      // 9. Touch session / Refresh activity timestamp
      if (method === "POST" && pathname === "/touch") {
        const body = (await readJsonBody<{ token?: string }>(req).catch(() => ({}))) as {
          token?: string;
        };
        const token =
          body.token ||
          (typeof req.headers["x-session-token"] === "string" ? req.headers["x-session-token"] : undefined);

        vaultState.touch(token);
        sendJson(res, 200, {
          success: true,
          lastActivityAt: vaultState.getLastActivityAt()?.toISOString() ?? null,
        });
        return;
      }

      // 8. Add and encrypt AI API key
      if (method === "POST" && pathname === "/keys") {
        const body = await readJsonBody<{ provider?: string; name?: string; apiKey?: string }>(req);

        if (!authenticateSessionToken(req)) {
          sendJson(res, 401, { error: "Unauthorized: Invalid or missing session token." });
          return;
        }

        const sessionToken = req.headers["x-session-token"] as string;

        if (!body.provider || typeof body.provider !== "string" || !body.provider.trim()) {
          sendJson(res, 400, { error: "provider is required and must be a non-empty string." });
          return;
        }
        if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
          sendJson(res, 400, { error: "name is required and must be a non-empty string." });
          return;
        }
        if (!body.apiKey || typeof body.apiKey !== "string" || !body.apiKey.trim()) {
          sendJson(res, 400, { error: "apiKey is required and must be a non-empty string." });
          return;
        }

        const key = await addApiKey(
          {
            provider: body.provider,
            name: body.name,
            apiKey: body.apiKey,
          },
          sessionToken
        );
        sendJson<AddApiKeyResponse>(res, 201, { success: true, key });
        return;
      }

      // 9. List all AI API keys (metadata only)
      if (method === "GET" && pathname === "/keys") {
        if (!authenticateSessionToken(req)) {
          sendJson(res, 401, { error: "Unauthorized: Invalid or missing session token." });
          return;
        }

        const keys = await listApiKeys();
        sendJson<ListApiKeysResponse>(res, 200, { success: true, keys });
        return;
      }

      // 10. Delete AI API key by ID
      if (method === "DELETE" && pathname.startsWith("/keys/")) {
        const id = pathname.replace(/^\/keys\//, "").trim();

        if (!authenticateSessionToken(req)) {
          sendJson(res, 401, { error: "Unauthorized: Invalid or missing session token." });
          return;
        }

        const sessionToken = req.headers["x-session-token"] as string;

        if (!id || !UUID_REGEX.test(id)) {
          sendJson(res, 400, { error: "A valid Key ID (UUID) is required in URL path (/keys/:id)." });
          return;
        }

        await removeApiKey(id, sessionToken);
        sendJson(res, 200, { success: true });
        return;
      }

      // 11. List AI Models (optionally filtered by ?provider=)
      if (method === "GET" && pathname === "/models") {
        if (!authenticateSessionToken(req)) {
          sendJson(res, 401, { error: "Unauthorized: Invalid or missing session token." });
          return;
        }

        const providerQuery = url.searchParams.get("provider") || undefined;
        const models = await listModels(providerQuery);
        sendJson<ListModelsResponse>(res, 200, { success: true, models });
        return;
      }

      // 12. List all chats
      if (method === "GET" && pathname === "/chats") {
        if (!authenticateSessionToken(req)) {
          sendJson(res, 401, { error: "Unauthorized: Invalid or missing session token." });
          return;
        }

        const sessionToken = req.headers["x-session-token"] as string;
        const limitParam = url.searchParams.get("limit");
        const offsetParam = url.searchParams.get("offset");

        const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
        const offset = offsetParam ? parseInt(offsetParam, 10) : undefined;

        if ((limit !== undefined && Number.isNaN(limit)) || (offset !== undefined && Number.isNaN(offset))) {
          sendJson(res, 400, { error: "Invalid limit or offset parameter." });
          return;
        }

        const chats = await listChats(sessionToken, limit, offset);
        sendJson<ListChatsResponse>(res, 200, { success: true, chats });
        return;
      }

      // 13. Send message (with AI completion & automatic encryption)
      if (method === "POST" && pathname === "/chats/messages") {
        const body = await readJsonBody<{
          chatId?: string;
          message?: string;
          provider?: string;
          model?: string;
          thinkingLevel?: "low" | "medium" | "high" | "none";
        }>(req);

        if (!authenticateSessionToken(req)) {
          sendJson(res, 401, { error: "Unauthorized: Invalid or missing session token." });
          return;
        }

        const sessionToken = req.headers["x-session-token"] as string;

        if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
          sendJson(res, 400, { error: "message is required and must be a non-empty string." });
          return;
        }

        const result = await sendMessageAndExecute({
          chatId: body.chatId,
          message: body.message,
          provider: body.provider,
          model: body.model,
          thinkingLevel: body.thinkingLevel,
          sessionToken,
        });

        sendJson<SendChatMessageResponse>(res, 200, {
          success: true,
          chat: result.chat,
          userMessage: result.userMessage,
          assistantMessage: result.assistantMessage,
        });
        return;
      }

      // 14. Get chat messages
      if (method === "GET" && pathname.startsWith("/chats/") && pathname.endsWith("/messages")) {
        if (!authenticateSessionToken(req)) {
          sendJson(res, 401, { error: "Unauthorized: Invalid or missing session token." });
          return;
        }

        const sessionToken = req.headers["x-session-token"] as string;
        const chatId = pathname.replace(/^\/chats\//, "").replace(/\/messages$/, "").trim();
        if (!chatId || !UUID_REGEX.test(chatId)) {
          sendJson(res, 400, { error: "A valid Chat ID (UUID) is required." });
          return;
        }

        const limitParam = url.searchParams.get("limit");
        const offsetParam = url.searchParams.get("offset");
        const sortParam = url.searchParams.get("sort");

        const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
        const offset = offsetParam ? parseInt(offsetParam, 10) : undefined;

        if ((limit !== undefined && Number.isNaN(limit)) || (offset !== undefined && Number.isNaN(offset))) {
          sendJson(res, 400, { error: "Invalid limit or offset parameter." });
          return;
        }

        const sort = sortParam === "desc" ? "desc" : "asc";

        const chat = await getChat(chatId, sessionToken);
        const messages = await getChatMessages(chatId, sessionToken, limit, offset, sort);
        sendJson<GetChatMessagesResponse>(res, 200, { success: true, chat, messages });
        return;
      }

      // 15. Delete a chat
      if (method === "DELETE" && pathname.startsWith("/chats/")) {
        if (!authenticateSessionToken(req)) {
          sendJson(res, 401, { error: "Unauthorized: Invalid or missing session token." });
          return;
        }

        const sessionToken = req.headers["x-session-token"] as string;
        const chatId = pathname.replace(/^\/chats\//, "").trim();
        if (!chatId || !UUID_REGEX.test(chatId)) {
          sendJson(res, 400, { error: "A valid Chat ID (UUID) is required." });
          return;
        }

        await removeChat(chatId, sessionToken);
        sendJson(res, 200, { success: true });
        return;
      }

      // Route not found
      sendJson(res, 404, { error: `Route ${method} ${pathname} not found` });
    } catch (err: unknown) {
      if (err instanceof VaultAlreadyInitializedError || err instanceof VaultNotInitializedError) {
        sendJson(res, 400, { error: err.message });
        return;
      }

      if (err instanceof InvalidCredentialsError) {
        sendJson(res, 401, { error: err.message });
        return;
      }

      if (err instanceof VaultLockedError) {
        sendJson(res, 403, { error: err.message });
        return;
      }

      if (err instanceof ApiKeyNotFoundError || err instanceof ChatNotFoundError) {
        sendJson(res, 404, { error: err.message });
        return;
      }

      if (err instanceof NoActiveApiKeyError || err instanceof UnsupportedProviderError) {
        sendJson(res, 400, { error: err.message });
        return;
      }

      const errorMsg = err instanceof Error ? err.message : "Internal server error";
      sendJson(res, 500, { error: errorMsg });
    }
  });
}

export function startServer() {
  const server = createVaultHttpServer();
  server.listen(config.port, config.host, () => {
    console.log(`Vault Service running at http://${config.host}:${config.port}`);
    console.log(`Status endpoint: http://${config.host}:${config.port}/status`);
  });
  return server;
}

// Auto-start when not running in tests
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  startServer();
}
