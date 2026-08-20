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
  createChat,
  listChats,
  getChat,
  getChatMessages,
  sendMessageAndExecute,
  removeChat,
  ChatNotFoundError
} from "./vault/chats.js";
import { NoActiveApiKeyError } from "./vault/ai/ai-provider.js";
import { vaultState } from "./vault/state.js";
import {
  VaultStatusResponse,
  VaultInitResponse,
  VaultUnlockResponse,
  AddApiKeyResponse,
  ListApiKeysResponse,
  ListModelsResponse,
  CreateChatResponse,
  ListChatsResponse,
  SendChatMessageResponse,
  GetChatMessagesResponse
} from "@ai-vault/types";


function readJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    const MAX_SIZE = 1024 * 1024; // 1 MB limit

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_SIZE) {
        req.destroy();
        reject(new Error("Payload too large"));
        return;
      }
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : ({} as T));
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

function sendJson<T = unknown>(res: ServerResponse, statusCode: number, data: T) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-vault-secret, x-session-token",
  });
  res.end(json);
}

function authenticateIpcRequest(req: IncomingMessage): boolean {
  const clientSecret = req.headers["x-vault-secret"] || req.headers["authorization"]?.replace("Bearer ", "");
  const expectedSecret = config.ipcSecret || "";
  const actualSecret = typeof clientSecret === "string" ? clientSecret : "";

  const expectedBuffer = Buffer.from(expectedSecret);
  const actualBuffer = Buffer.from(actualSecret);

  if (
    !expectedSecret ||
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return false;
  }
  return true;
}

function authenticateSessionToken(req: IncomingMessage, body?: { sessionToken?: string }): boolean {
  const token =
    (typeof req.headers["x-session-token"] === "string" ? req.headers["x-session-token"] : null) ||
    body?.sessionToken ||
    (typeof req.headers["authorization"] === "string" && req.headers["x-vault-secret"]
      ? req.headers["authorization"].replace("Bearer ", "")
      : null);

  if (!token) {
    return false;
  }

  return vaultState.verifySession(token);
}

export function createVaultHttpServer() {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase();

    // 1. Preflight OPTIONS
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-vault-secret, x-session-token",
      });
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

      // 8. Add and encrypt AI API key
      if (method === "POST" && pathname === "/keys") {
        const body = await readJsonBody<{ provider?: string; name?: string; apiKey?: string; sessionToken?: string }>(req);

        if (!authenticateSessionToken(req, body)) {
          sendJson(res, 401, { error: "Unauthorized: Invalid or missing session token." });
          return;
        }

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

        const key = await addApiKey({
          provider: body.provider,
          name: body.name,
          apiKey: body.apiKey,
        });
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

        if (!id) {
          sendJson(res, 400, { error: "Key ID is required in URL path (/keys/:id)." });
          return;
        }

        await removeApiKey(id);
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

      // 12. Create a new chat
      if (method === "POST" && pathname === "/chats") {
        const body = await readJsonBody<{ title?: string; metadata?: Record<string, any>; sessionToken?: string }>(req);

        if (!authenticateSessionToken(req, body)) {
          sendJson(res, 401, { error: "Unauthorized: Invalid or missing session token." });
          return;
        }

        if (body.title !== undefined && typeof body.title !== "string") {
          sendJson(res, 400, { error: "title must be a string if provided." });
          return;
        }

        const chat = await createChat({
          title: body.title,
          metadata: body.metadata,
        });

        sendJson<CreateChatResponse>(res, 201, { success: true, chat });
        return;
      }

      // 13. List all chats
      if (method === "GET" && pathname === "/chats") {
        if (!authenticateSessionToken(req)) {
          sendJson(res, 401, { error: "Unauthorized: Invalid or missing session token." });
          return;
        }

        const limitParam = url.searchParams.get("limit");
        const offsetParam = url.searchParams.get("offset");
        
        const limit = limitParam ? parseInt(limitParam, 10) : undefined;
        const offset = offsetParam ? parseInt(offsetParam, 10) : undefined;

        if ((limit !== undefined && Number.isNaN(limit)) || (offset !== undefined && Number.isNaN(offset))) {
          sendJson(res, 400, { error: "Invalid limit or offset parameter." });
          return;
        }

        const chats = await listChats(limit, offset);
        sendJson<ListChatsResponse>(res, 200, { success: true, chats });
        return;
      }

      // 14. Send message (with AI completion & automatic encryption)
      if (method === "POST" && pathname === "/chats/messages") {
        const body = await readJsonBody<{
          chatId?: string;
          message?: string;
          provider?: string;
          model?: string;
          sessionToken?: string;
        }>(req);

        if (!authenticateSessionToken(req, body)) {
          sendJson(res, 401, { error: "Unauthorized: Invalid or missing session token." });
          return;
        }

        if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
          sendJson(res, 400, { error: "message is required and must be a non-empty string." });
          return;
        }

        const result = await sendMessageAndExecute({
          chatId: body.chatId,
          message: body.message,
          provider: body.provider,
          model: body.model,
        });

        sendJson<SendChatMessageResponse>(res, 200, {
          success: true,
          chat: result.chat,
          userMessage: result.userMessage,
          assistantMessage: result.assistantMessage,
        });
        return;
      }

      // 15. Get chat messages
      if (method === "GET" && pathname.startsWith("/chats/") && pathname.endsWith("/messages")) {
        if (!authenticateSessionToken(req)) {
          sendJson(res, 401, { error: "Unauthorized: Invalid or missing session token." });
          return;
        }

        const chatId = pathname.replace(/^\/chats\//, "").replace(/\/messages$/, "").trim();
        if (!chatId) {
          sendJson(res, 400, { error: "Chat ID is required." });
          return;
        }

        const limitParam = url.searchParams.get("limit");
        const offsetParam = url.searchParams.get("offset");
        const sortParam = url.searchParams.get("sort");
        
        const limit = limitParam ? parseInt(limitParam, 10) : undefined;
        const offset = offsetParam ? parseInt(offsetParam, 10) : undefined;

        if ((limit !== undefined && Number.isNaN(limit)) || (offset !== undefined && Number.isNaN(offset))) {
          sendJson(res, 400, { error: "Invalid limit or offset parameter." });
          return;
        }

        const sort = sortParam === "desc" ? "desc" : "asc";

        const chat = await getChat(chatId);
        const messages = await getChatMessages(chatId, limit, offset, sort);
        sendJson<GetChatMessagesResponse>(res, 200, { success: true, chat, messages });
        return;
      }

      // 16. Delete a chat
      if (method === "DELETE" && pathname.startsWith("/chats/")) {
        if (!authenticateSessionToken(req)) {
          sendJson(res, 401, { error: "Unauthorized: Invalid or missing session token." });
          return;
        }

        const chatId = pathname.replace(/^\/chats\//, "").trim();
        if (!chatId) {
          sendJson(res, 400, { error: "Chat ID is required." });
          return;
        }

        await removeChat(chatId);
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

      if (err instanceof NoActiveApiKeyError) {
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
