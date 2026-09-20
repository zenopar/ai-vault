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

  const files = await client.chat_files.findMany({
    where: {
      id: { in: fileIds },
      status: "ACTIVE",
    },
  });

  for (const file of files) {
    if (!file.message_id) {
      // First-time attachment: link directly to this message
      await client.chat_files.update({
        where: { id: file.id },
        data: {
          message_id: messageId,
          chat_id: chatId,
        },
      });
    } else if (file.message_id !== messageId) {
      // Re-referenced file from a previous message: clone record so earlier messages retain the attachment
      await client.chat_files.create({
        data: {
          id: randomUUID(),
          chat_id: chatId,
          message_id: messageId,
          encryption_version: file.encryption_version,
          encrypted_file_name: file.encrypted_file_name,
          file_name_iv: file.file_name_iv,
          file_name_tag: file.file_name_tag,
          mime_type: file.mime_type,
          file_size: file.file_size,
          r2_key: file.r2_key,
          status: "ACTIVE",
        },
      });
    }
  }
}

export async function deleteFileRecord(id: string): Promise<chat_files> {
  const prisma = getPrismaClient();
  return prisma.chat_files.update({
    where: { id },
    data: { status: "DELETED" },
  });
}
