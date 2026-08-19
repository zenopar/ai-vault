import { describe, it, expect, beforeEach, vi, afterAll, beforeAll } from "vitest";
import { createVaultHttpServer } from "../src/server.js";
import { getPrismaClient } from "../src/db/client.js";
import { config } from "../src/config.js";
import request from "supertest";

describe("POST /init", () => {
  const server = createVaultHttpServer();
  const prisma = getPrismaClient();

  beforeAll(() => {
    config.ipcSecret = "test-secret";
  });

  beforeEach(async () => {
    // Clear the database before each test
    await prisma.vault_config.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should return 401 if missing IPC secret", async () => {
    const res = await request(server).post("/init").send({ masterPassword: "test-password" });
    expect(res.status).toBe(401);
  });

  it("should initialize the vault successfully on first call", async () => {
    const res = await request(server)
      .post("/init")
      .set("x-vault-secret", "test-secret")
      .send({ masterPassword: "test-password" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.recoveryPassword).toBeDefined();

    // Verify it was saved in the database
    const config = await prisma.vault_config.findFirst();
    expect(config).toBeDefined();
    expect(config?.kdf_algorithm).toBe("argon2id");
    expect(config?.wrapped_vault_key).toBeDefined();

    // Check status is now UNLOCKED since we auto-unlock on init
    const statusRes = await request(server)
      .get("/status")
      .set("x-vault-secret", "test-secret");
    
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe("UNLOCKED");
  });

  it("should return 400 if vault is already initialized", async () => {
    // First initialization
    await request(server)
      .post("/init")
      .set("x-vault-secret", "test-secret")
      .send({ masterPassword: "test-password" });

    // Second initialization attempt
    const res2 = await request(server)
      .post("/init")
      .set("x-vault-secret", "test-secret")
      .send({ masterPassword: "another-password" });

    expect(res2.status).toBe(400);
    expect(res2.body.error).toBe("Vault is already initialized.");
  });

  it("should return 400 if masterPassword is not provided", async () => {
    const res = await request(server)
      .post("/init")
      .set("x-vault-secret", "test-secret")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("masterPassword is required and must be a string.");
  });
});
