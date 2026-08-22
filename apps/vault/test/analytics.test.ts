import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from "vitest";
import { createVaultHttpServer } from "../src/server.js";
import { config } from "../src/config.js";
import { vaultState } from "../src/vault/state.js";
import { initVault } from "../src/vault/init.js";
import { createChat } from "../src/vault/chats/chat-crud.js";
import { encryptBuffer } from "../src/vault/crypto.js";
import { buildFieldAad } from "../src/vault/keys.js";
import { createMessageRecord } from "../src/db/repository/messages.repository.js";
import { createInMemoryPrismaMock } from "./helpers/mockDb.js";
import request from "supertest";
import { randomUUID } from "node:crypto";
import type { AnalyticsSummaryResponse } from "@ai-vault/types";

describe("Analytics & Stats API (GET /analytics & GET /stats)", () => {
  const server = createVaultHttpServer();
  const dbMock = createInMemoryPrismaMock();

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

  it("should return 401 if missing IPC secret or session token", async () => {
    const initResult = await initVault("SecureMasterPassword123!");
    const sessionToken = initResult.sessionToken!;

    // 1. Missing IPC secret
    const res1 = await request(server)
      .get("/analytics")
      .set("x-session-token", sessionToken);
    expect(res1.status).toBe(401);
    expect(res1.body.error).toContain("IPC Secret");

    // 2. Missing session token
    const res2 = await request(server)
      .get("/analytics")
      .set("x-vault-secret", "test-secret");
    expect(res2.status).toBe(401);
    expect(res2.body.error).toContain("session token");

    // 3. Invalid session token
    const res3 = await request(server)
      .get("/analytics")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", "invalid-token-xyz");
    expect(res3.status).toBe(401);
  });

  it("should return clean zero analytics when no chats or messages exist", async () => {
    const initResult = await initVault("SecureMasterPassword123!");
    const sessionToken = initResult.sessionToken!;

    const res = await request(server)
      .get("/analytics")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken);

    expect(res.status).toBe(200);
    const body: AnalyticsSummaryResponse = res.body;

    expect(body.success).toBe(true);
    expect(body.period.preset).toBe("all");
    expect(body.totals.totalMessages).toBe(0);
    expect(body.totals.userMessages).toBe(0);
    expect(body.totals.assistantMessages).toBe(0);
    expect(body.totals.inputTokens).toBe(0);
    expect(body.totals.outputTokens).toBe(0);
    expect(body.totals.thoughtTokens).toBe(0);
    expect(body.totals.totalTokens).toBe(0);
    expect(body.totals.inputCost).toBe(0);
    expect(body.totals.outputCost).toBe(0);
    expect(body.totals.thoughtCost).toBe(0);
    expect(body.totals.totalCost).toBe(0);
    expect(body.totals.totalChats).toBe(0);
    expect(body.totals.activeChats).toBe(0);
    expect(body.models.mostUsed).toBeNull();
    expect(body.models.mostExpensive).toBeNull();
    expect(body.models.breakdown).toEqual([]);
    expect(body.topExpensiveChats).toEqual([]);
    expect(body.timeline).toEqual([]);
  });

  it("should accurately aggregate tokens, costs, models, and top expensive chats with title decryption", async () => {
    const initResult = await initVault("SecureMasterPassword123!");
    const sessionToken = initResult.sessionToken!;

    // 1. Create two chats
    const chat1 = await createChat({ title: "Coding Project Alpha" }, sessionToken);
    const chat2 = await createChat({ title: "Deep Essay Research" }, sessionToken);

    // 2. Helper to insert encrypted message
    async function insertMessage(params: {
      chatId: string;
      role: "user" | "assistant";
      seq: number;
      content: string;
      modelName?: string;
      inT?: number;
      outT?: number;
      thoughtT?: number;
      inCost?: number;
      outCost?: number;
      thoughtCost?: number;
      date?: Date;
    }) {
      const msgId = randomUUID();
      const encData = await vaultState.withDbKey(sessionToken, (dbKey) => {
        const contentAad = buildFieldAad("message", msgId, "content", 1);
        const encContent = encryptBuffer(Buffer.from(params.content, "utf-8"), dbKey, contentAad);

        let encMeta: { ciphertext: string | null; iv: string | null; tag: string | null } = {
          ciphertext: null,
          iv: null,
          tag: null,
        };

        if (params.role === "assistant" && params.modelName) {
          const metaObj = {
            model_name: params.modelName,
            stats: {
              input_tokens: params.inT ?? 0,
              output_tokens: params.outT ?? 0,
              thought_tokens: params.thoughtT ?? 0,
              input_cost: params.inCost ?? 0,
              output_cost: params.outCost ?? 0,
              thought_cost: params.thoughtCost ?? 0,
            },
          };
          const metaAad = buildFieldAad("message", msgId, "metadata", 1);
          const eM = encryptBuffer(Buffer.from(JSON.stringify(metaObj), "utf-8"), dbKey, metaAad);
          encMeta = { ciphertext: eM.ciphertext, iv: eM.iv, tag: eM.tag };
        }

        return { encContent, encMeta };
      });

      await createMessageRecord({
        id: msgId,
        chat_id: params.chatId,
        sequence_number: params.seq,
        role: params.role,
        encrypted_content: encData.encContent.ciphertext,
        content_iv: encData.encContent.iv,
        content_tag: encData.encContent.tag,
        encrypted_metadata: encData.encMeta.ciphertext,
        metadata_iv: encData.encMeta.iv,
        metadata_tag: encData.encMeta.tag,
      });
    }

    // Insert Chat 1 messages (Gemini 3.7 Flash)
    await insertMessage({
      chatId: chat1.id,
      role: "user",
      seq: 1,
      content: "Write a quick sort algorithm",
    });
    await insertMessage({
      chatId: chat1.id,
      role: "assistant",
      seq: 2,
      content: "Here is quicksort in TypeScript...",
      modelName: "gemini-3.7-flash",
      inT: 100,
      outT: 200,
      thoughtT: 50,
      inCost: 0.0001,
      outCost: 0.0004,
      thoughtCost: 0.0001,
    });
    await insertMessage({
      chatId: chat1.id,
      role: "user",
      seq: 3,
      content: "Optimize it for in-place sorting",
    });
    await insertMessage({
      chatId: chat1.id,
      role: "assistant",
      seq: 4,
      content: "Here is the optimized in-place version...",
      modelName: "gemini-3.7-flash",
      inT: 300,
      outT: 400,
      thoughtT: 100,
      inCost: 0.0003,
      outCost: 0.0008,
      thoughtCost: 0.0002,
    });

    // Insert Chat 2 messages (Claude Sonnet 5 - Higher cost)
    await insertMessage({
      chatId: chat2.id,
      role: "user",
      seq: 1,
      content: "Analyze Shakespeare's Hamlet themes",
    });
    await insertMessage({
      chatId: chat2.id,
      role: "assistant",
      seq: 2,
      content: "Hamlet explores existential dread, betrayal...",
      modelName: "claude-sonnet-5",
      inT: 500,
      outT: 600,
      thoughtT: 0,
      inCost: 0.0015,
      outCost: 0.0090,
      thoughtCost: 0,
    });

    // 3. Request Analytics
    const res = await request(server)
      .get("/analytics")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken);

    expect(res.status).toBe(200);
    const body: AnalyticsSummaryResponse = res.body;

    // Verify Totals
    expect(body.totals.totalMessages).toBe(6);
    expect(body.totals.userMessages).toBe(3);
    expect(body.totals.assistantMessages).toBe(3);
    expect(body.totals.inputTokens).toBe(100 + 300 + 500); // 900
    expect(body.totals.outputTokens).toBe(200 + 400 + 600); // 1200
    expect(body.totals.thoughtTokens).toBe(50 + 100 + 0); // 150
    expect(body.totals.totalTokens).toBe(900 + 1200 + 150); // 2250

    expect(body.totals.inputCost).toBeCloseTo(0.0019, 5);
    expect(body.totals.outputCost).toBeCloseTo(0.0102, 5);
    expect(body.totals.thoughtCost).toBeCloseTo(0.0003, 5);
    expect(body.totals.totalCost).toBeCloseTo(0.0121, 5);
    expect(body.totals.totalChats).toBe(2);
    expect(body.totals.activeChats).toBe(2);

    // Verify Models
    expect(body.models.mostUsed).toBe("gemini-3.7-flash"); // 2 assistant messages
    expect(body.models.mostExpensive).toBe("claude-sonnet-5"); // $0.0105 vs $0.0016
    expect(body.models.breakdown.length).toBe(2);

    const geminiStats = body.models.breakdown.find((m) => m.modelName === "gemini-3.7-flash");
    expect(geminiStats).toBeDefined();
    expect(geminiStats?.messageCount).toBe(2);
    expect(geminiStats?.inputTokens).toBe(400);
    expect(geminiStats?.outputTokens).toBe(600);
    expect(geminiStats?.thoughtTokens).toBe(150);
    expect(geminiStats?.totalTokens).toBe(1150);
    expect(geminiStats?.totalCost).toBeCloseTo(0.0016, 5);

    const claudeStats = body.models.breakdown.find((m) => m.modelName === "claude-sonnet-5");
    expect(claudeStats).toBeDefined();
    expect(claudeStats?.messageCount).toBe(1);
    expect(claudeStats?.inputTokens).toBe(500);
    expect(claudeStats?.outputTokens).toBe(600);
    expect(claudeStats?.thoughtTokens).toBe(0);
    expect(claudeStats?.totalTokens).toBe(1100);
    expect(claudeStats?.totalCost).toBeCloseTo(0.0105, 5);

    // Verify Top Expensive Chats
    expect(body.topExpensiveChats.length).toBe(2);
    // Chat 2 should be ranked #1 because it cost ~0.0105
    expect(body.topExpensiveChats[0].id).toBe(chat2.id);
    expect(body.topExpensiveChats[0].title).toBe("Deep Essay Research");
    expect(body.topExpensiveChats[0].totalCost).toBeCloseTo(0.0105, 5);
    expect(body.topExpensiveChats[0].messageCount).toBe(2);

    // Chat 1 should be ranked #2
    expect(body.topExpensiveChats[1].id).toBe(chat1.id);
    expect(body.topExpensiveChats[1].title).toBe("Coding Project Alpha");
    expect(body.topExpensiveChats[1].totalCost).toBeCloseTo(0.0016, 5);
    expect(body.topExpensiveChats[1].messageCount).toBe(4);

    // Verify Daily Timeline
    expect(body.timeline.length).toBeGreaterThanOrEqual(1);
    const todayEntry = body.timeline[0];
    expect(todayEntry.totalMessages).toBe(6);
    expect(todayEntry.totalTokens).toBe(2250);
    expect(todayEntry.totalCost).toBeCloseTo(0.0121, 5);
  });

  it("should support /stats synonym endpoint with identical response", async () => {
    const initResult = await initVault("SecureMasterPassword123!");
    const sessionToken = initResult.sessionToken!;

    const res = await request(server)
      .get("/stats?period=30d")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.period.preset).toBe("30d");
    expect(res.body.period.from).not.toBeNull();
    expect(res.body.period.to).not.toBeNull();
  });

  it("should handle custom date range filtering (from & to)", async () => {
    const initResult = await initVault("SecureMasterPassword123!");
    const sessionToken = initResult.sessionToken!;

    const fromDateStr = "2026-08-01T00:00:00.000Z";
    const toDateStr = "2026-08-20T23:59:59.999Z";

    const res = await request(server)
      .get(`/analytics?from=${encodeURIComponent(fromDateStr)}&to=${encodeURIComponent(toDateStr)}`)
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken);

    expect(res.status).toBe(200);
    expect(res.body.period.preset).toBe("custom");
    expect(res.body.period.from).toBe(fromDateStr);
    expect(res.body.period.to).toBe(toDateStr);
  });

  it("should reject invalid topChatsLimit with 400", async () => {
    const initResult = await initVault("SecureMasterPassword123!");
    const sessionToken = initResult.sessionToken!;

    const res = await request(server)
      .get("/analytics?topChatsLimit=invalid-number")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("topChatsLimit");
  });
});
