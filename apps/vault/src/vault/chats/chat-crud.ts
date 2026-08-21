import { randomUUID } from "node:crypto";
import { vaultState } from "../state.js";
import { encryptBuffer, decryptBuffer } from "../crypto.js";
import { buildFieldAad } from "../keys.js";
import {
  createChatRecord,
  getChatRecordById,
  getAllChatsRecords,
  deleteChatRecord,
} from "../../db/repository/chats.repository.js";
import { getMessagesByChatId } from "../../db/repository/messages.repository.js";
import type { ChatMetadata, ChatMessageDto } from "@ai-vault/types";

import {
  requireDbKey,
  decryptChatFields,
  decryptChatTitle,
  ChatNotFoundError,
} from "./chat-utils.js";

export interface CreateChatParams {
  id?: string;
  title?: string;
  metadata?: Record<string, any> | null;
}

// === CORE CHAT CRUD ===

export async function createChat(params: CreateChatParams = {}): Promise<ChatMetadata> {
  const dbKey = requireDbKey();

  const chatId = params.id || randomUUID();
  const rawTitle = params.title && params.title.trim() ? params.title.trim() : "New Chat";
  const titleAad = buildFieldAad("chat", chatId, "title", 1);
  const encryptedTitle = encryptBuffer(Buffer.from(rawTitle, "utf-8"), dbKey, titleAad);

  let encryptedMetadata: string | null = null;
  let metadataIv: string | null = null;
  let metadataTag: string | null = null;

  if (params.metadata !== undefined && params.metadata !== null) {
    const metadataStr = JSON.stringify(params.metadata);
    const metadataAad = buildFieldAad("chat", chatId, "metadata", 1);
    const enc = encryptBuffer(Buffer.from(metadataStr, "utf-8"), dbKey, metadataAad);
    encryptedMetadata = enc.ciphertext;
    metadataIv = enc.iv;
    metadataTag = enc.tag;
  }

  const record = await createChatRecord({
    id: chatId,
    encryption_version: 1,
    status: "ACTIVE",
    encrypted_title: encryptedTitle.ciphertext,
    title_iv: encryptedTitle.iv,
    title_tag: encryptedTitle.tag,
    encrypted_metadata: encryptedMetadata,
    metadata_iv: metadataIv,
    metadata_tag: metadataTag,
  });

  vaultState.touch();

  return {
    id: record.id,
    title: rawTitle,
    status: record.status,
    metadata: params.metadata ?? null,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

export async function listChats(limit?: number, offset?: number): Promise<ChatMetadata[]> {
  const dbKey = requireDbKey();

  const records = await getAllChatsRecords(limit, offset);
  const chats: ChatMetadata[] = [];

  for (const record of records) {
    // In listings, we safely fallback to "Untitled Chat" to avoid breaking the entire view
    const title = decryptChatTitle(record, dbKey, true);
    const fields = decryptChatFields(record, dbKey);

    chats.push({
      id: record.id,
      title,
      status: record.status,
      metadata: fields.metadata,
      inputTokens: fields.inputTokens,
      outputTokens: fields.outputTokens,
      thoughtTokens: fields.thoughtTokens,
      inputCost: fields.inputCost,
      outputCost: fields.outputCost,
      totalCost: fields.totalCost,
      createdAt: record.created_at.toISOString(),
      updatedAt: record.updated_at.toISOString(),
    });
  }

  vaultState.touch();
  return chats;
}

export async function getChat(id: string): Promise<ChatMetadata> {
  const dbKey = requireDbKey();

  const record = await getChatRecordById(id);
  if (!record || record.status !== "ACTIVE") {
    throw new ChatNotFoundError();
  }

  // Strict validation - throws on failure
  const title = decryptChatTitle(record, dbKey, false);
  const fields = decryptChatFields(record, dbKey);

  vaultState.touch();

  return {
    id: record.id,
    title,
    status: record.status,
    metadata: fields.metadata,
    inputTokens: fields.inputTokens,
    outputTokens: fields.outputTokens,
    thoughtTokens: fields.thoughtTokens,
    inputCost: fields.inputCost,
    outputCost: fields.outputCost,
    totalCost: fields.totalCost,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

export async function getChatMessages(
  chatId: string,
  limit?: number,
  offset?: number,
  sort: "asc" | "desc" = "asc"
): Promise<ChatMessageDto[]> {
  const dbKey = requireDbKey();

  const messageRecords = await getMessagesByChatId(chatId, limit, offset, sort);
  const messages: ChatMessageDto[] = [];

  for (const msg of messageRecords) {
    let content = "[Failed to decrypt message content]";
    try {
      const aad = buildFieldAad("message", msg.id, "content", msg.encryption_version);
      const decrypted = decryptBuffer(
        {
          ciphertext: msg.encrypted_content,
          iv: msg.content_iv,
          tag: msg.content_tag,
        },
        dbKey,
        aad
      );
      content = decrypted.toString("utf-8");
    } catch (e) {
      console.warn(`[getChatMessages] Decryption failed for message (${msg.id}):`, e);
    }

    let inputTokens: number | undefined = undefined;
    let outputTokens: number | undefined = undefined;
    let thoughtTokens: number | undefined = undefined;

    if ((msg as any).encrypted_input_tokens && (msg as any).input_tokens_iv && (msg as any).input_tokens_tag) {
      try {
        const inAad = buildFieldAad("message", msg.id, "input_tokens", msg.encryption_version);
        const decIn = decryptBuffer({ ciphertext: (msg as any).encrypted_input_tokens, iv: (msg as any).input_tokens_iv, tag: (msg as any).input_tokens_tag }, dbKey, inAad);
        const parsed = parseInt(decIn.toString("utf-8"), 10);
        inputTokens = Number.isNaN(parsed) ? undefined : parsed;
      } catch (e) {
        console.warn(`[getChatMessages] Decryption failed for message input tokens (${msg.id}):`, e);
      }
    }

    if ((msg as any).encrypted_output_tokens && (msg as any).output_tokens_iv && (msg as any).output_tokens_tag) {
      try {
        const outAad = buildFieldAad("message", msg.id, "output_tokens", msg.encryption_version);
        const decOut = decryptBuffer({ ciphertext: (msg as any).encrypted_output_tokens, iv: (msg as any).output_tokens_iv, tag: (msg as any).output_tokens_tag }, dbKey, outAad);
        const parsed = parseInt(decOut.toString("utf-8"), 10);
        outputTokens = Number.isNaN(parsed) ? undefined : parsed;
      } catch (e) {
        console.warn(`[getChatMessages] Decryption failed for message output tokens (${msg.id}):`, e);
      }
    }

    if ((msg as any).encrypted_thought_tokens && (msg as any).thought_tokens_iv && (msg as any).thought_tokens_tag) {
      try {
        const thoughtAad = buildFieldAad("message", msg.id, "thought_tokens", msg.encryption_version);
        const decThought = decryptBuffer(
          {
            ciphertext: (msg as any).encrypted_thought_tokens,
            iv: (msg as any).thought_tokens_iv,
            tag: (msg as any).thought_tokens_tag,
          },
          dbKey,
          thoughtAad
        );
        const parsedThought = parseInt(decThought.toString("utf-8"), 10);
        thoughtTokens = Number.isNaN(parsedThought) ? thoughtTokens : parsedThought;
      } catch (e) {
        console.warn(`[getChatMessages] Decryption failed for message thought tokens (${msg.id}):`, e);
      }
    }

    let inputCost: number | undefined = undefined;
    if ((msg as any).encrypted_input_cost && (msg as any).input_cost_iv && (msg as any).input_cost_tag) {
      try {
        const costAad = buildFieldAad("message", msg.id, "input_cost", msg.encryption_version);
        const decCost = decryptBuffer({ ciphertext: (msg as any).encrypted_input_cost, iv: (msg as any).input_cost_iv, tag: (msg as any).input_cost_tag }, dbKey, costAad);
        const parsedCost = parseFloat(decCost.toString("utf-8"));
        inputCost = Number.isNaN(parsedCost) ? undefined : parsedCost;
      } catch (e) {
        console.warn(`[getChatMessages] Decryption failed for message input cost (${msg.id}):`, e);
      }
    }

    let outputCost: number | undefined = undefined;
    if ((msg as any).encrypted_output_cost && (msg as any).output_cost_iv && (msg as any).output_cost_tag) {
      try {
        const costAad = buildFieldAad("message", msg.id, "output_cost", msg.encryption_version);
        const decCost = decryptBuffer({ ciphertext: (msg as any).encrypted_output_cost, iv: (msg as any).output_cost_iv, tag: (msg as any).output_cost_tag }, dbKey, costAad);
        const parsedCost = parseFloat(decCost.toString("utf-8"));
        outputCost = Number.isNaN(parsedCost) ? undefined : parsedCost;
      } catch (e) {
        console.warn(`[getChatMessages] Decryption failed for message output cost (${msg.id}):`, e);
      }
    }

    let thoughtCost: number | undefined = undefined;
    if ((msg as any).encrypted_thought_cost && (msg as any).thought_cost_iv && (msg as any).thought_cost_tag) {
      try {
        const costAad = buildFieldAad("message", msg.id, "thought_cost", msg.encryption_version);
        const decCost = decryptBuffer({ ciphertext: (msg as any).encrypted_thought_cost, iv: (msg as any).thought_cost_iv, tag: (msg as any).thought_cost_tag }, dbKey, costAad);
        const parsedCost = parseFloat(decCost.toString("utf-8"));
        thoughtCost = Number.isNaN(parsedCost) ? undefined : parsedCost;
      } catch (e) {
        console.warn(`[getChatMessages] Decryption failed for message thought cost (${msg.id}):`, e);
      }
    }
    
    let totalCost: number | undefined = undefined;
    if (inputCost !== undefined || outputCost !== undefined) {
      totalCost = (inputCost || 0) + (outputCost || 0);
    }

    messages.push({
      id: msg.id,
      chatId: msg.chat_id,
      role: msg.role as "user" | "assistant" | "system",
      content,
      sequenceNumber: msg.sequence_number,
      inputTokens,
      outputTokens,
      thoughtTokens,
      inputCost,
      outputCost,
      thoughtCost,
      totalCost,
      createdAt: msg.created_at.toISOString(),
      updatedAt: msg.updated_at.toISOString(),
    });
  }

  vaultState.touch();
  return messages;
}

export async function removeChat(id: string): Promise<boolean> {
  // Ensure we are unlocked before deleting
  requireDbKey();

  const existing = await getChatRecordById(id);
  if (!existing) {
    throw new ChatNotFoundError();
  }

  await deleteChatRecord(id);
  return true;
}
