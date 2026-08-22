import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from "vitest";
import { createVaultHttpServer } from "../src/server.js";
import { config } from "../src/config.js";
import { vaultState } from "../src/vault/state.js";
import { initVault } from "../src/vault/init.js";
import { addApiKey } from "../src/vault/keys.js";
import { createInMemoryPrismaMock } from "./helpers/mockDb.js";
import request from "supertest";

describe("End-to-End Chat & Messaging API (Unit Tests / Mock AI)", () => {
  const server = createVaultHttpServer();
  const dbMock = createInMemoryPrismaMock();
  const prisma = dbMock.mockPrisma;

  beforeAll(() => {
    config.ipcSecret = "test-secret";
  });

  beforeEach(() => {
    vaultState.lock();
    dbMock.reset();
  });

  afterAll(() => {
    vaultState.lock();
    dbMock.reset();
    vi.restoreAllMocks();
  });

  it("should return 400 when sending message if no API keys are configured", async () => {
    const initResult = await initVault("SecureMasterPassword123!");
    const sessionToken = initResult.sessionToken!;

    const res = await request(server)
      .post("/chats/messages")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken)
      .send({
        message: "Hello AI!",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No active API keys found");
  });

  it("should create chat, execute AI completion, encrypt messages with AAD, and return response", async () => {
    // 1. Initialize vault and add active OpenAI key
    const initResult = await initVault("SecureMasterPassword123!");
    const sessionToken = initResult.sessionToken!;

    await addApiKey(
      {
        provider: "openai",
        name: "Main OpenAI Key",
        apiKey: "sk-proj-test-key-12345",
      },
      sessionToken
    );

    // 2. Mock fetch for OpenAI API call
    const mockAiResponse = "Hello! I am your private, zero-trust AI assistant.";
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("api.openai.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: mockAiResponse,
                },
              },
            ],
          }),
        };
      }
      return { ok: false, status: 404, text: async () => "Not Found" };
    });

    // 3. Send message without existing chatId (starts a new chat)
    const prompt = "Can you help me design an encrypted database architecture?";
    const res = await request(server)
      .post("/chats/messages")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken)
      .send({
        message: prompt,
        provider: "openai",
        model: "gpt-5.6-sol",
      });

    if (res.status !== 200) {
      console.error("Test failed with status:", res.status, res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.chat).toBeDefined();
    expect(res.body.chat.id).toBeDefined();
    expect(res.body.chat.title).toBe(prompt.substring(0, 37) + "...");
    expect(res.body.userMessage).toBeDefined();
    expect(res.body.userMessage.content).toBe(prompt);
    expect(res.body.assistantMessage).toBeDefined();
    expect(res.body.assistantMessage.content).toBe(mockAiResponse);

    const chatId = res.body.chat.id;

    // 4. Verify in DB that messages are strongly encrypted
    const dbMessages = await prisma.messages.findMany({ where: { chat_id: chatId } });
    expect(dbMessages).toHaveLength(2);

    // User message in DB
    const dbUserMsg = dbMessages.find((m) => m.role === "user");
    expect(dbUserMsg).toBeDefined();
    expect(dbUserMsg?.encrypted_content).not.toBe(prompt);
    expect(dbUserMsg?.content_iv).toBeDefined();
    expect(dbUserMsg?.content_tag).toBeDefined();

    // Assistant message in DB
    const dbAssistantMsg = dbMessages.find((m) => m.role === "assistant");
    expect(dbAssistantMsg).toBeDefined();
    expect(dbAssistantMsg?.encrypted_content).not.toBe(mockAiResponse);
    expect(dbAssistantMsg?.content_iv).toBeDefined();
    expect(dbAssistantMsg?.content_tag).toBeDefined();

    // 5. Test GET /chats to verify chat list with decrypted title
    const listRes = await request(server)
      .get("/chats")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.chats).toHaveLength(1);
    expect(listRes.body.chats[0].id).toBe(chatId);
    expect(listRes.body.chats[0].title).toBe(prompt.substring(0, 37) + "...");

    // 6. Test GET /chats/:id/messages to retrieve decrypted history
    const historyRes = await request(server)
      .get(`/chats/${chatId}/messages`)
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.success).toBe(true);
    expect(historyRes.body.messages).toHaveLength(2);
    expect(historyRes.body.messages[0].content).toBe(prompt);
    expect(historyRes.body.messages[1].content).toBe(mockAiResponse);

    // 7. Send follow-up message to the same chat
    const followUpMockResponse = "Sure! Let's explore AES-256-GCM and AAD binding.";
    (global.fetch as any).mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: followUpMockResponse } }],
      }),
    }));

    const followUpRes = await request(server)
      .post("/chats/messages")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken)
      .send({
        chatId,
        message: "What encryption mode should we use?",
      });

    expect(followUpRes.status).toBe(200);
    expect(followUpRes.body.chat.id).toBe(chatId);
    expect(followUpRes.body.userMessage.content).toBe("What encryption mode should we use?");
    expect(followUpRes.body.assistantMessage.content).toBe(followUpMockResponse);

    // History should now contain 4 messages
    const updatedHistory = await request(server)
      .get(`/chats/${chatId}/messages`)
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken);

    expect(updatedHistory.body.messages).toHaveLength(4);
  });

  it("should accept thinkingLevel parameter and propagate it properly", async () => {
    const initResult = await initVault("SecureMasterPassword123!");
    const sessionToken = initResult.sessionToken!;

    await addApiKey(
      {
        provider: "google",
        name: "Google Key",
        apiKey: "AIzaSyTestKey123",
      },
      sessionToken
    );

    let capturedRequestBody: any = null;
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        capturedRequestBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "Here is a thought-out answer with high reasoning." }],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 15,
              candidatesTokenCount: 30,
              thinkingTokenCount: 20,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const res = await request(server)
      .post("/chats/messages")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken)
      .send({
        message: "Explain quantum computing with high thinking",
        provider: "google",
        model: "gemini-3.7-flash",
        thinkingLevel: "high",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.assistantMessage.thinkingLevel).toBe("high");
    expect(res.body.assistantMessage.thoughtTokens).toBe(20);
    expect(capturedRequestBody).toBeDefined();
    expect(capturedRequestBody.generation_config.thinking_config.thinking_level).toBe("high");

    // Also test with thinkingLevel: "none"
    const resNone = await request(server)
      .post("/chats/messages")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken)
      .send({
        chatId: res.body.chat.id,
        message: "Quick question without thinking",
        provider: "google",
        model: "gemini-3.7-flash",
        thinkingLevel: "none",
      });

    expect(resNone.status).toBe(200);
    expect(resNone.body.assistantMessage.thinkingLevel).toBe("none");
    expect(capturedRequestBody.generation_config.thinking_config).toBeUndefined();
  });
});
