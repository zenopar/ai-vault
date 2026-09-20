import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  encryptFilePayload,
  decryptFilePayload,
  FileDecryptionError,
} from "../src/vault/files/file-crypto.js";
import { parseR2Config } from "../src/vault/files/r2-client.js";

describe("File Encryption & Container Unit Tests", () => {
  const fileMasterKey = crypto.randomBytes(32);
  const fileId = "12345678-1234-4000-8000-123456789abc";

  it("should encrypt and decrypt a file payload correctly with exact byte match", () => {
    const originalData = Buffer.from("Hello AI Vault! This is an encrypted image or video buffer test.", "utf-8");

    const container = encryptFilePayload(originalData, fileMasterKey, fileId);

    // Verify container header
    expect(container.subarray(0, 4).toString("utf-8")).toBe("AIV1");
    expect(container.readUInt8(4)).toBe(1);
    expect(container.length).toBe(originalData.length + 33);

    // Decrypt container
    const decrypted = decryptFilePayload(container, fileMasterKey, fileId);
    expect(decrypted.equals(originalData)).toBe(true);
    expect(decrypted.toString("utf-8")).toBe(originalData.toString("utf-8"));
  });

  it("should handle large binary payloads (e.g. 5 MB simulated image)", () => {
    const largeData = crypto.randomBytes(5 * 1024 * 1024); // 5 MB random binary

    const container = encryptFilePayload(largeData, fileMasterKey, fileId);
    const decrypted = decryptFilePayload(container, fileMasterKey, fileId);

    expect(decrypted.equals(largeData)).toBe(true);
  });

  it("should reject decryption if fileId (AAD) does not match (tampering detection)", () => {
    const originalData = Buffer.from("Secret file content", "utf-8");
    const container = encryptFilePayload(originalData, fileMasterKey, fileId);

    const wrongFileId = "87654321-4321-4000-8000-cba987654321";
    expect(() => {
      decryptFilePayload(container, fileMasterKey, wrongFileId);
    }).toThrow(FileDecryptionError);
  });

  it("should reject decryption if container ciphertext is tampered with", () => {
    const originalData = Buffer.from("Sensitive image data", "utf-8");
    const container = encryptFilePayload(originalData, fileMasterKey, fileId);

    // Tamper with one byte in the ciphertext payload
    container[container.length - 1] ^= 0xff;

    expect(() => {
      decryptFilePayload(container, fileMasterKey, fileId);
    }).toThrow(FileDecryptionError);
  });

  it("should reject decryption if key is wrong", () => {
    const originalData = Buffer.from("Sensitive image data", "utf-8");
    const container = encryptFilePayload(originalData, fileMasterKey, fileId);
    const wrongKey = crypto.randomBytes(32);

    expect(() => {
      decryptFilePayload(container, wrongKey, fileId);
    }).toThrow(FileDecryptionError);
  });

  it("should parse R2 config and extract bucket name from URL path", () => {
    const prevUrl = process.env["R2_URL"];
    const prevKey = process.env["R2_ACCES_KEY_ID"];
    const prevSecret = process.env["R2_SECRET_ACCESS_KEY"];
    const prevBucket = process.env["R2_BUCKET_NAME"];

    try {
      delete process.env["R2_BUCKET_NAME"];
      process.env["R2_URL"] = "https://abc123account.r2.cloudflarestorage.com/my-test-bucket";
      process.env["R2_ACCES_KEY_ID"] = "test-access-key";
      process.env["R2_SECRET_ACCESS_KEY"] = "test-secret-key";

      const config = parseR2Config();
      expect(config.endpoint).toBe("https://abc123account.r2.cloudflarestorage.com");
      expect(config.bucketName).toBe("my-test-bucket");
      expect(config.accessKeyId).toBe("test-access-key");
      expect(config.secretAccessKey).toBe("test-secret-key");
    } finally {
      process.env["R2_URL"] = prevUrl;
      process.env["R2_ACCES_KEY_ID"] = prevKey;
      process.env["R2_SECRET_ACCESS_KEY"] = prevSecret;
      if (prevBucket !== undefined) process.env["R2_BUCKET_NAME"] = prevBucket;
      else delete process.env["R2_BUCKET_NAME"];
    }
  });
});
