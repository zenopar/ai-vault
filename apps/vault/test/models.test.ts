import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from "vitest";
import { createVaultHttpServer } from "../src/server.js";
import { config } from "../src/config.js";
import { vaultState } from "../src/vault/state.js";
import { initVault } from "../src/vault/init.js";
import { createInMemoryPrismaMock } from "./helpers/mockDb.js";
import request from "supertest";

describe("AI Models API (Unit Tests / In-Memory Mock DB)", () => {
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

  it("should return 401 if missing IPC secret", async () => {
    const res = await request(server).get("/models");
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("IPC Secret");
  });

  it("should return 401 if missing session token", async () => {
    await initVault("SecureMasterPassword123!");

    const res = await request(server)
      .get("/models")
      .set("x-vault-secret", "test-secret");
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("session token");
  });

  it("should return all models with valid session token", async () => {
    const initResult = await initVault("SecureMasterPassword123!");
    const sessionToken = initResult.sessionToken!;

    const res = await request(server)
      .get("/models")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.models)).toBe(true);
    expect(res.body.models.length).toBeGreaterThan(5);

    // Verify some known models exist
    const names = res.body.models.map((m: any) => m.name);
    expect(names).toContain("gemini-3.7-flash");
    expect(names).toContain("gpt-5.6-sol");
    expect(names).toContain("claude-sonnet-5");
    expect(names).toContain("deepseek-v4-pro");
    expect(names).toContain("openai/gpt-oss-120b");
  });

  it("should filter models by provider (e.g., google / gemini)", async () => {
    const initResult = await initVault("SecureMasterPassword123!");
    const sessionToken = initResult.sessionToken!;

    const res = await request(server)
      .get("/models?provider=google")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.models.length).toBeGreaterThan(0);
    expect(res.body.models.every((m: any) => m.provider === "google")).toBe(true);
    expect(res.body.models.some((m: any) => m.name === "gemini-3.7-flash")).toBe(true);
    expect(res.body.models.some((m: any) => m.name === "gpt-5.6-sol")).toBe(false);
  });

  it("should filter models for openai and anthropic", async () => {
    const initResult = await initVault("SecureMasterPassword123!");
    const sessionToken = initResult.sessionToken!;

    const openaiRes = await request(server)
      .get("/models?provider=openai")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken);

    expect(openaiRes.status).toBe(200);
    expect(openaiRes.body.models.every((m: any) => m.provider === "openai")).toBe(true);
    expect(openaiRes.body.models.some((m: any) => m.name === "gpt-5.6-sol")).toBe(true);

    const claudeRes = await request(server)
      .get("/models?provider=anthropic")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken);

    expect(claudeRes.status).toBe(200);
    expect(claudeRes.body.models.every((m: any) => m.provider === "anthropic")).toBe(true);
    expect(claudeRes.body.models.some((m: any) => m.name === "claude-sonnet-5")).toBe(true);
  });
});

