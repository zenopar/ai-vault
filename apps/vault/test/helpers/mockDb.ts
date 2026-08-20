import { vi } from "vitest";
import * as clientModule from "../../src/db/client.js";

const TEST_MOCK_MODELS = [
  // Google Gemini
  {
    id: "00000000-0000-4000-8000-000000000001",
    provider: "google",
    name: "gemini-3.7-flash",
    display_name: "Gemini 3.7 Flash",
    description: "Google latest flagship workhorse model for coding and agents",
    context_window: 1048576,
    is_active: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    provider: "google",
    name: "gemini-3.6-flash",
    display_name: "Gemini 3.6 Flash",
    description: "High-efficiency model optimized for agentic planning",
    context_window: 1048576,
    is_active: true,
  },
  // OpenAI
  {
    id: "00000000-0000-4000-8000-000000000003",
    provider: "openai",
    name: "gpt-5.6-sol",
    display_name: "GPT-5.6 Sol",
    description: "OpenAI flagship frontier model for complex reasoning",
    context_window: 200000,
    is_active: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    provider: "openai",
    name: "o3",
    display_name: "o3",
    description: "Advanced deep reasoning model for hard STEM & logic",
    context_window: 200000,
    is_active: true,
  },
  // Anthropic Claude
  {
    id: "00000000-0000-4000-8000-000000000005",
    provider: "anthropic",
    name: "claude-fable-5",
    display_name: "Claude Fable 5",
    description: "Anthropic most capable flagship model for complex agentic workflows",
    context_window: 200000,
    is_active: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    provider: "anthropic",
    name: "claude-sonnet-5",
    display_name: "Claude Sonnet 5",
    description: "Standard balanced model offering high speed and frontier intelligence",
    context_window: 200000,
    is_active: true,
  },
  // DeepSeek
  {
    id: "00000000-0000-4000-8000-000000000007",
    provider: "deepseek",
    name: "deepseek-v4-pro",
    display_name: "DeepSeek V4 Pro",
    description: "Flagship high-capability reasoning and agentic model",
    context_window: 128000,
    is_active: true,
  },
  // Groq
  {
    id: "00000000-0000-4000-8000-000000000008",
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
  const chatsMap = new Map<string, any>();
  const messagesMap = new Map<string, any>();
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
    chats: {
      findMany: vi.fn(async () => {
        const list = Array.from(chatsMap.values());
        return list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const item = chatsMap.get(where.id);
        return item ? { ...item } : null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const record = {
          id: data.id,
          encryption_version: data.encryption_version ?? 1,
          status: data.status ?? "ACTIVE",
          encrypted_title: data.encrypted_title,
          title_iv: data.title_iv,
          title_tag: data.title_tag,
          encrypted_metadata: data.encrypted_metadata ?? null,
          metadata_iv: data.metadata_iv ?? null,
          metadata_tag: data.metadata_tag ?? null,
          encrypted_input_tokens: data.encrypted_input_tokens ?? null,
          input_tokens_iv: data.input_tokens_iv ?? null,
          input_tokens_tag: data.input_tokens_tag ?? null,
          encrypted_output_tokens: data.encrypted_output_tokens ?? null,
          output_tokens_iv: data.output_tokens_iv ?? null,
          output_tokens_tag: data.output_tokens_tag ?? null,
          encrypted_input_cost: data.encrypted_input_cost ?? null,
          input_cost_iv: data.input_cost_iv ?? null,
          input_cost_tag: data.input_cost_tag ?? null,
          encrypted_output_cost: data.encrypted_output_cost ?? null,
          output_cost_iv: data.output_cost_iv ?? null,
          output_cost_tag: data.output_cost_tag ?? null,
          encrypted_total_cost: data.encrypted_total_cost ?? null,
          total_cost_iv: data.total_cost_iv ?? null,
          total_cost_tag: data.total_cost_tag ?? null,
          created_at: new Date(),
          updated_at: new Date(),
        };
        chatsMap.set(record.id, record);
        return { ...record };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const item = chatsMap.get(where.id);
        if (!item) {
          throw new Error(`Record to update does not exist: ${where.id}`);
        }
        const updated = {
          ...item,
          ...data,
          updated_at: new Date(),
        };
        chatsMap.set(where.id, updated);
        return { ...updated };
      }),
      delete: vi.fn(async ({ where }: any) => {
        const item = chatsMap.get(where.id);
        if (!item) {
          throw new Error(`Record to delete does not exist: ${where.id}`);
        }
        chatsMap.delete(where.id);
        return { ...item };
      }),
      deleteMany: vi.fn(async () => {
        chatsMap.clear();
        return { count: 1 };
      }),
    },
    messages: {
      findMany: vi.fn(async (args?: any) => {
        let list = Array.from(messagesMap.values());
        if (args?.where?.chat_id) {
          list = list.filter((m) => m.chat_id === args.where.chat_id);
        }
        if (args?.where?.status) {
          list = list.filter((m) => m.status === args.where.status);
        }
        return list.sort((a, b) => a.sequence_number - b.sequence_number);
      }),
      findFirst: vi.fn(async (args?: any) => {
        let list = Array.from(messagesMap.values());
        if (args?.where?.chat_id) {
          list = list.filter((m) => m.chat_id === args.where.chat_id);
        }
        list.sort((a, b) => b.sequence_number - a.sequence_number);
        return list[0] ? { ...list[0] } : null;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const item = messagesMap.get(where.id);
        return item ? { ...item } : null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const record = {
          id: data.id,
          chat_id: data.chat_id,
          parent_message_id: data.parent_message_id ?? null,
          sequence_number: data.sequence_number ?? 1,
          role: data.role,
          encryption_version: data.encryption_version ?? 1,
          status: data.status ?? "ACTIVE",
          encrypted_content: data.encrypted_content,
          content_iv: data.content_iv,
          content_tag: data.content_tag,
          encrypted_tokens: data.encrypted_tokens ?? null,
          tokens_iv: data.tokens_iv ?? null,
          tokens_tag: data.tokens_tag ?? null,
          encrypted_cost: data.encrypted_cost ?? null,
          cost_iv: data.cost_iv ?? null,
          cost_tag: data.cost_tag ?? null,
          encrypted_metadata: data.encrypted_metadata ?? null,
          metadata_iv: data.metadata_iv ?? null,
          metadata_tag: data.metadata_tag ?? null,
          created_at: new Date(),
          updated_at: new Date(),
        };
        messagesMap.set(record.id, record);
        return { ...record };
      }),
      delete: vi.fn(async ({ where }: any) => {
        const item = messagesMap.get(where.id);
        if (!item) {
          throw new Error(`Record to delete does not exist: ${where.id}`);
        }
        messagesMap.delete(where.id);
        return { ...item };
      }),
      deleteMany: vi.fn(async () => {
        messagesMap.clear();
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
      chatsMap.clear();
      messagesMap.clear();
      initDefaultModels();
    },
    getVaultConfig: () => vaultConfigRecord,
    getApiKeys: () => apiKeysMap,
    getChats: () => chatsMap,
    getMessages: () => messagesMap,
    getModels: () => modelsMap,
  };
}
