import { vi } from "vitest";
import * as clientModule from "../../src/db/client.js";

export function createInMemoryPrismaMock() {
  let vaultConfigRecord: any = null;
  const apiKeysMap = new Map<string, any>();

  const mockPrisma = {
    vault_config: {
      findFirst: vi.fn(async () => vaultConfigRecord),
      create: vi.fn(async ({ data }: any) => {
        if (vaultConfigRecord) {
          throw new Error("Vault is already initialized.");
        }
        vaultConfigRecord = {
          id: data.id || "vault-uuid-mock",
          version: data.version || 1,
          status: data.status || "INITIALIZED",
          kdf_algorithm: data.kdf_algorithm || "argon2id",
          kdf_memory_cost: data.kdf_memory_cost,
          kdf_time_cost: data.kdf_time_cost,
          kdf_parallelism: data.kdf_parallelism,
          kdf_salt: data.kdf_salt,
          wrapped_vault_key: data.wrapped_vault_key,
          wrapped_vault_key_iv: data.wrapped_vault_key_iv,
          wrapped_vault_key_tag: data.wrapped_vault_key_tag,
          recovery_kdf_salt: data.recovery_kdf_salt,
          wrapped_vault_key_recovery: data.wrapped_vault_key_recovery,
          wrapped_vault_key_recovery_iv: data.wrapped_vault_key_recovery_iv,
          wrapped_vault_key_recovery_tag: data.wrapped_vault_key_recovery_tag,
          created_at: new Date(),
          updated_at: new Date(),
        };
        return { ...vaultConfigRecord };
      }),
      deleteMany: vi.fn(async () => {
        vaultConfigRecord = null;
        return { count: 1 };
      }),
    },
    ai_api_keys: {
      findMany: vi.fn(async () => {
        const list = Array.from(apiKeysMap.values());
        return list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const item = apiKeysMap.get(where.id);
        return item ? { ...item } : null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const record = {
          id: data.id,
          provider: data.provider,
          name: data.name,
          encrypted_key: data.encrypted_key,
          iv: data.iv,
          tag: data.tag,
          is_active: data.is_active ?? true,
          created_at: new Date(),
          updated_at: new Date(),
        };
        apiKeysMap.set(record.id, record);
        return { ...record };
      }),
      delete: vi.fn(async ({ where }: any) => {
        const item = apiKeysMap.get(where.id);
        if (!item) {
          throw new Error(`Record to delete does not exist: ${where.id}`);
        }
        apiKeysMap.delete(where.id);
        return { ...item };
      }),
      deleteMany: vi.fn(async (args?: any) => {
        if (args?.where?.id?.in) {
          for (const id of args.where.id.in) {
            apiKeysMap.delete(id);
          }
        } else {
          apiKeysMap.clear();
        }
        return { count: 1 };
      }),
    },
    $disconnect: vi.fn(async () => {}),
  };

  vi.spyOn(clientModule, "getPrismaClient").mockReturnValue(mockPrisma as any);

  return {
    mockPrisma,
    reset: () => {
      vaultConfigRecord = null;
      apiKeysMap.clear();
    },
    getVaultConfig: () => vaultConfigRecord,
    getApiKeys: () => apiKeysMap,
  };
}
