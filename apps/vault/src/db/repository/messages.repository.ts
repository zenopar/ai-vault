import { getPrismaClient } from "../client.js";
import { Prisma, messages } from "@prisma/client";
import { randomUUID } from "node:crypto";

export async function createMessageRecord(data: Prisma.messagesUncheckedCreateInput): Promise<messages> {
  const prisma = getPrismaClient();
  return prisma.messages.create({
    data: {
      ...data,
      id: data.id || randomUUID(),
      sequence_number: data.sequence_number ?? 1,
      encryption_version: data.encryption_version ?? 1,
      status: data.status ?? "ACTIVE",
    },
  });
}

export async function getMessagesByChatId(
  chatId: string,
  limit?: number,
  offset?: number,
  sort: "asc" | "desc" = "asc"
): Promise<messages[]> {
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

export async function getMessageRecordById(id: string): Promise<messages | null> {
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
  userMessage: Omit<Prisma.messagesUncheckedCreateInput, "sequence_number" | "chat_id">;
  assistantMessage: Omit<Prisma.messagesUncheckedCreateInput, "sequence_number" | "chat_id">;
  chatUpdate?: Prisma.chatsUpdateInput;
  fileIds?: string[];
}

/**
 * Atomically creates both user and assistant message records, links file attachments, and updates chat tokens/costs in a single transaction.
 */
export async function createMessagePairWithSequence(
  params: CreateMessagePairParams
): Promise<{ userRecord: messages; assistantRecord: messages }> {
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
        ...(params.userMessage as Prisma.messagesUncheckedCreateInput),
        id: params.userMessage.id || randomUUID(),
        chat_id: params.chatId,
        sequence_number: latestSeq + 1,
        role: "user",
        encryption_version: params.userMessage.encryption_version ?? 1,
        status: params.userMessage.status ?? "ACTIVE",
      },
    });

    const assistantRecord = await tx.messages.create({
      data: {
        ...(params.assistantMessage as Prisma.messagesUncheckedCreateInput),
        id: params.assistantMessage.id || randomUUID(),
        chat_id: params.chatId,
        parent_message_id: userRecord.id,
        sequence_number: latestSeq + 2,
        role: "assistant",
        encryption_version: params.assistantMessage.encryption_version ?? 1,
        status: params.assistantMessage.status ?? "ACTIVE",
      },
    });

    if (params.fileIds && params.fileIds.length > 0) {
      await tx.chat_files.updateMany({
        where: {
          id: { in: params.fileIds },
          status: "ACTIVE",
        },
        data: {
          message_id: userRecord.id,
          chat_id: params.chatId,
        },
      });
    }

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

export async function getMessagesForAnalytics(filter?: MessagesAnalyticsFilter): Promise<messages[]> {
  const prisma = getPrismaClient();
  const whereClause: Prisma.messagesWhereInput = {
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


