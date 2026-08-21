import { describe, it, expect, beforeEach, vi } from "vitest";
import { vaultState } from "../src/vault/state.js";
import { getVaultStatus } from "../src/vault/status.js";
import * as clientModule from "../src/db/client.js";

describe("Vault Status Service", () => {
  beforeEach(() => {
    vaultState.lock();
    vi.restoreAllMocks();
  });

  it("should return UNINITIALIZED when no vault_config row exists in DB", async () => {
    const mockPrisma = {
      vault_config: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    vi.spyOn(clientModule, "getPrismaClient").mockReturnValue(mockPrisma as any);

    const status = await getVaultStatus();
    expect(status.status).toBe("UNINITIALIZED");
    expect(status.isUnlocked).toBe(false);
  });

  it("should return LOCKED when vault_config exists but memory is locked", async () => {
    const mockConfig = {
      id: "vault-1",
      version: 1,
      status: "INITIALIZED",
      kdf_algorithm: "argon2id",
      kdf_memory_cost: 262144,
      kdf_time_cost: 3,
      kdf_parallelism: 1,
      kdf_salt: "aabbcc112233",
      recovery_kdf_salt: "ddeeff445566",
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    };

    const mockPrisma = {
      vault_config: {
        findFirst: vi.fn().mockResolvedValue(mockConfig),
      },
    };
    vi.spyOn(clientModule, "getPrismaClient").mockReturnValue(mockPrisma as any);

    const status = await getVaultStatus();
    expect(status.status).toBe("LOCKED");
    expect(status.isUnlocked).toBe(false);
    expect(status.version).toBe(1);
    expect(status.kdfParams?.algorithm).toBe("argon2id");
    expect((status.kdfParams as any)?.salt).toBeUndefined();
    expect((status.kdfParams as any)?.recoverySalt).toBeUndefined();
  });

  it("should return UNLOCKED when vaultState is unlocked", async () => {
    const mockConfig = {
      id: "vault-1",
      version: 1,
      status: "INITIALIZED",
      kdf_algorithm: "argon2id",
      kdf_memory_cost: 262144,
      kdf_time_cost: 3,
      kdf_parallelism: 1,
      kdf_salt: "aabbcc112233",
      recovery_kdf_salt: "ddeeff445566",
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    };

    const mockPrisma = {
      vault_config: {
        findFirst: vi.fn().mockResolvedValue(mockConfig),
      },
    };
    vi.spyOn(clientModule, "getPrismaClient").mockReturnValue(mockPrisma as any);

    // Unlock in-memory state
    vaultState.setUnlocked(Buffer.alloc(32, 0x42));

    const status = await getVaultStatus();
    expect(status.status).toBe("UNLOCKED");
    expect(status.isUnlocked).toBe(true);
    expect(status.unlockedAt).toBeDefined();
  });
});
