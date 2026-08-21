import { randomUUID } from "node:crypto";
import { vaultState } from "./state.js";
import { encryptBuffer, decryptBuffer } from "./crypto.js";
import { buildFieldAad, VaultLockedError } from "./keys.js";
import {
  createChatRecord,
  getChatRecordById,
  getAllChatsRecords,
  updateChatRecord,
  deleteChatRecord,
  type ChatRecord,
} from "../db/repository/chats.repository.js";
import {
  createMessageRecord,
  getMessagesByChatId,
  getLatestSequenceNumber,
} from "../db/repository/messages.repository.js";
import { getAllModels } from "../db/repository/models.repository.js";
import { executeAiCompletion, type ChatMessagePrompt } from "./ai/ai-provider.js";
import { ChatMetadata, ChatMessageDto } from "@ai-vault/types";

export class ChatNotFoundError extends Error {
  constructor(message = "Chat not found.") {
    super(message);
    this.name = "ChatNotFoundError";
  }
}

export interface CreateChatParams {
  id?: string;
  title?: string;
  metadata?: Record<string, any> | null;
}

export interface SendMessageParams {
  chatId?: string;
  message: string;
  provider?: string;
  model?: string;
}

export interface SendMessageResult {
  chat: ChatMetadata;
  userMessage: ChatMessageDto;
  assistantMessage: ChatMessageDto;
}

const activeChatLocks = new Set<string>();

interface DecryptedChatFields {
  metadata: Record<string, any> | null;
  inputTokens?: number;
  outputTokens?: number;
}

function decryptChatFields(record: ChatRecord, dbKey: Buffer): DecryptedChatFields {
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
      inputTokens = parseInt(decIn.toString("utf-8"), 10) || undefined;
    } catch (e) { console.warn(`Failed to decrypt input_tokens for chat ${record.id}:`, e); }
  }

  if (record.encrypted_output_tokens && record.output_tokens_iv && record.output_tokens_tag) {
    try {
      const outAad = buildFieldAad("chat", record.id, "output_tokens", record.encryption_version);
      const decOut = decryptBuffer({ ciphertext: record.encrypted_output_tokens, iv: record.output_tokens_iv, tag: record.output_tokens_tag }, dbKey, outAad);
      outputTokens = parseInt(decOut.toString("utf-8"), 10) || undefined;
    } catch (e) { console.warn(`Failed to decrypt output_tokens for chat ${record.id}:`, e); }
  }

  return { metadata, inputTokens, outputTokens };
}

/**
 * Creates and encrypts a new chat record in the database using the in-memory dbKey.
 */
export async function createChat(params: CreateChatParams = {}): Promise<ChatMetadata> {
  if (!vaultState.isUnlocked()) {
    throw new VaultLockedError();
  }

  const dbKey = vaultState.getDbKey();
  if (!dbKey) {
    throw new VaultLockedError("Database encryption key is unavailable in memory.");
  }

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

/**
 * Lists all active chats with decrypted titles and metadata.
 */
export async function listChats(limit?: number, offset?: number): Promise<ChatMetadata[]> {
  if (!vaultState.isUnlocked()) {
    throw new VaultLockedError();
  }

  const dbKey = vaultState.getDbKey();
  if (!dbKey) {
    throw new VaultLockedError("Database encryption key is unavailable in memory.");
  }

  const records = await getAllChatsRecords(limit, offset);
  const chats: ChatMetadata[] = [];

  for (const record of records) {
    let title = "Untitled Chat";
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
      title = decTitle.toString("utf-8");
    } catch (e) {
      console.warn(`Failed to decrypt title for chat ${record.id}:`, e);
    }

    const fields = decryptChatFields(record, dbKey);

    chats.push({
      id: record.id,
      title,
      status: record.status,
      metadata: fields.metadata,
      inputTokens: fields.inputTokens,
      outputTokens: fields.outputTokens,
      createdAt: record.created_at.toISOString(),
      updatedAt: record.updated_at.toISOString(),
    });
  }

  vaultState.touch();
  return chats;
}

/**
 * Gets a single chat by ID with decrypted fields.
 */
export async function getChat(id: string): Promise<ChatMetadata> {
  if (!vaultState.isUnlocked()) {
    throw new VaultLockedError();
  }

  const dbKey = vaultState.getDbKey();
  if (!dbKey) {
    throw new VaultLockedError("Database encryption key is unavailable in memory.");
  }

  const record = await getChatRecordById(id);
  if (!record || record.status !== "ACTIVE") {
    throw new ChatNotFoundError();
  }

  let title = "Untitled Chat";
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
    title = decTitle.toString("utf-8");
  } catch (e) {
    console.warn(`[getChat] Decryption failed for chat title (${record.id}):`, e);
  }

  const fields = decryptChatFields(record, dbKey);

  vaultState.touch();

  return {
    id: record.id,
    title,
    status: record.status,
    metadata: fields.metadata,
    inputTokens: fields.inputTokens,
    outputTokens: fields.outputTokens,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

/**
 * Retrieves and decrypts all messages for a given chat.
 */
export async function getChatMessages(
  chatId: string,
  limit?: number,
  offset?: number,
  sort: "asc" | "desc" = "asc"
): Promise<ChatMessageDto[]> {
  if (!vaultState.isUnlocked()) {
    throw new VaultLockedError();
  }

  const dbKey = vaultState.getDbKey();
  if (!dbKey) {
    throw new VaultLockedError("Database encryption key is unavailable in memory.");
  }

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

    if (msg.encrypted_tokens && msg.tokens_iv && msg.tokens_tag) {
      try {
        const tokensAad = buildFieldAad("message", msg.id, "tokens", msg.encryption_version);
        const decTokens = decryptBuffer(
          {
            ciphertext: msg.encrypted_tokens,
            iv: msg.tokens_iv,
            tag: msg.tokens_tag,
          },
          dbKey,
          tokensAad
        );
        const parsed = JSON.parse(decTokens.toString("utf-8"));
        inputTokens = typeof parsed.inputTokens === "number" ? parsed.inputTokens : undefined;
        outputTokens = typeof parsed.outputTokens === "number" ? parsed.outputTokens : undefined;
      } catch (e) {
        console.warn(`[getChatMessages] Decryption failed for message tokens (${msg.id}):`, e);
      }
    }

    messages.push({
      id: msg.id,
      chatId: msg.chat_id,
      role: msg.role as "user" | "assistant" | "system",
      content,
      sequenceNumber: msg.sequence_number,
      inputTokens,
      outputTokens,
      createdAt: msg.created_at.toISOString(),
      updatedAt: msg.updated_at.toISOString(),
    });
  }

  vaultState.touch();
  return messages;
}

/**
 * Deletes a chat record and its associated messages.
 */
export async function removeChat(id: string): Promise<boolean> {
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

/**
 * Derives a clean, concise chat title from the first prompt.
 */
function deriveTitleFromPrompt(prompt: string): string {
  const firstLine = prompt.trim().split("\n")[0].trim();
  if (!firstLine) return "New Chat";
  if (firstLine.length <= 40) return firstLine;
  return firstLine.substring(0, 37).trim() + "...";
}

/**
 * Sends a user message, creates a chat if needed, invokes AI completion,
 * strongly encrypts both messages with AES-256-GCM + AAD into the database,
 * and returns the decrypted result.
 */
export async function sendMessageAndExecute(params: SendMessageParams): Promise<SendMessageResult> {
  // If chatId is provided upfront, check lock immediately
  if (params.chatId && activeChatLocks.has(params.chatId)) {
    throw new Error("AI is already processing a message in this chat. Please wait.");
  }

  return await _sendMessageAndExecuteInner(params);
}

async function _sendMessageAndExecuteInner(params: SendMessageParams): Promise<SendMessageResult> {
  if (!vaultState.isUnlocked()) {
    throw new VaultLockedError();
  }

  const dbKey = vaultState.getDbKey();
  if (!dbKey) {
    throw new VaultLockedError("Database encryption key is unavailable in memory.");
  }

  const trimmedMessage = params.message.trim();
  if (!trimmedMessage) {
    throw new Error("Message content cannot be empty.");
  }

  let chat: ChatMetadata;
  let chatRecord: ChatRecord | null = null;

  if (params.chatId) {
    chatRecord = await getChatRecordById(params.chatId);
    if (!chatRecord || chatRecord.status !== "ACTIVE") {
      throw new ChatNotFoundError();
    }

    let title = "Untitled Chat";
    try {
      const titleAad = buildFieldAad("chat", chatRecord.id, "title", chatRecord.encryption_version);
      const decTitle = decryptBuffer(
        {
          ciphertext: chatRecord.encrypted_title,
          iv: chatRecord.title_iv,
          tag: chatRecord.title_tag,
        },
        dbKey,
        titleAad
      );
      title = decTitle.toString("utf-8");
    } catch (e) {
      console.warn(`[_sendMessageAndExecuteInner] Decryption failed for chat title (${chatRecord.id}):`, e);
    }
    const fields = decryptChatFields(chatRecord, dbKey);
    chat = {
      id: chatRecord.id,
      title,
      status: chatRecord.status,
      metadata: fields.metadata,
      inputTokens: fields.inputTokens,
      outputTokens: fields.outputTokens,
      createdAt: chatRecord.created_at.toISOString(),
      updatedAt: chatRecord.updated_at.toISOString(),
    };
  } else {
    // Automatically create a new chat with derived title
    const derivedTitle = deriveTitleFromPrompt(trimmedMessage);
    chat = await createChat({
      title: derivedTitle,
      metadata: {
        provider: params.provider || null,
        model: params.model || null,
      },
    });
    chatRecord = await getChatRecordById(chat.id);
  }

  // Acquire lock on the resolved chat ID (covers both existing and auto-created chats)
  if (activeChatLocks.has(chat.id)) {
    throw new Error("AI is already processing a message in this chat. Please wait.");
  }
  activeChatLocks.add(chat.id);

  try {

  // Retrieve prior conversation messages for context
  const existingMessages = await getChatMessages(chat.id, 100, 0, "desc");

  /**
   * Dynamically calculate max context tokens based on model price (to save costs while retaining context):
   * - Ultra Cheap models (<= $0.20/1M): allow up to 32,000 context tokens.
   * - Budget models (<= $0.50/1M): allow up to 16,000 context tokens.
   * - Moderate models (<= $1.50/1M): allow up to 8,000 context tokens.
   * - Expensive / Frontier models (<= $4.00/1M): allow up to 4,000 context tokens.
   * - Very Expensive Flagships (> $4.00/1M): conserve aggressively with 2,500 context tokens.
   */
  let maxTokens = 6000;
  let maxOutputTokens: number | undefined = undefined;
  try {
    const allModels = await getAllModels();
    const activeProvider = params.provider || chat.metadata?.provider || "google";
    const activeModel = params.model || chat.metadata?.model || "gemini-3.7-flash";
    
    const dbModel = allModels.find(
      (m) =>
        m.provider.toLowerCase() === activeProvider.toLowerCase() &&
        m.name.toLowerCase() === activeModel.toLowerCase()
    );

    if (dbModel) {
      const inputCost = dbModel.input_price_per_1m ? Number(dbModel.input_price_per_1m) : null;
      const outputCost = dbModel.output_price_per_1m ? Number(dbModel.output_price_per_1m) : null;
      const contextLimit = dbModel.context_window ? Math.max(dbModel.context_window - 2000, 2000) : 100000;

      if (inputCost !== null) {
        if (inputCost <= 0.20) {
          maxTokens = 32000; // Ultra cheap (e.g. Flash-Lite, GPT-5.6 Luna, OSS 20B)
        } else if (inputCost <= 0.50) {
          maxTokens = 16000; // Budget (e.g. Gemini 3.7 Flash, OSS 120B, DeepSeek V4)
        } else if (inputCost <= 1.50) {
          maxTokens = 8000;  // Moderate (e.g. Gemini 3.5/3.6 Flash, Claude Haiku)
        } else if (inputCost <= 4.00) {
          maxTokens = 4000;  // Expensive (e.g. Gemini 3.1 Pro, Claude Sonnet, GPT-5.6 Terra)
        } else {
          maxTokens = 2500;  // Very Expensive (e.g. GPT-5.6 Sol, Claude Fable/Opus)
        }
      } else {
        maxTokens = 6000;
      }

      if (outputCost !== null) {
        if (outputCost <= 0.50) {
          maxOutputTokens = 4000; // Very cheap output
        } else if (outputCost <= 2.50) {
          maxOutputTokens = 2500; // Moderate output
        } else if (outputCost <= 10.00) {
          maxOutputTokens = 1500; // Expensive output
        } else {
          maxOutputTokens = 800;  // Very Expensive output (e.g. GPT-5.6 Sol, Claude Opus)
        }
      }

      // Ensure we do not exceed model physical context window
      maxTokens = Math.min(maxTokens, contextLimit);
    }
  } catch (e) {
    console.warn("Failed to determine dynamic maxTokens from model cost, using default fallback:", e);
  }

  const userMessageTokens = Math.ceil(trimmedMessage.length / 4);
  let currentTokens = userMessageTokens;

  const includedMessages: typeof existingMessages = [];

  for (const m of existingMessages) {
    const mTokens = m.inputTokens ? m.inputTokens : Math.ceil(m.content.length / 4);
    if (currentTokens + mTokens > maxTokens) {
      break;
    }
    currentTokens += mTokens;
    includedMessages.push(m);
  }

  includedMessages.reverse(); // Put them in chronological order

  const latestSeq = await getLatestSequenceNumber(chat.id);

  // 1. Prepare prompt context for AI completion
  const promptContext: ChatMessagePrompt[] = [
    ...includedMessages.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: trimmedMessage },
  ];

  // 2. Encrypt and store user message BEFORE AI generation to prevent data loss
  const userMsgId = randomUUID();
  const userAad = buildFieldAad("message", userMsgId, "content", 1);
  const encUserContent = encryptBuffer(Buffer.from(trimmedMessage, "utf-8"), dbKey, userAad);

  const userRecord = await createMessageRecord({
    id: userMsgId,
    chat_id: chat.id,
    sequence_number: latestSeq + 1,
    role: "user",
    encryption_version: 1,
    encrypted_content: encUserContent.ciphertext,
    content_iv: encUserContent.iv,
    content_tag: encUserContent.tag,
  });

  const userMessageDto: ChatMessageDto = {
    id: userRecord.id,
    chatId: userRecord.chat_id,
    role: "user",
    content: trimmedMessage,
    sequenceNumber: userRecord.sequence_number,
    createdAt: userRecord.created_at.toISOString(),
    updatedAt: userRecord.updated_at.toISOString(),
  };

  // 3. Execute AI generation
  const aiResult = await executeAiCompletion({
    messages: promptContext,
    provider: params.provider,
    model: params.model,
    maxOutputTokens,
  });

  // 4. Encrypt and store assistant message
  const assistantMsgId = randomUUID();
  const assistantAad = buildFieldAad("message", assistantMsgId, "content", 1);
  const encAssistantContent = encryptBuffer(Buffer.from(aiResult.content, "utf-8"), dbKey, assistantAad);

  let encTokensCipher: string | null = null;
  let tokensIv: string | null = null;
  let tokensTag: string | null = null;

  if (aiResult.inputTokens !== undefined || aiResult.outputTokens !== undefined) {
    const tokensJson = JSON.stringify({
      inputTokens: aiResult.inputTokens ?? 0,
      outputTokens: aiResult.outputTokens ?? 0,
    });
    const tokensAad = buildFieldAad("message", assistantMsgId, "tokens", 1);
    const encTokens = encryptBuffer(Buffer.from(tokensJson, "utf-8"), dbKey, tokensAad);
    encTokensCipher = encTokens.ciphertext;
    tokensIv = encTokens.iv;
    tokensTag = encTokens.tag;

    // Update Chat Tokens
    if (chatRecord) {
      let chatInputTokens = 0;
      let chatOutputTokens = 0;

      if (chatRecord.encrypted_input_tokens && chatRecord.input_tokens_iv && chatRecord.input_tokens_tag) {
        try {
          const inAad = buildFieldAad("chat", chat.id, "input_tokens", chatRecord.encryption_version);
          const decIn = decryptBuffer({ ciphertext: chatRecord.encrypted_input_tokens, iv: chatRecord.input_tokens_iv, tag: chatRecord.input_tokens_tag }, dbKey, inAad);
          chatInputTokens = parseInt(decIn.toString("utf-8"), 10) || 0;
        } catch (e) { console.warn(`[sendMessage] Failed to decrypt chat input_tokens (${chat.id}):`, e); }
      }

      if (chatRecord.encrypted_output_tokens && chatRecord.output_tokens_iv && chatRecord.output_tokens_tag) {
        try {
          const outAad = buildFieldAad("chat", chat.id, "output_tokens", chatRecord.encryption_version);
          const decOut = decryptBuffer({ ciphertext: chatRecord.encrypted_output_tokens, iv: chatRecord.output_tokens_iv, tag: chatRecord.output_tokens_tag }, dbKey, outAad);
          chatOutputTokens = parseInt(decOut.toString("utf-8"), 10) || 0;
        } catch (e) { console.warn(`[sendMessage] Failed to decrypt chat output_tokens (${chat.id}):`, e); }
      }

      chatInputTokens += (aiResult.inputTokens || 0);
      chatOutputTokens += (aiResult.outputTokens || 0);

      chat.inputTokens = chatInputTokens;
      chat.outputTokens = chatOutputTokens;

      const inAad = buildFieldAad("chat", chat.id, "input_tokens", chatRecord.encryption_version);
      const encIn = encryptBuffer(Buffer.from(chatInputTokens.toString(), "utf-8"), dbKey, inAad);

      const outAad = buildFieldAad("chat", chat.id, "output_tokens", chatRecord.encryption_version);
      const encOut = encryptBuffer(Buffer.from(chatOutputTokens.toString(), "utf-8"), dbKey, outAad);

      await updateChatRecord(chat.id, {
        encrypted_input_tokens: encIn.ciphertext,
        input_tokens_iv: encIn.iv,
        input_tokens_tag: encIn.tag,
        encrypted_output_tokens: encOut.ciphertext,
        output_tokens_iv: encOut.iv,
        output_tokens_tag: encOut.tag,
      });
    }
  }

  const assistantRecord = await createMessageRecord({
    id: assistantMsgId,
    chat_id: chat.id,
    sequence_number: latestSeq + 2,
    role: "assistant",
    encryption_version: 1,
    encrypted_content: encAssistantContent.ciphertext,
    content_iv: encAssistantContent.iv,
    content_tag: encAssistantContent.tag,
    encrypted_tokens: encTokensCipher,
    tokens_iv: tokensIv,
    tokens_tag: tokensTag,
  });

  const assistantMessageDto: ChatMessageDto = {
    id: assistantRecord.id,
    chatId: assistantRecord.chat_id,
    role: "assistant",
    content: aiResult.content,
    sequenceNumber: assistantRecord.sequence_number,
    inputTokens: aiResult.inputTokens,
    outputTokens: aiResult.outputTokens,
    createdAt: assistantRecord.created_at.toISOString(),
    updatedAt: assistantRecord.updated_at.toISOString(),
  };

  vaultState.touch();

  return {
    chat,
    userMessage: userMessageDto,
    assistantMessage: assistantMessageDto,
  };

  } finally {
    activeChatLocks.delete(chat.id);
  }
}

/**
 * Decrypts a chat record title verifying AAD integrity.
 */
export async function getDecryptedChatTitle(chatId: string): Promise<string> {
  if (!vaultState.isUnlocked()) {
    throw new VaultLockedError();
  }

  const dbKey = vaultState.getDbKey();
  if (!dbKey) {
    throw new VaultLockedError("Database encryption key is unavailable in memory.");
  }

  const record = await getChatRecordById(chatId);
  if (!record) {
    throw new ChatNotFoundError();
  }

  const aad = buildFieldAad("chat", record.id, "title", record.encryption_version);
  const decrypted = decryptBuffer(
    {
      ciphertext: record.encrypted_title,
      iv: record.title_iv,
      tag: record.title_tag,
    },
    dbKey,
    aad
  );

  vaultState.touch();
  return decrypted.toString("utf-8");
}
