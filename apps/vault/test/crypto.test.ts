import { describe, it, expect } from "vitest";
import { 
  encryptBuffer, 
  decryptBuffer, 
  deriveKey, 
  deriveSubKey,
  generateRandomSalt,
  generateVaultKey,
  HKDF_INFO_DB,
  HKDF_INFO_SECRETS,
  AAD_WRAPPED_VAULT_KEY_MASTER,
  sessionTokenToKey
} from "../src/vault/crypto.js";

describe("Crypto Module Unit Tests (Pure In-Memory)", () => {
  it("should generate 32-byte (256-bit) random vault key", () => {
    const key = generateVaultKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("should generate random salt hex string", () => {
    const salt = generateRandomSalt(32);
    expect(typeof salt).toBe("string");
    expect(salt.length).toBe(64); // 32 bytes in hex = 64 chars
  });

  it("should derive key from password using Argon2id", async () => {
    const salt = generateRandomSalt(16);
    const key = await deriveKey("MySecurePassword123!", salt, {
      memoryCost: 4096, // low memory for fast unit test
      timeCost: 1,
      parallelism: 1,
      hashLength: 32,
    });
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("should derive deterministic domain-separated sub-keys using HKDF", () => {
    const masterKey = generateVaultKey();
    const dbKey1 = deriveSubKey(masterKey, HKDF_INFO_DB);
    const dbKey2 = deriveSubKey(masterKey, HKDF_INFO_DB);
    const secretsKey = deriveSubKey(masterKey, HKDF_INFO_SECRETS);

    expect(dbKey1.equals(dbKey2)).toBe(true);
    expect(dbKey1.equals(secretsKey)).toBe(false);
  });

  it("should encrypt and decrypt buffer with valid key and non-empty AAD", () => {
    const key = generateVaultKey();
    const plaintext = Buffer.from("Super secret prompt text", "utf-8");
    const aad = Buffer.from("type:chat_message|id:msg-123|field:content|v:1", "utf-8");

    const encrypted = encryptBuffer(plaintext, key, aad);
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();

    const decrypted = decryptBuffer(encrypted, key, aad);
    expect(decrypted.toString("utf-8")).toBe("Super secret prompt text");
  });

  it("should reject empty AAD buffer during encryption and decryption", () => {
    const key = generateVaultKey();
    const plaintext = Buffer.from("Secret", "utf-8");
    const emptyAad = Buffer.alloc(0);

    expect(() => encryptBuffer(plaintext, key, emptyAad)).toThrow("AAD buffer cannot be empty.");

    const validAad = Buffer.from("valid-aad", "utf-8");
    const encrypted = encryptBuffer(plaintext, key, validAad);

    expect(() => decryptBuffer(encrypted, key, emptyAad)).toThrow("AAD buffer cannot be empty.");
  });

  it("should fail decryption when AAD does not match (tampering detection)", () => {
    const key = generateVaultKey();
    const plaintext = Buffer.from("Secret data", "utf-8");
    const aadOriginal = Buffer.from("type:ai_api_key|id:id-111|field:apiKey|v:1", "utf-8");
    const aadTampered = Buffer.from("type:ai_api_key|id:id-222|field:apiKey|v:1", "utf-8");

    const encrypted = encryptBuffer(plaintext, key, aadOriginal);

    expect(() => decryptBuffer(encrypted, key, aadTampered)).toThrow();
  });

  it("should convert 32-byte hex session token directly to 32-byte AES key buffer", () => {
    const raw32BytesHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const key = sessionTokenToKey(raw32BytesHex);

    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
    expect(key.toString("hex")).toBe(raw32BytesHex);

    // Also support arbitrary string tokens by hashing to 32 bytes
    const strToken = "my-custom-test-session-token";
    const key2 = sessionTokenToKey(strToken);
    expect(key2).toBeInstanceOf(Buffer);
    expect(key2.length).toBe(32);
  });
});
