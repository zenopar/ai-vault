import { describe, it, expect, beforeEach, vi } from "vitest";
import { createVaultHttpServer } from "../src/server.js";
import { vaultState } from "../src/vault/state.js";
import * as clientModule from "../src/db/client.js";
import request from "supertest";

describe("Vault HTTP Server", () => {
  const server = createVaultHttpServer();

  beforeEach(() => {
    vaultState.lock();
    vi.restoreAllMocks();
  });

  it("GET /health should return 200 with service info", async () => {
    const res = await request(server).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: "ai-vault" });
  });

  it("GET /status should return 200 with UNINITIALIZED when DB is empty", async () => {
    const mockPrisma = {
      vault_config: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    vi.spyOn(clientModule, "getPrismaClient").mockReturnValue(mockPrisma as any);

    const res = await request(server)
      .get("/status")
      .set("x-vault-secret", process.env["VAULT_IPC_SECRET"] || "asd");
      
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("UNINITIALIZED");
    expect(res.body.isUnlocked).toBe(false);
  });

  it("GET /status should return 200 with LOCKED when DB has config but RAM is locked", async () => {
    const mockConfig = {
      id: "vault-uuid-1",
      version: 1,
      status: "INITIALIZED",
      kdf_algorithm: "argon2id",
      kdf_memory_cost: 262144,
      kdf_time_cost: 3,
      kdf_parallelism: 1,
      kdf_salt: "salt123",
      recovery_kdf_salt: "recoverySalt123",
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    };

    const mockPrisma = {
      vault_config: {
        findFirst: vi.fn().mockResolvedValue(mockConfig),
      },
    };
    vi.spyOn(clientModule, "getPrismaClient").mockReturnValue(mockPrisma as any);

    const res = await request(server)
      .get("/status")
      .set("x-vault-secret", process.env["VAULT_IPC_SECRET"] || "asd");
      
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("LOCKED");
    expect(res.body.isUnlocked).toBe(false);
    expect(res.body.kdfParams.algorithm).toBe("argon2id");
  });
});
