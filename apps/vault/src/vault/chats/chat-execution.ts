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

async function calculateDynamicTokens(provider: string, model: string): Promise<{ maxTokens: number; maxOutputTokens?: number; inputPrice?: number; outputPrice?: number }> {
  let maxTokens = 6000;
  let maxOutputTokens: number | undefined = undefined;
  let inputPrice: number | undefined = undefined;
  let outputPrice: number | undefined = undefined;

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
      inputPrice = inputCost !== null ? inputCost : undefined;
      outputPrice = outputCost !== null ? outputCost : undefined;
    }
  } catch (e) {
    console.warn("Failed to determine dynamic maxTokens from model cost, using default fallback:", e);
  }

  return { maxTokens, maxOutputTokens, inputPrice, outputPrice };
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

    const { maxTokens, maxOutputTokens, inputPrice, outputPrice } = await calculateDynamicTokens(activeProvider, activeModel);
    
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

    let encInTokensCipher: string | null = null;
    let inTokensIv: string | null = null;
    let inTokensTag: string | null = null;

    let encOutTokensCipher: string | null = null;
    let outTokensIv: string | null = null;
    let outTokensTag: string | null = null;

    let encInCostCipher: string | null = null;
    let inCostIv: string | null = null;
    let inCostTag: string | null = null;

    let encOutCostCipher: string | null = null;
    let outCostIv: string | null = null;
    let outCostTag: string | null = null;

    let encThoughtCostCipher: string | null = null;
    let thoughtCostIv: string | null = null;
    let thoughtCostTag: string | null = null;

    let messageInputCost: number | undefined = undefined;
    let messageOutputCost: number | undefined = undefined;
    let messageThoughtCost: number | undefined = undefined;
    let messageTotalCost: number | undefined = undefined;

    let encThoughtCipher: string | null = null;
    let thoughtIv: string | null = null;
    let thoughtTag: string | null = null;

    if (aiResult.inputTokens !== undefined || aiResult.outputTokens !== undefined) {
      const inT = aiResult.inputTokens ?? 0;
      const outT = aiResult.outputTokens ?? 0;
      
      if (inputPrice !== undefined || outputPrice !== undefined) {
        const inP = inputPrice ?? 0;
        const outP = outputPrice ?? 0;
        messageInputCost = (inT / 1000000 * inP);
        messageOutputCost = (outT / 1000000 * outP);
        messageTotalCost = messageInputCost + messageOutputCost;

        const inCostAad = buildFieldAad("message", assistantMsgId, "input_cost", 1);
        const encInCost = encryptBuffer(Buffer.from(messageInputCost.toString(), "utf-8"), dbKey, inCostAad);
        encInCostCipher = encInCost.ciphertext;
        inCostIv = encInCost.iv;
        inCostTag = encInCost.tag;

        const outCostAad = buildFieldAad("message", assistantMsgId, "output_cost", 1);
        const encOutCost = encryptBuffer(Buffer.from(messageOutputCost.toString(), "utf-8"), dbKey, outCostAad);
        encOutCostCipher = encOutCost.ciphertext;
        outCostIv = encOutCost.iv;
        outCostTag = encOutCost.tag;
      }

      const inTokensAad = buildFieldAad("message", assistantMsgId, "input_tokens", 1);
      const encInTokens = encryptBuffer(Buffer.from(inT.toString(), "utf-8"), dbKey, inTokensAad);
      encInTokensCipher = encInTokens.ciphertext;
      inTokensIv = encInTokens.iv;
      inTokensTag = encInTokens.tag;

      const outTokensAad = buildFieldAad("message", assistantMsgId, "output_tokens", 1);
      const encOutTokens = encryptBuffer(Buffer.from(outT.toString(), "utf-8"), dbKey, outTokensAad);
      encOutTokensCipher = encOutTokens.ciphertext;
      outTokensIv = encOutTokens.iv;
      outTokensTag = encOutTokens.tag;

      if (aiResult.thoughtTokens !== undefined) {
        const thoughtAad = buildFieldAad("message", assistantMsgId, "thought_tokens", 1);
        const encThought = encryptBuffer(Buffer.from(aiResult.thoughtTokens.toString(), "utf-8"), dbKey, thoughtAad);
        encThoughtCipher = encThought.ciphertext;
        thoughtIv = encThought.iv;
        thoughtTag = encThought.tag;
        
        // If we want to calculate thought cost, assuming thought tokens are part of output tokens usually, but we could separate it if there's a specific price. 
        // For now, only calculate if there's a specific thought price, or we can just leave it undefined since we don't have it in `calculateDynamicTokens`.
      }

      // Update Chat Tokens and Cost
      const chatRecord = await getChatRecordById(chat.id);
      if (chatRecord) {
        const fields = decryptChatFields(chatRecord, dbKey);
        const chatInputTokens = (fields.inputTokens || 0) + inT;
        const chatOutputTokens = (fields.outputTokens || 0) + outT;
        const chatInputCost = (fields.inputCost || 0) + (inT / 1000000 * (inputPrice ?? 0));
        const chatOutputCost = (fields.outputCost || 0) + (outT / 1000000 * (outputPrice ?? 0));
        const chatTotalCost = chatInputCost + chatOutputCost;
        const chatThoughtTokens = (fields.thoughtTokens || 0) + (aiResult.thoughtTokens || 0);

        chat.inputTokens = chatInputTokens;
        chat.outputTokens = chatOutputTokens;
        chat.thoughtTokens = chatThoughtTokens;
        chat.inputCost = chatInputCost;
        chat.outputCost = chatOutputCost;
        chat.totalCost = chatTotalCost;

        const inAad = buildFieldAad("chat", chat.id, "input_tokens", chatRecord.encryption_version);
        const encIn = encryptBuffer(Buffer.from(chatInputTokens.toString(), "utf-8"), dbKey, inAad);

        const outAad = buildFieldAad("chat", chat.id, "output_tokens", chatRecord.encryption_version);
        const encOut = encryptBuffer(Buffer.from(chatOutputTokens.toString(), "utf-8"), dbKey, outAad);

        let encChatThought, chatThoughtIv, chatThoughtTag;
        if (chatThoughtTokens > 0) {
          const thoughtAad = buildFieldAad("chat", chat.id, "thought_tokens", chatRecord.encryption_version);
          const eThought = encryptBuffer(Buffer.from(chatThoughtTokens.toString(), "utf-8"), dbKey, thoughtAad);
          encChatThought = eThought.ciphertext; chatThoughtIv = eThought.iv; chatThoughtTag = eThought.tag;
        }

        let encInCost, inCostIv, inCostTag;
        let encOutCost, outCostIv, outCostTag;
        let encTotCost, totCostIv, totCostTag;

        if (inputPrice !== undefined || outputPrice !== undefined) {
          const inCostAad = buildFieldAad("chat", chat.id, "input_cost", chatRecord.encryption_version);
          const eInC = encryptBuffer(Buffer.from(chatInputCost.toString(), "utf-8"), dbKey, inCostAad);
          encInCost = eInC.ciphertext; inCostIv = eInC.iv; inCostTag = eInC.tag;

          const outCostAad = buildFieldAad("chat", chat.id, "output_cost", chatRecord.encryption_version);
          const eOutC = encryptBuffer(Buffer.from(chatOutputCost.toString(), "utf-8"), dbKey, outCostAad);
          encOutCost = eOutC.ciphertext; outCostIv = eOutC.iv; outCostTag = eOutC.tag;

          const totCostAad = buildFieldAad("chat", chat.id, "total_cost", chatRecord.encryption_version);
          const eTotC = encryptBuffer(Buffer.from(chatTotalCost.toString(), "utf-8"), dbKey, totCostAad);
          encTotCost = eTotC.ciphertext; totCostIv = eTotC.iv; totCostTag = eTotC.tag;
        }

        await updateChatRecord(chat.id, {
          encrypted_input_tokens: encIn.ciphertext,
          input_tokens_iv: encIn.iv,
          input_tokens_tag: encIn.tag,
          encrypted_output_tokens: encOut.ciphertext,
          output_tokens_iv: encOut.iv,
          output_tokens_tag: encOut.tag,
          encrypted_thought_tokens: encChatThought,
          thought_tokens_iv: chatThoughtIv,
          thought_tokens_tag: chatThoughtTag,
          encrypted_input_cost: encInCost,
          input_cost_iv: inCostIv,
          input_cost_tag: inCostTag,
          encrypted_output_cost: encOutCost,
          output_cost_iv: outCostIv,
          output_cost_tag: outCostTag,
          encrypted_total_cost: encTotCost,
          total_cost_iv: totCostIv,
          total_cost_tag: totCostTag,
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
      encrypted_input_tokens: encInTokensCipher,
      input_tokens_iv: inTokensIv,
      input_tokens_tag: inTokensTag,
      encrypted_output_tokens: encOutTokensCipher,
      output_tokens_iv: outTokensIv,
      output_tokens_tag: outTokensTag,
      encrypted_thought_tokens: encThoughtCipher,
      thought_tokens_iv: thoughtIv,
      thought_tokens_tag: thoughtTag,
      encrypted_input_cost: encInCostCipher,
      input_cost_iv: inCostIv,
      input_cost_tag: inCostTag,
      encrypted_output_cost: encOutCostCipher,
      output_cost_iv: outCostIv,
      output_cost_tag: outCostTag,
      encrypted_thought_cost: encThoughtCostCipher,
      thought_cost_iv: thoughtCostIv,
      thought_cost_tag: thoughtCostTag,
    });

    const assistantMessageDto: ChatMessageDto = {
      id: assistantRecord.id,
      chatId: assistantRecord.chat_id,
      role: "assistant",
      content: aiResult.content,
      sequenceNumber: assistantRecord.sequence_number,
      inputTokens: aiResult.inputTokens,
      outputTokens: aiResult.outputTokens,
      thoughtTokens: aiResult.thoughtTokens,
      inputCost: messageInputCost,
      outputCost: messageOutputCost,
      thoughtCost: messageThoughtCost,
      totalCost: messageTotalCost,
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
