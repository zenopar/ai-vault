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

    let modelId: string | undefined = undefined;
    let modelName: string | undefined = undefined;
    let thinkingLevel: string | undefined = undefined;
    let inputTokens: number | undefined = undefined;
    let outputTokens: number | undefined = undefined;
    let thoughtTokens: number | undefined = undefined;
    let inputCost: number | undefined = undefined;
    let outputCost: number | undefined = undefined;
    let thoughtCost: number | undefined = undefined;
    let totalCost: number | undefined = undefined;

    if (msg.encrypted_metadata && msg.metadata_iv && msg.metadata_tag) {
      try {
        const metadataAad = buildFieldAad("message", msg.id, "metadata", msg.encryption_version);
        const decMetadata = decryptBuffer({
          ciphertext: msg.encrypted_metadata,
          iv: msg.metadata_iv,
          tag: msg.metadata_tag
        }, dbKey, metadataAad);
        const metadataStr = decMetadata.toString("utf-8");
        const metadataObj = JSON.parse(metadataStr);

        modelId = metadataObj.model_id ?? undefined;
        modelName = metadataObj.model_name ?? undefined;
        thinkingLevel = metadataObj.thinking_level ?? undefined;
        
        if (metadataObj.stats) {
          inputTokens = metadataObj.stats.input_tokens || undefined;
          outputTokens = metadataObj.stats.output_tokens || undefined;
          thoughtTokens = metadataObj.stats.thought_tokens || undefined;
          inputCost = metadataObj.stats.input_cost || undefined;
          outputCost = metadataObj.stats.output_cost || undefined;
          thoughtCost = metadataObj.stats.thought_cost || undefined;
        }

        if (inputCost !== undefined || outputCost !== undefined) {
          totalCost = (inputCost || 0) + (outputCost || 0);
        }
      } catch (e) {
        console.warn(`[getChatMessages] Decryption failed for message metadata (${msg.id}):`, e);
      }
    }

    messages.push({
      id: msg.id,
      chatId: msg.chat_id,
      role: msg.role as "user" | "assistant" | "system",
      content,
      sequenceNumber: msg.sequence_number,
      modelId,
      modelName,
      thinkingLevel,
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
