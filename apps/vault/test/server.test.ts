import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Server } from "node:http";
import { createVaultHttpServer } from "../src/server.js";
import { vaultState } from "../src/vault/state.js";
import * as clientModule from "../src/db/client.js";

describe("Vault HTTP Server", () => {
  let server: Server;
  const PORT = 4099;

  beforeEach(async () => {
    vaultState.lock();
    vi.restoreAllMocks();
    server = createVaultHttpServer();
    await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", () => resolve()));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /health should return 200 with service info", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, service: "ai-vault" });
  });

  it("GET /status should return 200 with UNINITIALIZED when DB is empty", async () => {
    const mockPrisma = {
      vault_config: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    vi.spyOn(clientModule, "getPrismaClient").mockReturnValue(mockPrisma as any);

    const res = await fetch(`http://127.0.0.1:${PORT}/status`, {
      headers: { "x-vault-secret": process.env["VAULT_IPC_SECRET"] || "asd" }
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe("UNINITIALIZED");
    expect(data.isUnlocked).toBe(false);
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

    const res = await fetch(`http://127.0.0.1:${PORT}/status`, {
      headers: { "x-vault-secret": process.env["VAULT_IPC_SECRET"] || "asd" }
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe("LOCKED");
    expect(data.isUnlocked).toBe(false);
    expect(data.kdfParams.algorithm).toBe("argon2id");
  });
});
