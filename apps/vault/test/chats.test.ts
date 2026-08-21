import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from "vitest";
import { createVaultHttpServer } from "../src/server.js";
import { config } from "../src/config.js";
import { vaultState } from "../src/vault/state.js";
import { initVault } from "../src/vault/init.js";
import { decryptChatTitle } from "../src/vault/chats/index.js";
import { createInMemoryPrismaMock } from "./helpers/mockDb.js";
import request from "supertest";

describe("Chats API (Unit Tests / In-Memory Mock DB)", () => {
  const server = createVaultHttpServer();
  const dbMock = createInMemoryPrismaMock();
  const prisma = dbMock.mockPrisma;

  async function getDecryptedChatTitle(chatId: string) {
    const record = await prisma.chats.findUnique({ where: { id: chatId } });
    if (!record) throw new Error("Not found");
    return decryptChatTitle(record, vaultState.getDbKey()!, false);
  }

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
      .post("/chats")
      .send({ title: "My New Chat" });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("IPC Secret");
  });

  it("should return 401 if missing session token", async () => {
    await initVault("SecureMasterPassword123!");

    const res = await request(server)
      .post("/chats")
      .set("x-vault-secret", "test-secret")
      .send({ title: "My New Chat" });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("session token");
  });

  it("should return 401 if session token is invalid", async () => {
    await initVault("SecureMasterPassword123!");

    const res = await request(server)
      .post("/chats")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", "invalid-token-12345")
      .send({ title: "My New Chat" });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("session token");
  });

  it("should successfully encrypt and store chat with valid session token and default title", async () => {
    // 1. Initialize vault and get session token
    const initResult = await initVault("SecureMasterPassword123!");
    expect(initResult.sessionToken).toBeDefined();
    const sessionToken = initResult.sessionToken!;

    // 2. Create chat without title (should default to "New Chat")
    const res = await request(server)
      .post("/chats")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.chat).toBeDefined();
    expect(res.body.chat.id).toBeDefined();
    expect(res.body.chat.title).toBe("New Chat");
    expect(res.body.chat.status).toBe("ACTIVE");
    expect(res.body.chat.createdAt).toBeDefined();

    const chatId = res.body.chat.id;

    // 3. Verify in DB that raw title is encrypted
    const dbRecord = await prisma.chats.findUnique({ where: { id: chatId } });
    expect(dbRecord).toBeDefined();
    expect(dbRecord?.encrypted_title).toBeDefined();
    expect(dbRecord?.encrypted_title).not.toBe("New Chat");
    expect(dbRecord?.title_iv).toBeDefined();
    expect(dbRecord?.title_tag).toBeDefined();

    // 4. Verify decryption with AAD
    const decryptedTitle = await getDecryptedChatTitle(chatId);
    expect(decryptedTitle).toBe("New Chat");
  });

  it("should successfully encrypt and store chat with custom title and metadata", async () => {
    const initResult = await initVault("SecureMasterPassword123!");
    const sessionToken = initResult.sessionToken!;

    const customTitle = "Project Security Architecture Discussion";
    const customMetadata = { tags: ["security", "architecture"], model: "gemini-3.7-flash" };

    const res = await request(server)
      .post("/chats")
      .set("x-vault-secret", "test-secret")
      .set("x-session-token", sessionToken)
      .send({
        title: customTitle,
        metadata: customMetadata,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.chat.id).toBeDefined();
    expect(res.body.chat.title).toBe(customTitle);
    expect(res.body.chat.metadata).toEqual(customMetadata);

    const chatId = res.body.chat.id;

    // Check DB record
    const dbRecord = await prisma.chats.findUnique({ where: { id: chatId } });
    expect(dbRecord).toBeDefined();
    expect(dbRecord?.encrypted_title).not.toBe(customTitle);
    expect(dbRecord?.encrypted_metadata).toBeDefined();
    expect(dbRecord?.metadata_iv).toBeDefined();
    expect(dbRecord?.metadata_tag).toBeDefined();

    // Decrypt title and verify
    const decryptedTitle = await getDecryptedChatTitle(chatId);
    expect(decryptedTitle).toBe(customTitle);

    // Tampering test: create a swapped record with mismatched ID
    await prisma.chats.create({
      data: {
        id: "22222222-3333-4444-5555-666666666666",
        encryption_version: 1,
        status: "ACTIVE",
        encrypted_title: dbRecord!.encrypted_title,
        title_iv: dbRecord!.title_iv,
        title_tag: dbRecord!.tag ?? dbRecord!.title_tag,
      },
    });

    // Decryption of swapped ID must fail because AAD binds to record ID
    await expect(getDecryptedChatTitle("22222222-3333-4444-5555-666666666666")).rejects.toThrow();
  });
});
