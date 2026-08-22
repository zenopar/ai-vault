import crypto from "node:crypto";
import * as argon2 from "argon2";

export interface EncryptedData {
  ciphertext: string; // base64
  iv: string; // hex
  tag: string; // hex
}

export interface KdfParams {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
  hashLength: number;
}

export const DEFAULT_KDF_PARAMS: KdfParams = {
  memoryCost: 262144, // 256 MB
  timeCost: 3,
  parallelism: 1,
  hashLength: 32, // 32 bytes for AES-256-GCM
};

/**
 * Generates secure random bytes (salt)
 */
export function generateRandomSalt(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Generates the master vault key
 */
export function generateVaultKey(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Generates a random recovery password (usually presented to the user to write down)
 */
export function generateRecoveryPassword(): string {
  // 16 bytes = 128 bits of entropy.
  // We format it as uppercase hex with dashes every 4 chars for UX (e.g., ABCD-1234-EF56...)
  const rawHex = crypto.randomBytes(16).toString("hex").toUpperCase();
  const chunks = rawHex.match(/.{1,4}/g);
  return chunks ? chunks.join("-") : rawHex;
}

/**
 * Derives a 32-byte encryption key from a password and salt using Argon2id
 */
export async function deriveKey(password: string, saltHex: string, params: KdfParams = DEFAULT_KDF_PARAMS): Promise<Buffer> {
  const salt = Buffer.from(saltHex, "hex");
  
  const key = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: params.memoryCost,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
    hashLength: params.hashLength,
    salt,
    raw: true, // Returns the raw Buffer instead of the encoded string
  });

  return key;
}

export const HKDF_INFO_DB = Buffer.from("ai-vault/db/v1", "utf-8");
export const HKDF_INFO_FILES = Buffer.from("ai-vault/files/v1", "utf-8");
export const HKDF_INFO_SECRETS = Buffer.from("ai-vault/secrets/v1", "utf-8");

export const AAD_WRAPPED_VAULT_KEY_MASTER = Buffer.from("ai-vault/wrapped-vault-key/master/v1", "utf-8");
export const AAD_WRAPPED_VAULT_KEY_RECOVERY = Buffer.from("ai-vault/wrapped-vault-key/recovery/v1", "utf-8");
export const AAD_WRAPPED_VAULT_KEY_SESSION = Buffer.from("ai-vault/wrapped-vault-key/session/v1", "utf-8");

/**
 * Converts a 32-byte hex session token directly into a 32-byte AES-256 buffer key.
 */
export function sessionTokenToKey(sessionToken: string): Buffer {
  // If 64 hex characters (32 bytes), parse hex directly; otherwise derive 32-byte SHA-256 digest
  if (/^[0-9a-fA-F]{64}$/.test(sessionToken)) {
    return Buffer.from(sessionToken, "hex");
  }
  return crypto.createHash("sha256").update(sessionToken).digest();
}

/**
 * Derives a sub-key from a master key using HKDF-SHA256
 */
export function deriveSubKey(masterKey: Buffer, info: Buffer, salt: Buffer = Buffer.alloc(0), length = 32): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", masterKey, salt, info, length));
}

/**
 * Encrypts a buffer using AES-256-GCM with mandatory non-empty AAD buffer
 */
export function encryptBuffer(plaintext: Buffer, key: Buffer, aad: Buffer): EncryptedData {
  if (key.length !== 32) {
    throw new Error("Invalid key length. AES-256-GCM requires a 32-byte key.");
  }
  if (!aad || aad.length === 0) {
    throw new Error("AAD buffer cannot be empty.");
  }

  const iv = crypto.randomBytes(12); // 96-bit IV is standard for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

/**
 * Decrypts a buffer using AES-256-GCM with mandatory non-empty AAD buffer
 */
export function decryptBuffer(encrypted: EncryptedData, key: Buffer, aad: Buffer): Buffer {
  if (key.length !== 32) {
    throw new Error("Invalid key length. AES-256-GCM requires a 32-byte key.");
  }
  if (!aad || aad.length === 0) {
    throw new Error("AAD buffer cannot be empty.");
  }

  const iv = Buffer.from(encrypted.iv, "hex");
  const tag = Buffer.from(encrypted.tag, "hex");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted;
}

