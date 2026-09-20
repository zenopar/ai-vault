import { getPrismaClient } from "../client.js";
import { Prisma, chat_files } from "@prisma/client";
import { randomUUID } from "node:crypto";

export async function createFileRecord(
  data: Omit<Prisma.chat_filesUncheckedCreateInput, "id"> & { id?: string }
): Promise<chat_files> {
  const prisma = getPrismaClient();
  return prisma.chat_files.create({
    data: {
      ...data,
      id: data.id || randomUUID(),
      encryption_version: data.encryption_version ?? 1,
      status: data.status ?? "ACTIVE",
    },
  });
}

export async function getFileRecordById(id: string): Promise<chat_files | null> {
  const prisma = getPrismaClient();
  return prisma.chat_files.findFirst({
    where: {
      id,
      status: "ACTIVE",
    },
  });
}

export async function getFilesByMessageIds(messageIds: string[]): Promise<chat_files[]> {
  if (messageIds.length === 0) return [];
  const prisma = getPrismaClient();
  return prisma.chat_files.findMany({
    where: {
      message_id: { in: messageIds },
      status: "ACTIVE",
    },
    orderBy: { created_at: "asc" },
  });
}

export async function getFilesByChatId(chatId: string): Promise<chat_files[]> {
  const prisma = getPrismaClient();
  return prisma.chat_files.findMany({
    where: {
      chat_id: chatId,
      status: "ACTIVE",
    },
    orderBy: { created_at: "desc" },
  });
}

export async function linkFilesToMessage(
  fileIds: string[],
  messageId: string,
  chatId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  if (!fileIds || fileIds.length === 0) return;
  const client = tx || getPrismaClient();
  await client.chat_files.updateMany({
    where: {
      id: { in: fileIds },
      status: "ACTIVE",
    },
    data: {
      message_id: messageId,
      chat_id: chatId,
    },
  });
}

export async function deleteFileRecord(id: string): Promise<chat_files> {
  const prisma = getPrismaClient();
  return prisma.chat_files.update({
    where: { id },
    data: { status: "DELETED" },
  });
}
