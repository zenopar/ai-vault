import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import crypto from "node:crypto";
import { config } from "./config.js";
import { getVaultStatus } from "./vault/status.js";
import { VaultStatusResponse, VaultInitResponse, VaultUnlockResponse } from "@ai-vault/types";
import { createVaultConfig, getVaultConfig } from "./db/repository/vault.repository.js";
import { generateRandomSalt, generateVaultKey, generateRecoveryPassword, deriveKey, encryptBuffer, decryptBuffer, DEFAULT_KDF_PARAMS } from "./vault/crypto.js";
import { vaultState } from "./vault/state.js";

function readJsonBody(req: IncomingMessage): Promise<any> {
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
        resolve(body ? JSON.parse(body) : {});
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

export function createVaultHttpServer() {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase();

    // Handle preflight OPTIONS request
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
      // 1. Health check endpoint (Public for Docker / Load Balancers)
      if (method === "GET" && pathname === "/health") {
        sendJson(res, 200, { ok: true, service: "ai-vault" });
        return;
      }

      // ==========================================
      // IPC Secret Authentication Middleware
      // All routes below this point require the correct IPC Secret
      // ==========================================
      const clientSecret = req.headers["x-vault-secret"] || req.headers["authorization"]?.replace("Bearer ", "");
      const expectedSecret = config.ipcSecret || "";
      const actualSecret = typeof clientSecret === "string" ? clientSecret : "";
      
      const expectedBuffer = Buffer.from(expectedSecret);
      const actualBuffer = Buffer.from(actualSecret);
      
      // Timing-safe comparison requires equal length buffers
      if (
        !expectedSecret || 
        expectedBuffer.length !== actualBuffer.length || 
        !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
      ) {
        sendJson(res, 401, { error: "Unauthorized: Invalid or missing IPC Secret" });
        return;
      }

      // 2. Vault status endpoint (Protected)
      if (method === "GET" && pathname === "/status") {
        const status = await getVaultStatus();
        sendJson<VaultStatusResponse>(res, 200, status);
        return;
      }

      // 3. Vault initialization endpoint (Protected)
      if (method === "POST" && pathname === "/init") {
        const currentStatus = await getVaultStatus();
        if (currentStatus.status !== "UNINITIALIZED") {
          sendJson(res, 400, { error: "Vault is already initialized." });
          return;
        }

        const body = await readJsonBody(req);
        if (!body.masterPassword || typeof body.masterPassword !== "string") {
          sendJson(res, 400, { error: "masterPassword is required and must be a string." });
          return;
        }

        const masterPassword = body.masterPassword;

        // Generate salts
        const kdfSalt = generateRandomSalt();
        const recoverySalt = generateRandomSalt();

        // Generate Master Vault Key (this is the true key that encrypts data)
        const vaultKey = generateVaultKey();

        // Generate Recovery Password for the user
        const recoveryPassword = generateRecoveryPassword();

        // Derive Wrapping Keys using Argon2
        const wrappingKey = await deriveKey(masterPassword, kdfSalt, DEFAULT_KDF_PARAMS);
        const recoveryWrappingKey = await deriveKey(recoveryPassword, recoverySalt, DEFAULT_KDF_PARAMS);

        // Encrypt the Vault Key
        const wrappedVaultKey = encryptBuffer(vaultKey, wrappingKey);
        const wrappedRecoveryKey = encryptBuffer(vaultKey, recoveryWrappingKey);

        // Save everything to DB
        await createVaultConfig({
          kdf_algorithm: "argon2id",
          kdf_memory_cost: DEFAULT_KDF_PARAMS.memoryCost,
          kdf_time_cost: DEFAULT_KDF_PARAMS.timeCost,
          kdf_parallelism: DEFAULT_KDF_PARAMS.parallelism,
          kdf_salt: kdfSalt,
          wrapped_vault_key: wrappedVaultKey.ciphertext,
          wrapped_vault_key_iv: wrappedVaultKey.iv,
          wrapped_vault_key_tag: wrappedVaultKey.tag,
          recovery_kdf_salt: recoverySalt,
          wrapped_vault_key_recovery: wrappedRecoveryKey.ciphertext,
          wrapped_vault_key_recovery_iv: wrappedRecoveryKey.iv,
          wrapped_vault_key_recovery_tag: wrappedRecoveryKey.tag,
        });

        // Load into RAM immediately
        vaultState.setUnlocked(vaultKey);

        sendJson<VaultInitResponse>(res, 200, {
          success: true,
          recoveryPassword,
        });
        return;
      }

      // 4. Vault unlock endpoint (Protected)
      if (method === "POST" && pathname === "/unlock") {
        const dbConfig = await getVaultConfig();
        if (!dbConfig) {
          sendJson(res, 400, { error: "Vault is not initialized." });
          return;
        }

        const body = await readJsonBody(req);
        if (!body.password || typeof body.password !== "string") {
          sendJson(res, 400, { error: "password is required and must be a string." });
          return;
        }

        const password = body.password;
        
        let vaultKey: Buffer | null = null;
        
        // Try master password first
        try {
          const wrappingKey = await deriveKey(password, dbConfig.kdf_salt, {
            memoryCost: dbConfig.kdf_memory_cost,
            timeCost: dbConfig.kdf_time_cost,
            parallelism: dbConfig.kdf_parallelism,
            hashLength: 32
          });
          
          vaultKey = decryptBuffer({
            ciphertext: dbConfig.wrapped_vault_key,
            iv: dbConfig.wrapped_vault_key_iv,
            tag: dbConfig.wrapped_vault_key_tag
          }, wrappingKey);
        } catch (e) {
          // Master password decryption failed
        }
        
        // If master password fails, try recovery password
        if (!vaultKey) {
          try {
            const recoveryWrappingKey = await deriveKey(password, dbConfig.recovery_kdf_salt, {
              memoryCost: dbConfig.kdf_memory_cost,
              timeCost: dbConfig.kdf_time_cost,
              parallelism: dbConfig.kdf_parallelism,
              hashLength: 32
            });
            
            vaultKey = decryptBuffer({
              ciphertext: dbConfig.wrapped_vault_key_recovery,
              iv: dbConfig.wrapped_vault_key_recovery_iv,
              tag: dbConfig.wrapped_vault_key_recovery_tag
            }, recoveryWrappingKey);
          } catch (e) {
            // Recovery password decryption failed
          }
        }
        
        if (!vaultKey) {
          sendJson(res, 401, { error: "Invalid password or recovery code." });
          return;
        }

        // Successfully unlocked, load into RAM
        vaultState.setUnlocked(vaultKey);
        
        // Create session token and store hash in RAM
        const sessionToken = vaultState.createSession();

        sendJson<VaultUnlockResponse>(res, 200, { success: true, sessionToken } as any);
        return;
      }

      // 5. Verify session endpoint (Protected)
      if (method === "POST" && pathname === "/verify-session") {
        const body = await readJsonBody(req);
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
