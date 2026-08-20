import { vi } from "vitest";
import * as clientModule from "../../src/db/client.js";

const TEST_MOCK_MODELS = [
  // Google Gemini
  {
    id: "model-google-gemini-3.7-flash",
    provider: "google",
    name: "gemini-3.7-flash",
    display_name: "Gemini 3.7 Flash",
    description: "Google latest flagship workhorse model for coding and agents",
    context_window: 1048576,
    is_active: true,
  },
  {
    id: "model-google-gemini-3.6-flash",
    provider: "google",
    name: "gemini-3.6-flash",
    display_name: "Gemini 3.6 Flash",
    description: "High-efficiency model optimized for agentic planning",
    context_window: 1048576,
    is_active: true,
  },
  // OpenAI
  {
    id: "model-openai-gpt-5.6-sol",
    provider: "openai",
    name: "gpt-5.6-sol",
    display_name: "GPT-5.6 Sol",
    description: "OpenAI flagship frontier model for complex reasoning",
    context_window: 200000,
    is_active: true,
  },
  {
    id: "model-openai-o3",
    provider: "openai",
    name: "o3",
    display_name: "o3",
    description: "Advanced deep reasoning model for hard STEM & logic",
    context_window: 200000,
    is_active: true,
  },
  // Anthropic Claude
  {
    id: "model-anthropic-claude-fable-5",
    provider: "anthropic",
    name: "claude-fable-5",
    display_name: "Claude Fable 5",
    description: "Anthropic most capable flagship model for complex agentic workflows",
    context_window: 200000,
    is_active: true,
  },
  {
    id: "model-anthropic-claude-sonnet-5",
    provider: "anthropic",
    name: "claude-sonnet-5",
    display_name: "Claude Sonnet 5",
    description: "Standard balanced model offering high speed and frontier intelligence",
    context_window: 200000,
    is_active: true,
  },
  // DeepSeek
  {
    id: "model-deepseek-v4-pro",
    provider: "deepseek",
    name: "deepseek-v4-pro",
    display_name: "DeepSeek V4 Pro",
    description: "Flagship high-capability reasoning and agentic model",
    context_window: 128000,
    is_active: true,
  },
  // Groq
  {
    id: "model-groq-gpt-oss-120b",
    provider: "groq",
    name: "openai/gpt-oss-120b",
    display_name: "GPT-OSS 120B (Groq)",
    description: "Ultra-fast 120B reasoning and tool-calling model on Groq LPU",
    context_window: 128000,
    is_active: true,
  },
];


export function createInMemoryPrismaMock() {
  let vaultConfigRecord: any = null;
  const apiKeysMap = new Map<string, any>();
  const modelsMap = new Map<string, any>();

  const initDefaultModels = () => {
    modelsMap.clear();
    for (const m of TEST_MOCK_MODELS) {
      modelsMap.set(m.id, {
        id: m.id,
        provider: m.provider.toLowerCase(),
        name: m.name,
        display_name: m.display_name,
        description: m.description ?? null,
        context_window: m.context_window ?? null,
        is_active: m.is_active ?? true,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  };

  initDefaultModels();

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
    models: {
      count: vi.fn(async () => modelsMap.size),
      findMany: vi.fn(async (args?: any) => {
        let list = Array.from(modelsMap.values());
        if (args?.where?.provider) {
          const p = args.where.provider.toLowerCase();
          list = list.filter((m) => m.provider.toLowerCase() === p);
        }
        if (args?.where?.is_active !== undefined) {
          list = list.filter((m) => m.is_active === args.where.is_active);
        }
        return list;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const item = modelsMap.get(where.id);
        return item ? { ...item } : null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const record = {
          id: data.id,
          provider: data.provider.toLowerCase(),
          name: data.name,
          display_name: data.display_name,
          description: data.description ?? null,
          context_window: data.context_window ?? null,
          is_active: data.is_active ?? true,
          created_at: new Date(),
          updated_at: new Date(),
        };
        modelsMap.set(record.id, record);
        return { ...record };
      }),
      delete: vi.fn(async ({ where }: any) => {
        const item = modelsMap.get(where.id);
        if (item) modelsMap.delete(where.id);
        return item;
      }),
      deleteMany: vi.fn(async () => {
        modelsMap.clear();
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
      initDefaultModels();
    },
    getVaultConfig: () => vaultConfigRecord,
    getApiKeys: () => apiKeysMap,
    getModels: () => modelsMap,
  };
}
