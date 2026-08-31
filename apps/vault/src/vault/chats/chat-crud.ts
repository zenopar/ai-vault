import { randomUUID } from "node:crypto";
import { vaultState, VaultLockedError } from "../state.js";
import { encryptBuffer, decryptBuffer } from "../crypto.js";
import { buildFieldAad } from "../keys.js";
import {
  createChatRecord,
  getChatRecordById,
  getAllChatsRecords,
  deleteChatRecord,
} from "../../db/repository/chats.repository.js";
import {
  getMessagesByChatId,
  countMessagesByChatId,
} from "../../db/repository/messages.repository.js";
import type { ChatMetadata, ChatMessageDto } from "@ai-vault/types";

import {
  decryptChatFields,
  decryptChatTitle,
  ChatNotFoundError,
} from "./chat-utils.js";

export interface CreateChatParams {
  id?: string;
  title?: string;
  metadata?: Record<string, any> | null;
}

export interface GetChatMessagesResult {
  messages: ChatMessageDto[];
  hasMore: boolean;
  total: number;
}

// === CORE CHAT CRUD ===

export async function createChat(params: CreateChatParams = {}, sessionToken: string): Promise<ChatMetadata> {
  const chatId = params.id || randomUUID();
  const rawTitle = params.title && params.title.trim() ? params.title.trim() : "New Chat";
  const titleAad = buildFieldAad("chat", chatId, "title", 1);

  const { encryptedTitle, encryptedMetadata, metadataIv, metadataTag } = await vaultState.withDbKey(
    sessionToken,
    (dbKey) => {
      const encTitle = encryptBuffer(Buffer.from(rawTitle, "utf-8"), dbKey, titleAad);
      let encMeta: { ciphertext: string | null; iv: string | null; tag: string | null } = {
        ciphertext: null,
        iv: null,
        tag: null,
      };

      if (params.metadata !== undefined && params.metadata !== null) {
        const metadataStr = JSON.stringify(params.metadata);
        const metadataAad = buildFieldAad("chat", chatId, "metadata", 1);
        const enc = encryptBuffer(Buffer.from(metadataStr, "utf-8"), dbKey, metadataAad);
        encMeta = {
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          tag: enc.tag,
        };
      }

      return {
        encryptedTitle: encTitle,
        encryptedMetadata: encMeta.ciphertext,
        metadataIv: encMeta.iv,
        metadataTag: encMeta.tag,
      };
    }
  );

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

  return {
    id: record.id,
    title: rawTitle,
    status: record.status,
    metadata: params.metadata ?? null,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

export async function listChats(sessionToken: string, limit?: number, offset?: number): Promise<ChatMetadata[]> {
  const records = await getAllChatsRecords(limit, offset);

  return await vaultState.withDbKey(sessionToken, (dbKey) => {
    const chats: ChatMetadata[] = [];
    for (const record of records) {
      // In listings, safely fallback to "Untitled Chat" to avoid breaking the entire view
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
    return chats;
  });
}

export async function getChat(id: string, sessionToken: string): Promise<ChatMetadata> {
  const record = await getChatRecordById(id);
  if (!record || record.status !== "ACTIVE") {
    throw new ChatNotFoundError();
  }

  return await vaultState.withDbKey(sessionToken, (dbKey) => {
    // Strict validation - throws on failure
    const title = decryptChatTitle(record, dbKey, false);
    const fields = decryptChatFields(record, dbKey);

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
  });
}

export async function getChatMessages(
  chatId: string,
  sessionToken: string,
  limit?: number,
  offset?: number,
  sort: "asc" | "desc" = "asc"
): Promise<GetChatMessagesResult> {
  const [messageRecords, total] = await Promise.all([
    getMessagesByChatId(chatId, limit, offset, sort),
    countMessagesByChatId(chatId),
  ]);

  const currentOffset = offset ?? 0;
  const hasMore = currentOffset + messageRecords.length < total;

  const messages = await vaultState.withDbKey(sessionToken, (dbKey) => {
    const list: ChatMessageDto[] = [];

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
        try {
          content = decrypted.toString("utf-8");
        } finally {
          decrypted.fill(0);
        }
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
          let metadataStr: string;
          try {
            metadataStr = decMetadata.toString("utf-8");
          } finally {
            decMetadata.fill(0);
          }
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

      list.push({
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

    return list;
  });

  return {
    messages,
    hasMore,
    total,
  };
}

export async function removeChat(id: string, sessionToken?: string): Promise<boolean> {
  if (sessionToken && !vaultState.verifySession(sessionToken)) {
    throw new VaultLockedError();
  }
  if (!vaultState.isUnlocked()) {
    throw new VaultLockedError();
  }

  const existing = await getChatRecordById(id);
  if (!existing) {
    throw new ChatNotFoundError();
  }

  await deleteChatRecord(id);
  return true;
}
