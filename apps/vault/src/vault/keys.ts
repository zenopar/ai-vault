import { randomUUID } from "node:crypto";
import { vaultState, VaultLockedError } from "./state.js";
import { encryptBuffer, decryptBuffer, type EncryptedData } from "./crypto.js";
import { 
  createApiKeyRecord, 
  getAllApiKeys, 
  getApiKeyRecordById, 
  deleteApiKeyRecord,
  type ApiKeyRecord
} from "../db/repository/keys.repository.js";
import { AiApiKeyMetadata } from "@ai-vault/types";

import { listModels } from "./models.js";

export { VaultLockedError };

export class ApiKeyNotFoundError extends Error {
  constructor(message = "API key not found.") {
    super(message);
    this.name = "ApiKeyNotFoundError";
  }
}

/**
 * Builds standard Additional Authenticated Data (AAD) for database field encryption
 * Format based on README: type:<record_type>|id:<record_id>|field:<field_name>|v:<version>
 */
export function buildFieldAad(recordType: string, recordId: string, fieldName: string, version = 1): Buffer {
  return Buffer.from(`type:${recordType}|id:${recordId}|field:${fieldName}|v:${version}`, "utf-8");
}

/**
 * Encrypts an AI API key using the transient HKDF secrets key and stores it in the database with AAD binding.
 */
export async function addApiKey(
  params: {
    provider: string;
    name: string;
    apiKey: string;
  },
  sessionToken: string
): Promise<AiApiKeyMetadata> {
  const recordId = randomUUID();
  const aad = buildFieldAad("ai_api_key", recordId, "apiKey", 1);
  const plaintextBuffer = Buffer.from(params.apiKey.trim(), "utf-8");

  let encrypted: EncryptedData;
  try {
    encrypted = await vaultState.withSecretsKey(sessionToken, (secretsKey) => {
      return encryptBuffer(plaintextBuffer, secretsKey, aad);
    });
  } finally {
    plaintextBuffer.fill(0);
  }

  const record = await createApiKeyRecord({
    id: recordId,
    provider: params.provider.trim().toLowerCase(),
    name: params.name.trim(),
    encrypted_key: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
  });

  const models = await listModels(record.provider);

  return {
    id: record.id,
    provider: record.provider,
    name: record.name,
    isActive: record.is_active,
    models,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

/**
 * Lists all stored AI API keys metadata (without exposing ciphertext) along with associated models.
 */
export async function listApiKeys(): Promise<AiApiKeyMetadata[]> {
  const records = await getAllApiKeys();
  const allModels = await listModels();

  return records.map((r: ApiKeyRecord) => ({
    id: r.id,
    provider: r.provider,
    name: r.name,
    isActive: r.is_active,
    models: allModels.filter((m) => m.provider.toLowerCase() === r.provider.toLowerCase()),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

/**
 * Decrypts an AI API key using the transient HKDF secrets key and verifies AAD integrity.
 */
export async function getDecryptedApiKey(id: string, sessionToken: string): Promise<string> {
  const record = await getApiKeyRecordById(id);
  if (!record) {
    throw new ApiKeyNotFoundError();
  }

  const aad = buildFieldAad("ai_api_key", record.id, "apiKey", 1);

  const decryptedBuffer = await vaultState.withSecretsKey(sessionToken, (secretsKey) => {
    return decryptBuffer(
      {
        ciphertext: record.encrypted_key,
        iv: record.iv,
        tag: record.tag,
      },
      secretsKey,
      aad
    );
  });

  try {
    return decryptedBuffer.toString("utf-8");
  } finally {
    decryptedBuffer.fill(0);
  }
}

/**
 * Deletes an AI API key record from the database.
 */
export async function removeApiKey(id: string, sessionToken?: string): Promise<boolean> {
  if (sessionToken && !vaultState.verifySession(sessionToken)) {
    throw new VaultLockedError();
  }
  if (!vaultState.isUnlocked()) {
    throw new VaultLockedError();
  }

  const existing = await getApiKeyRecordById(id);
  if (!existing) {
    throw new ApiKeyNotFoundError();
  }

  await deleteApiKeyRecord(id);
  return true;
}
