import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import crypto from "node:crypto";
import { config } from "./config.js";
import { getVaultStatus } from "./vault/status.js";
import { initVault, VaultAlreadyInitializedError } from "./vault/init.js";
import { unlockVault, VaultNotInitializedError, InvalidCredentialsError } from "./vault/unlock.js";
import { vaultState } from "./vault/state.js";
import { VaultStatusResponse, VaultInitResponse, VaultUnlockResponse } from "@ai-vault/types";

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-vault-secret",
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

export function createVaultHttpServer() {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase();

    // 1. Preflight OPTIONS
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-vault-secret",
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
