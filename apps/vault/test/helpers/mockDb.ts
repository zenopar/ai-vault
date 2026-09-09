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
  let settingsRecord: any = null;
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
    $transaction: vi.fn(async (callback) => {
      if (Array.isArray(callback)) {
        // Handle array of Prisma promises if they use that overload
        return Promise.all(callback);
      }
      // Handle interactive transaction callback
      return callback(mockPrisma);
    }),
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
          ...data,
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
    settings: {
      findFirst: vi.fn(async () => settingsRecord),
      create: vi.fn(async ({ data }: any) => {
        settingsRecord = { ...data, id: data.id || "mock-settings-id", created_at: new Date(), updated_at: new Date() };
        return { ...settingsRecord };
      }),
      update: vi.fn(async ({ data }: any) => {
        if (!settingsRecord) throw new Error("Record to update does not exist.");
        settingsRecord = { ...settingsRecord, ...data, updated_at: new Date() };
        return { ...settingsRecord };
      }),
      deleteMany: vi.fn(async () => {
        settingsRecord = null;
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
          is_active: true,
          ...data,
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
          encryption_version: 1,
          status: "ACTIVE",
          ...data,
          created_at: data.created_at ?? new Date(),
          updated_at: data.updated_at ?? new Date(),
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
      count: vi.fn(async (args?: any) => {
        let list = Array.from(messagesMap.values());
        if (args?.where?.chat_id) {
          list = list.filter((m) => m.chat_id === args.where.chat_id);
        }
        if (args?.where?.status) {
          list = list.filter((m) => m.status === args.where.status);
        }
        return list.length;
      }),
      findMany: vi.fn(async (args?: any) => {
        let list = Array.from(messagesMap.values());
        if (args?.where?.chat_id) {
          list = list.filter((m) => m.chat_id === args.where.chat_id);
        }
        if (args?.where?.status) {
          list = list.filter((m) => m.status === args.where.status);
        }
        if (args?.where?.created_at) {
          if (args.where.created_at.gte) {
            const gte = new Date(args.where.created_at.gte).getTime();
            list = list.filter((m) => new Date(m.created_at).getTime() >= gte);
          }
          if (args.where.created_at.lte) {
            const lte = new Date(args.where.created_at.lte).getTime();
            list = list.filter((m) => new Date(m.created_at).getTime() <= lte);
          }
        }
        if (args?.orderBy?.created_at) {
          const dir = args.orderBy.created_at === "desc" ? -1 : 1;
          list.sort((a, b) => (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir);
        } else if (args?.orderBy?.sequence_number) {
          const dir = args.orderBy.sequence_number === "desc" ? -1 : 1;
          list.sort((a, b) => (a.sequence_number - b.sequence_number) * dir);
        } else {
          list.sort((a, b) => a.sequence_number - b.sequence_number);
        }

        const skip = args?.skip ?? 0;
        const take = args?.take !== undefined ? args.take : list.length;
        return list.slice(skip, skip + take);
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
          parent_message_id: null,
          sequence_number: 1,
          encryption_version: 1,
          status: "ACTIVE",
          ...data,
          created_at: data.created_at ? new Date(data.created_at) : new Date(),
          updated_at: data.updated_at ? new Date(data.updated_at) : new Date(),
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
          is_active: true,
          ...data,
          provider: (data.provider || "").toLowerCase(),
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
      settingsRecord = null;
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
