import { vaultState } from "../state.js";
import { VaultLockedError, buildFieldAad } from "../keys.js";
import { decryptBuffer } from "../crypto.js";
import type { ChatRecord } from "../../db/repository/chats.repository.js";

// === 1. STATE & VALIDATION ===

export class ChatNotFoundError extends Error {
  constructor(message = "Chat not found.") {
    super(message);
    this.name = "ChatNotFoundError";
  }
}

/**
 * Ensures the vault is unlocked and the database key is present.
 * Throws VaultLockedError if not.
 */
export function requireDbKey(): Buffer {
  if (!vaultState.isUnlocked()) {
    throw new VaultLockedError();
  }
  const dbKey = vaultState.getDbKey();
  if (!dbKey) {
    throw new VaultLockedError("Database encryption key is unavailable in memory.");
  }
  return dbKey;
}

// === 2. CRYPTO HELPERS ===

export interface DecryptedChatFields {
  metadata: Record<string, any> | null;
  inputTokens?: number;
  outputTokens?: number;
  inputCost?: number;
  outputCost?: number;
  totalCost?: number;
}

/**
 * Decrypts chat metadata, inputTokens, and outputTokens.
 * Failures here are swallowed to prevent breaking chat loads.
 */
export function decryptChatFields(record: ChatRecord, dbKey: Buffer): DecryptedChatFields {
  let metadata: Record<string, any> | null = null;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  if (record.encrypted_metadata && record.metadata_iv && record.metadata_tag) {
    try {
      const metaAad = buildFieldAad("chat", record.id, "metadata", record.encryption_version);
      const decMeta = decryptBuffer(
        { ciphertext: record.encrypted_metadata, iv: record.metadata_iv, tag: record.metadata_tag },
        dbKey, metaAad
      );
      metadata = JSON.parse(decMeta.toString("utf-8"));
    } catch (e) { console.warn(`Failed to decrypt metadata for chat ${record.id}:`, e); }
  }

  if (record.encrypted_input_tokens && record.input_tokens_iv && record.input_tokens_tag) {
    try {
      const inAad = buildFieldAad("chat", record.id, "input_tokens", record.encryption_version);
      const decIn = decryptBuffer({ ciphertext: record.encrypted_input_tokens, iv: record.input_tokens_iv, tag: record.input_tokens_tag }, dbKey, inAad);
      const parsedIn = parseInt(decIn.toString("utf-8"), 10);
      inputTokens = Number.isNaN(parsedIn) ? undefined : parsedIn;
    } catch (e) { console.warn(`Failed to decrypt input_tokens for chat ${record.id}:`, e); }
  }

  if (record.encrypted_output_tokens && record.output_tokens_iv && record.output_tokens_tag) {
    try {
      const outAad = buildFieldAad("chat", record.id, "output_tokens", record.encryption_version);
      const decOut = decryptBuffer({ ciphertext: record.encrypted_output_tokens, iv: record.output_tokens_iv, tag: record.output_tokens_tag }, dbKey, outAad);
      const parsedOut = parseInt(decOut.toString("utf-8"), 10);
      outputTokens = Number.isNaN(parsedOut) ? undefined : parsedOut;
    } catch (e) { console.warn(`Failed to decrypt output_tokens for chat ${record.id}:`, e); }
  }

  let inputCost: number | undefined;
  let outputCost: number | undefined;
  let totalCost: number | undefined;

  if (record.encrypted_input_cost && record.input_cost_iv && record.input_cost_tag) {
    try {
      const inCostAad = buildFieldAad("chat", record.id, "input_cost", record.encryption_version);
      const decInCost = decryptBuffer({ ciphertext: record.encrypted_input_cost, iv: record.input_cost_iv, tag: record.input_cost_tag }, dbKey, inCostAad);
      const parsedInCost = parseFloat(decInCost.toString("utf-8"));
      inputCost = Number.isNaN(parsedInCost) ? undefined : parsedInCost;
    } catch (e) { console.warn(`Failed to decrypt input_cost for chat ${record.id}:`, e); }
  }

  if (record.encrypted_output_cost && record.output_cost_iv && record.output_cost_tag) {
    try {
      const outCostAad = buildFieldAad("chat", record.id, "output_cost", record.encryption_version);
      const decOutCost = decryptBuffer({ ciphertext: record.encrypted_output_cost, iv: record.output_cost_iv, tag: record.output_cost_tag }, dbKey, outCostAad);
      const parsedOutCost = parseFloat(decOutCost.toString("utf-8"));
      outputCost = Number.isNaN(parsedOutCost) ? undefined : parsedOutCost;
    } catch (e) { console.warn(`Failed to decrypt output_cost for chat ${record.id}:`, e); }
  }

  if (record.encrypted_total_cost && record.total_cost_iv && record.total_cost_tag) {
    try {
      const totalCostAad = buildFieldAad("chat", record.id, "total_cost", record.encryption_version);
      const decTotalCost = decryptBuffer({ ciphertext: record.encrypted_total_cost, iv: record.total_cost_iv, tag: record.total_cost_tag }, dbKey, totalCostAad);
      const parsedTotalCost = parseFloat(decTotalCost.toString("utf-8"));
      totalCost = Number.isNaN(parsedTotalCost) ? undefined : parsedTotalCost;
    } catch (e) { console.warn(`Failed to decrypt total_cost for chat ${record.id}:`, e); }
  }

  return { metadata, inputTokens, outputTokens, inputCost, outputCost, totalCost };
}

/**
 * The SINGLE function to decrypt a chat title, strictly verifying AAD.
 * 
 * @param record ChatRecord from the database
 * @param dbKey Database encryption key
 * @param fallbackToUntitled If true, ignores decryption errors and returns "Untitled Chat". If false, throws an error on failure (strict validation).
 */
export function decryptChatTitle(record: ChatRecord, dbKey: Buffer, fallbackToUntitled: boolean = false): string {
  try {
    const titleAad = buildFieldAad("chat", record.id, "title", record.encryption_version);
    const decTitle = decryptBuffer(
      {
        ciphertext: record.encrypted_title,
        iv: record.title_iv,
        tag: record.title_tag,
      },
      dbKey,
      titleAad
    );
    return decTitle.toString("utf-8");
  } catch (e) {
    if (fallbackToUntitled) {
      console.warn(`Failed to decrypt title for chat ${record.id}:`, e);
      return "Untitled Chat";
    }
    throw e;
  }
}

/**
 * Derives a clean, concise chat title from the first prompt.
 */
export function deriveTitleFromPrompt(prompt: string): string {
  const firstLine = prompt.trim().split("\n")[0].trim();
  if (!firstLine) return "New Chat";
  if (firstLine.length <= 40) return firstLine;
  return firstLine.substring(0, 37).trim() + "...";
}
