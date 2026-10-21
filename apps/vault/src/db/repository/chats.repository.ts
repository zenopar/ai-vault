import { getPrismaClient } from "../client.js";
import { Prisma, chats } from "@prisma/client";
import { randomUUID } from "node:crypto";

export async function createChatRecord(data: Prisma.chatsUncheckedCreateInput): Promise<chats> {
  const prisma = getPrismaClient();
  return prisma.chats.create({
    data: {
      ...data,
      id: data.id || randomUUID(),
      encryption_version: data.encryption_version ?? 1,
      status: data.status ?? "ACTIVE",
    },
  });
}

export async function getChatRecordById(id: string): Promise<chats | null> {
  const prisma = getPrismaClient();
  return prisma.chats.findUnique({
    where: { id },
  });
}

export async function getAllChatsRecords(limit?: number, offset?: number, projectId?: string | null): Promise<chats[]> {
  const prisma = getPrismaClient();
  const where: Prisma.chatsWhereInput = { status: "ACTIVE" };
  if (projectId !== undefined) {
    where.project_id = projectId;
  }
  return prisma.chats.findMany({
    where,
    orderBy: { updated_at: "desc" },
    take: limit,
    skip: offset,
  });
}

export async function updateChatRecord(
  id: string,
  data: Partial<Prisma.chatsCreateInput>
): Promise<chats> {
  const prisma = getPrismaClient();
  
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([_, v]) => v !== undefined)
  );

  return prisma.chats.update({
    where: { id },
    data: {
      ...cleanData,
      updated_at: new Date(),
    },
  });
}

export async function deleteChatRecord(id: string): Promise<chats> {
  const prisma = getPrismaClient();
  return prisma.chats.delete({
    where: { id },
  });
}
