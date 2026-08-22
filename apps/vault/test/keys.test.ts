import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from "vitest";
import { createVaultHttpServer } from "../src/server.js";
import { config } from "../src/config.js";
import { vaultState } from "../src/vault/state.js";
import { initVault } from "../src/vault/init.js";
import { unlockVault } from "../src/vault/unlock.js";
import { getDecryptedApiKey, addApiKey } from "../src/vault/keys.js";
import { createInMemoryPrismaMock } from "./helpers/mockDb.js";
import request from "supertest";

describe("AI API Keys API (Unit Tests / In-Memory Mock DB)", () => {
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

  it("should return 401 if missing IPC secret", async () => {
    const res = await request(server)
      .post("/keys")
      .send({ provider: "openai", name: "Test Key", apiKey: "sk-12345" });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("IPC Secret");
  });

  it("should return 401 if missing session token", async () => {
    await initVault("SecureMasterPassword123!");

    const res = await request(server)
      .post("/keys")
      .set("x-vault-secret", "test-secret")
      .send({ provider: "openai", name: "Test Key", apiKey: "sk-12345" });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("session token");
  });

  it("should return 401 if session token is invalid", async () => {
    await initVault("SecureMasterPassword123!");

    const res = await request(server)
      .post("/keys")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", "invalid-token-12345")
      .send({ provider: "openai", name: "Test Key", apiKey: "sk-12345" });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("session token");
  });

  it("should successfully encrypt and store API key with valid session token", async () => {
    // 1. Initialize vault and get session token
    const initResult = await initVault("SecureMasterPassword123!");
    expect(initResult.sessionToken).toBeDefined();
    const sessionToken = initResult.sessionToken!;

    // 2. Add API key
    const rawApiKey = "sk-proj-super-secret-openai-api-key";
    const res = await request(server)
      .post("/keys")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken)
      .send({
        provider: "openai",
        name: "My OpenAI Key",
        apiKey: rawApiKey,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.key).toBeDefined();
    expect(res.body.key.provider).toBe("openai");
    expect(res.body.key.name).toBe("My OpenAI Key");
    expect(res.body.key.id).toBeDefined();
    expect(res.body.key.models).toBeDefined();
    expect(res.body.key.models.length).toBeGreaterThan(0);
    expect(res.body.key.models.some((m: any) => m.name === "gpt-5.6-sol")).toBe(true);

    const keyId = res.body.key.id;

    // 3. Verify in DB that raw key is NOT stored in plaintext
    const dbRecord = await prisma.ai_api_keys.findUnique({ where: { id: keyId } });
    expect(dbRecord).toBeDefined();
    expect(dbRecord?.encrypted_key).toBeDefined();
    expect(dbRecord?.encrypted_key).not.toBe(rawApiKey);
    expect(dbRecord?.iv).toBeDefined();
    expect(dbRecord?.tag).toBeDefined();

    // 4. List keys (requires session token)
    const listUnauthorized = await request(server)
      .get("/keys")
      .set("x-vault-secret", "test-secret");
    expect(listUnauthorized.status).toBe(401);

    const listRes = await request(server)
      .get("/keys")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken);

    expect(listRes.status).toBe(200);
    expect(listRes.body.keys).toHaveLength(1);
    expect(listRes.body.keys[0].name).toBe("My OpenAI Key");
    expect(listRes.body.keys[0].models).toBeDefined();
    expect(listRes.body.keys[0].models.some((m: any) => m.name === "gpt-5.6-sol")).toBe(true);

    // 5. Decrypt key internally with session token
    const decryptedKey = await getDecryptedApiKey(keyId, sessionToken);
    expect(decryptedKey).toBe(rawApiKey);

    // 6. Verify that tampering with DB records (AAD mismatch or corrupted ciphertext/tag) fails decryption
    await prisma.ai_api_keys.create({
      data: {
        id: "11111111-2222-3333-4444-555555555555",
        provider: "anthropic",
        name: "Swapped",
        encrypted_key: dbRecord!.encrypted_key,
        iv: dbRecord!.iv,
        tag: dbRecord!.tag,
        is_active: true,
      },
    });

    // Decrypting swapped-id with same ciphertext should fail because AAD binds to record ID
    await expect(getDecryptedApiKey("11111111-2222-3333-4444-555555555555", sessionToken)).rejects.toThrow();

    // Clean up the swapped test record immediately
    await prisma.ai_api_keys.delete({ where: { id: "11111111-2222-3333-4444-555555555555" } });

    // 7. Delete key via RESTful DELETE /keys/:id (requires session token)
    const deleteRes = await request(server)
      .delete(`/keys/${keyId}`)
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken);

    expect(deleteRes.status).toBe(200);

    const deletedRecord = await prisma.ai_api_keys.findUnique({ where: { id: keyId } });
    expect(deletedRecord).toBeNull();
  });

  it("should support multiple concurrent session tokens, each encrypting the vault key with its own token", async () => {
    // 1. Initialize vault and get sessionToken1
    const initResult = await initVault("MultiSessionPassword123!");
    const sessionToken1 = initResult.sessionToken!;
    expect(vaultState.getSessionCount()).toBe(1);

    // 2. Unlock vault a second time to get sessionToken2
    const unlockResult = await unlockVault("MultiSessionPassword123!");
    const sessionToken2 = unlockResult.sessionToken!;
    expect(sessionToken1).not.toBe(sessionToken2);
    expect(vaultState.getSessionCount()).toBe(2);

    // 3. Add an API key using sessionToken1
    const key = await addApiKey({
      provider: "google",
      name: "Gemini Key",
      apiKey: "AIzaSyTest12345",
    }, sessionToken1);

    // 4. Decrypt using sessionToken2 (both have independent copies of vaultKey encrypted with their token)
    const decryptedWithToken2 = await getDecryptedApiKey(key.id, sessionToken2);
    expect(decryptedWithToken2).toBe("AIzaSyTest12345");

    // 5. Decrypt using sessionToken1
    const decryptedWithToken1 = await getDecryptedApiKey(key.id, sessionToken1);
    expect(decryptedWithToken1).toBe("AIzaSyTest12345");

    // 6. Destroy session 1 (log out session 1)
    vaultState.destroySession(sessionToken1);
    expect(vaultState.getSessionCount()).toBe(1);
    expect(vaultState.isUnlocked()).toBe(true);

    // session 1 should now fail
    await expect(getDecryptedApiKey(key.id, sessionToken1)).rejects.toThrow("Vault is locked or session does not exist.");

    // session 2 should still succeed
    const decryptedAfterSession1Destroyed = await getDecryptedApiKey(key.id, sessionToken2);
    expect(decryptedAfterSession1Destroyed).toBe("AIzaSyTest12345");

    // 7. Destroy session 2
    vaultState.destroySession(sessionToken2);
    expect(vaultState.getSessionCount()).toBe(0);
    expect(vaultState.isUnlocked()).toBe(false);

    // session 2 now fails
    await expect(getDecryptedApiKey(key.id, sessionToken2)).rejects.toThrow("Vault is locked or session does not exist.");
  });
});
