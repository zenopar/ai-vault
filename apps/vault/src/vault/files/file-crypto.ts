import crypto from "node:crypto";
import { buildFieldAad } from "../keys.js";

const FILE_MAGIC = Buffer.from("AIV1", "utf-8"); // AI Vault v1 file magic
const FILE_VERSION = 1;

export class FileDecryptionError extends Error {
  constructor(message = "Failed to decrypt file. Data may be corrupted or tampered with.") {
    super(message);
    this.name = "FileDecryptionError";
  }
}

/**
 * Encrypts arbitrary file data into an authenticated self-describing binary container.
 * Format:
 * [MAGIC: 4B ("AIV1")] [VERSION: 1B (0x01)] [IV: 12B] [TAG: 16B] [CIPHERTEXT: NB]
 */
export function encryptFilePayload(
  data: Buffer,
  fileMasterKey: Buffer,
  fileId: string
): Buffer {
  if (fileMasterKey.length !== 32) {
    throw new Error("Invalid file master key length. Expected 32 bytes.");
  }

  const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM
  const aad = buildFieldAad("file_data", fileId, "content", FILE_VERSION);

  const cipher = crypto.createCipheriv("aes-256-gcm", fileMasterKey, iv);
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([
    FILE_MAGIC,
    Buffer.from([FILE_VERSION]),
    iv,
    tag,
    ciphertext,
  ]);
}

/**
 * Decrypts a binary container back into the original file buffer.
 * Authenticates the container magic, version, AAD, and GCM authentication tag.
 */
export function decryptFilePayload(
  encryptedContainer: Buffer,
  fileMasterKey: Buffer,
  fileId: string
): Buffer {
  if (fileMasterKey.length !== 32) {
    throw new Error("Invalid file master key length. Expected 32 bytes.");
  }

  const minLength = 4 + 1 + 12 + 16;
  if (!encryptedContainer || encryptedContainer.length < minLength) {
    throw new FileDecryptionError("Invalid file container: buffer is too short.");
  }

  // 1. Verify Magic
  const magic = encryptedContainer.subarray(0, 4);
  if (!magic.equals(FILE_MAGIC)) {
    throw new FileDecryptionError("Invalid file container: unexpected magic header.");
  }

  // 2. Verify Version
  const version = encryptedContainer.readUInt8(4);
  if (version !== FILE_VERSION) {
    throw new FileDecryptionError(`Unsupported file container version: ${version}.`);
  }

  // 3. Extract IV, Tag, and Ciphertext
  const iv = encryptedContainer.subarray(5, 17);
  const tag = encryptedContainer.subarray(17, 33);
  const ciphertext = encryptedContainer.subarray(33);

  const aad = buildFieldAad("file_data", fileId, "content", version);

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", fileMasterKey, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext;
  } catch (err: any) {
    throw new FileDecryptionError(`File decryption failed: ${err.message}`);
  }
}
