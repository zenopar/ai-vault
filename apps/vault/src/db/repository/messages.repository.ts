import { getPrismaClient } from "../client.js";
import { randomUUID } from "node:crypto";

export interface CreateMessageData {
  id?: string;
  chat_id: string;
  parent_message_id?: string | null;
  sequence_number?: number;
  role: string;
  encryption_version?: number;
  status?: string;
  encrypted_content: string;
  content_iv: string;
  content_tag: string;
  encrypted_metadata?: string | null;
  metadata_iv?: string | null;
  metadata_tag?: string | null;
}

export interface MessageRecord {
  id: string;
  chat_id: string;
  parent_message_id: string | null;
  sequence_number: number;
  role: string;
  encryption_version: number;
  status: string;
  encrypted_content: string;
  content_iv: string;
  content_tag: string;
  encrypted_metadata: string | null;
  metadata_iv: string | null;
  metadata_tag: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createMessageRecord(data: CreateMessageData): Promise<MessageRecord> {
  const prisma = getPrismaClient();
  return prisma.messages.create({
    data: {
      id: data.id || randomUUID(),
      chat_id: data.chat_id,
      parent_message_id: data.parent_message_id ?? null,
      sequence_number: data.sequence_number ?? 1,
      role: data.role,
      encryption_version: data.encryption_version ?? 1,
      status: data.status ?? "ACTIVE",
      encrypted_content: data.encrypted_content,
      content_iv: data.content_iv,
      content_tag: data.content_tag,
      encrypted_metadata: data.encrypted_metadata ?? null,
      metadata_iv: data.metadata_iv ?? null,
      metadata_tag: data.metadata_tag ?? null,
    },
  });
}

export async function getMessagesByChatId(
  chatId: string,
  limit?: number,
  offset?: number,
  sort: "asc" | "desc" = "asc"
): Promise<MessageRecord[]> {
  const prisma = getPrismaClient();
  return prisma.messages.findMany({
    where: {
      chat_id: chatId,
      status: "ACTIVE",
    },
    orderBy: { sequence_number: sort },
    take: limit,
    skip: offset,
  });
}

export async function countMessagesByChatId(chatId: string): Promise<number> {
  const prisma = getPrismaClient();
  return prisma.messages.count({
    where: {
      chat_id: chatId,
      status: "ACTIVE",
    },
  });
}

export async function getMessageRecordById(id: string): Promise<MessageRecord | null> {
  const prisma = getPrismaClient();
  return prisma.messages.findUnique({
    where: { id },
  });
}

export async function getLatestSequenceNumber(chatId: string): Promise<number> {
  const prisma = getPrismaClient();
  const latest = await prisma.messages.findFirst({
    where: { chat_id: chatId, status: "ACTIVE" },
    orderBy: { sequence_number: "desc" },
    select: { sequence_number: true },
  });
  return latest?.sequence_number ?? 0;
}

export interface CreateMessagePairParams {
  chatId: string;
  userMessage: Omit<CreateMessageData, "sequence_number" | "chat_id">;
  assistantMessage: Omit<CreateMessageData, "sequence_number" | "chat_id">;
  chatUpdate?: {
    encrypted_input_tokens?: string;
    input_tokens_iv?: string;
    input_tokens_tag?: string;
    encrypted_output_tokens?: string;
    output_tokens_iv?: string;
    output_tokens_tag?: string;
    encrypted_thought_tokens?: string | null;
    thought_tokens_iv?: string | null;
    thought_tokens_tag?: string | null;
    encrypted_input_cost?: string | null;
    input_cost_iv?: string | null;
    input_cost_tag?: string | null;
    encrypted_output_cost?: string | null;
    output_cost_iv?: string | null;
    output_cost_tag?: string | null;
    encrypted_thought_cost?: string | null;
    thought_cost_iv?: string | null;
    thought_cost_tag?: string | null;
    encrypted_total_cost?: string | null;
    total_cost_iv?: string | null;
    total_cost_tag?: string | null;
  };
}

/**
 * Atomically creates both user and assistant message records and updates chat tokens/costs in a single transaction.
 */
export async function createMessagePairWithSequence(
  params: CreateMessagePairParams
): Promise<{ userRecord: MessageRecord; assistantRecord: MessageRecord }> {
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const latest = await tx.messages.findFirst({
      where: { chat_id: params.chatId, status: "ACTIVE" },
      orderBy: { sequence_number: "desc" },
      select: { sequence_number: true },
    });
    const latestSeq = latest?.sequence_number ?? 0;

    const userRecord = await tx.messages.create({
      data: {
        id: params.userMessage.id || randomUUID(),
        chat_id: params.chatId,
        parent_message_id: params.userMessage.parent_message_id ?? null,
        sequence_number: latestSeq + 1,
        role: "user",
        encryption_version: params.userMessage.encryption_version ?? 1,
        status: params.userMessage.status ?? "ACTIVE",
        encrypted_content: params.userMessage.encrypted_content,
        content_iv: params.userMessage.content_iv,
        content_tag: params.userMessage.content_tag,
        encrypted_metadata: params.userMessage.encrypted_metadata ?? null,
        metadata_iv: params.userMessage.metadata_iv ?? null,
        metadata_tag: params.userMessage.metadata_tag ?? null,
      },
    });

    const assistantRecord = await tx.messages.create({
      data: {
        id: params.assistantMessage.id || randomUUID(),
        chat_id: params.chatId,
        parent_message_id: userRecord.id,
        sequence_number: latestSeq + 2,
        role: "assistant",
        encryption_version: params.assistantMessage.encryption_version ?? 1,
        status: params.assistantMessage.status ?? "ACTIVE",
        encrypted_content: params.assistantMessage.encrypted_content,
        content_iv: params.assistantMessage.content_iv,
        content_tag: params.assistantMessage.content_tag,
        encrypted_metadata: params.assistantMessage.encrypted_metadata ?? null,
        metadata_iv: params.assistantMessage.metadata_iv ?? null,
        metadata_tag: params.assistantMessage.metadata_tag ?? null,
      },
    });

    if (params.chatUpdate) {
      await tx.chats.update({
        where: { id: params.chatId },
        data: {
          ...params.chatUpdate,
          updated_at: new Date(),
        },
      });
    }

    return { userRecord, assistantRecord };
  });
}

export interface MessagesAnalyticsFilter {
  from?: Date;
  to?: Date;
}

export async function getMessagesForAnalytics(filter?: MessagesAnalyticsFilter): Promise<MessageRecord[]> {
  const prisma = getPrismaClient();
  const whereClause: any = {
    status: "ACTIVE",
  };

  if (filter?.from || filter?.to) {
    whereClause.created_at = {};
    if (filter.from) {
      whereClause.created_at.gte = filter.from;
    }
    if (filter.to) {
      whereClause.created_at.lte = filter.to;
    }
  }

  return prisma.messages.findMany({
    where: whereClause,
    orderBy: { created_at: "asc" },
  });
}

