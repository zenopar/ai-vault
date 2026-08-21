import { randomUUID } from "node:crypto";
import { vaultState } from "../state.js";
import { encryptBuffer } from "../crypto.js";
import { buildFieldAad } from "../keys.js";
import { getChatRecordById, updateChatRecord } from "../../db/repository/chats.repository.js";
import { createMessageWithSequence, createMessageRecord } from "../../db/repository/messages.repository.js";
import { getAllModels } from "../../db/repository/models.repository.js";
import { executeAiCompletion, type ChatMessagePrompt } from "../ai/ai-provider.js";
import type { ChatMetadata, ChatMessageDto } from "@ai-vault/types";

import {
  requireDbKey,
  decryptChatTitle,
  decryptChatFields,
  deriveTitleFromPrompt,
  ChatNotFoundError,
} from "./chat-utils.js";

import { createChat, getChatMessages } from "./chat-crud.js";

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

// === 4. AI EXECUTION PIPELINE ===

async function calculateDynamicTokens(provider: string, model: string): Promise<{ maxTokens: number; maxOutputTokens?: number }> {
  let maxTokens = 6000;
  let maxOutputTokens: number | undefined = undefined;

  try {
    const allModels = await getAllModels();
    const dbModel = allModels.find(
      (m) =>
        m.provider.toLowerCase() === provider.toLowerCase() &&
        m.name.toLowerCase() === model.toLowerCase()
    );

    if (dbModel) {
      const inputCost = dbModel.input_price_per_1m ? Number(dbModel.input_price_per_1m) : null;
      const outputCost = dbModel.output_price_per_1m ? Number(dbModel.output_price_per_1m) : null;
      const contextLimit = dbModel.context_window ? Math.max(dbModel.context_window - 2000, 2000) : 100000;

      if (inputCost !== null) {
        if (inputCost <= 0.20) maxTokens = 32000;
        else if (inputCost <= 0.50) maxTokens = 16000;
        else if (inputCost <= 1.50) maxTokens = 8000;
        else if (inputCost <= 4.00) maxTokens = 4000;
        else maxTokens = 2500;
      }

      if (outputCost !== null) {
        if (outputCost <= 0.50) maxOutputTokens = 4000;
        else if (outputCost <= 2.50) maxOutputTokens = 2500;
        else if (outputCost <= 10.00) maxOutputTokens = 1500;
        else maxOutputTokens = 800;
      }

      maxTokens = Math.min(maxTokens, contextLimit);
    }
  } catch (e) {
    console.warn("Failed to determine dynamic maxTokens from model cost, using default fallback:", e);
  }

  return { maxTokens, maxOutputTokens };
}

function buildPromptContext(existingMessages: ChatMessageDto[], newMessage: string, maxTokens: number): ChatMessagePrompt[] {
  const userMessageTokens = Math.ceil(newMessage.length / 4);
  let currentTokens = userMessageTokens;

  const includedMessages: ChatMessageDto[] = [];

  for (const m of existingMessages) {
    const mTokens = (m.role === "assistant" && m.outputTokens)
      ? m.outputTokens
      : Math.ceil(m.content.length / 4);
    if (currentTokens + mTokens > maxTokens) break;
    currentTokens += mTokens;
    includedMessages.push(m);
  }

  includedMessages.reverse();

  return [
    ...includedMessages.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: newMessage },
  ];
}

export async function sendMessageAndExecute(params: SendMessageParams): Promise<SendMessageResult> {
  // If chatId is provided upfront, check lock immediately
  if (params.chatId && activeChatLocks.has(params.chatId)) {
    throw new Error("AI is already processing a message in this chat. Please wait.");
  }

  const dbKey = requireDbKey();

  const trimmedMessage = params.message.trim();
  if (!trimmedMessage) {
    throw new Error("Message content cannot be empty.");
  }

  let chat: ChatMetadata;

  if (params.chatId) {
    const chatRecord = await getChatRecordById(params.chatId);
    if (!chatRecord || chatRecord.status !== "ACTIVE") {
      throw new ChatNotFoundError();
    }
    const title = decryptChatTitle(chatRecord, dbKey, false);
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
    chat = await createChat({
      title: deriveTitleFromPrompt(trimmedMessage),
      metadata: { provider: params.provider || null, model: params.model || null },
    });
  }

  if (activeChatLocks.has(chat.id)) {
    throw new Error("AI is already processing a message in this chat. Please wait.");
  }
  activeChatLocks.add(chat.id);

  try {
    const activeProvider = params.provider || chat.metadata?.provider || "google";
    const activeModel = params.model || chat.metadata?.model || "gemini-3.7-flash";

    const { maxTokens, maxOutputTokens } = await calculateDynamicTokens(activeProvider, activeModel);
    
    // 1. Build context
    const existingMessages = await getChatMessages(chat.id, 100, 0, "desc");
    const promptContext = buildPromptContext(existingMessages, trimmedMessage, maxTokens);

    // 2. Encrypt and store user message
    const userMsgId = randomUUID();
    const userAad = buildFieldAad("message", userMsgId, "content", 1);
    const encUserContent = encryptBuffer(Buffer.from(trimmedMessage, "utf-8"), dbKey, userAad);

    const { record: userRecord, latestSeq } = await createMessageWithSequence({
      id: userMsgId,
      chat_id: chat.id,
      role: "user",
      encryption_version: 1,
      encrypted_content: encUserContent.ciphertext,
      content_iv: encUserContent.iv,
      content_tag: encUserContent.tag,
    }, chat.id);

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
      const chatRecord = await getChatRecordById(chat.id);
      if (chatRecord) {
        const fields = decryptChatFields(chatRecord, dbKey);
        const chatInputTokens = (fields.inputTokens || 0) + (aiResult.inputTokens || 0);
        const chatOutputTokens = (fields.outputTokens || 0) + (aiResult.outputTokens || 0);

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
