import { getPrismaClient } from "../client.js";
import { randomUUID } from "node:crypto";

export interface CreateChatData {
  id?: string;
  encryption_version?: number;
  status?: string;
  encrypted_title: string;
  title_iv: string;
  title_tag: string;
  encrypted_metadata?: string | null;
  metadata_iv?: string | null;
  metadata_tag?: string | null;
  encrypted_input_tokens?: string | null;
  input_tokens_iv?: string | null;
  input_tokens_tag?: string | null;
  encrypted_output_tokens?: string | null;
  output_tokens_iv?: string | null;
  output_tokens_tag?: string | null;
  encrypted_thought_tokens?: string | null;
  thought_tokens_iv?: string | null;
  thought_tokens_tag?: string | null;
  encrypted_input_cost?: string | null;
  input_cost_iv?: string | null;
  input_cost_tag?: string | null;
  encrypted_output_cost?: string | null;
  output_cost_iv?: string | null;
  output_cost_tag?: string | null;
  encrypted_total_cost?: string | null;
  total_cost_iv?: string | null;
  total_cost_tag?: string | null;
}

export interface ChatRecord {
  id: string;
  encryption_version: number;
  status: string;
  encrypted_title: string;
  title_iv: string;
  title_tag: string;
  encrypted_metadata: string | null;
  metadata_iv: string | null;
  metadata_tag: string | null;
  encrypted_input_tokens: string | null;
  input_tokens_iv: string | null;
  input_tokens_tag: string | null;
  encrypted_output_tokens: string | null;
  output_tokens_iv: string | null;
  output_tokens_tag: string | null;
  encrypted_thought_tokens: string | null;
  thought_tokens_iv: string | null;
  thought_tokens_tag: string | null;
  encrypted_input_cost: string | null;
  input_cost_iv: string | null;
  input_cost_tag: string | null;
  encrypted_output_cost: string | null;
  output_cost_iv: string | null;
  output_cost_tag: string | null;
  encrypted_total_cost: string | null;
  total_cost_iv: string | null;
  total_cost_tag: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createChatRecord(data: CreateChatData): Promise<ChatRecord> {
  const prisma = getPrismaClient();
  return prisma.chats.create({
    data: {
      id: data.id || randomUUID(),
      encryption_version: data.encryption_version ?? 1,
      status: data.status ?? "ACTIVE",
      encrypted_title: data.encrypted_title,
      title_iv: data.title_iv,
      title_tag: data.title_tag,
      encrypted_metadata: data.encrypted_metadata ?? null,
      metadata_iv: data.metadata_iv ?? null,
      metadata_tag: data.metadata_tag ?? null,
      encrypted_input_tokens: data.encrypted_input_tokens ?? null,
      input_tokens_iv: data.input_tokens_iv ?? null,
      input_tokens_tag: data.input_tokens_tag ?? null,
      encrypted_output_tokens: data.encrypted_output_tokens ?? null,
      output_tokens_iv: data.output_tokens_iv ?? null,
      output_tokens_tag: data.output_tokens_tag ?? null,
      encrypted_thought_tokens: data.encrypted_thought_tokens ?? null,
      thought_tokens_iv: data.thought_tokens_iv ?? null,
      thought_tokens_tag: data.thought_tokens_tag ?? null,
      encrypted_input_cost: data.encrypted_input_cost ?? null,
      input_cost_iv: data.input_cost_iv ?? null,
      input_cost_tag: data.input_cost_tag ?? null,
      encrypted_output_cost: data.encrypted_output_cost ?? null,
      output_cost_iv: data.output_cost_iv ?? null,
      output_cost_tag: data.output_cost_tag ?? null,
      encrypted_total_cost: data.encrypted_total_cost ?? null,
      total_cost_iv: data.total_cost_iv ?? null,
      total_cost_tag: data.total_cost_tag ?? null,
    },
  });
}

export async function getChatRecordById(id: string): Promise<ChatRecord | null> {
  const prisma = getPrismaClient();
  return prisma.chats.findUnique({
    where: { id },
  });
}

export async function getAllChatsRecords(limit?: number, offset?: number): Promise<ChatRecord[]> {
  const prisma = getPrismaClient();
  return prisma.chats.findMany({
    where: { status: "ACTIVE" },
    orderBy: { updated_at: "desc" },
    take: limit,
    skip: offset,
  });
}

export async function updateChatRecord(
  id: string,
  data: Partial<CreateChatData>
): Promise<ChatRecord> {
  const prisma = getPrismaClient();
  return prisma.chats.update({
    where: { id },
    data: {
      ...(data.status !== undefined && { status: data.status }),
      ...(data.encrypted_title !== undefined && { encrypted_title: data.encrypted_title }),
      ...(data.title_iv !== undefined && { title_iv: data.title_iv }),
      ...(data.title_tag !== undefined && { title_tag: data.title_tag }),
      ...(data.encrypted_metadata !== undefined && { encrypted_metadata: data.encrypted_metadata }),
      ...(data.metadata_iv !== undefined && { metadata_iv: data.metadata_iv }),
      ...(data.metadata_tag !== undefined && { metadata_tag: data.metadata_tag }),
      ...(data.encrypted_input_tokens !== undefined && { encrypted_input_tokens: data.encrypted_input_tokens }),
      ...(data.input_tokens_iv !== undefined && { input_tokens_iv: data.input_tokens_iv }),
      ...(data.input_tokens_tag !== undefined && { input_tokens_tag: data.input_tokens_tag }),
      ...(data.encrypted_output_tokens !== undefined && { encrypted_output_tokens: data.encrypted_output_tokens }),
      ...(data.output_tokens_iv !== undefined && { output_tokens_iv: data.output_tokens_iv }),
      ...(data.output_tokens_tag !== undefined && { output_tokens_tag: data.output_tokens_tag }),
      ...(data.encrypted_thought_tokens !== undefined && { encrypted_thought_tokens: data.encrypted_thought_tokens }),
      ...(data.thought_tokens_iv !== undefined && { thought_tokens_iv: data.thought_tokens_iv }),
      ...(data.thought_tokens_tag !== undefined && { thought_tokens_tag: data.thought_tokens_tag }),
      ...(data.encrypted_input_cost !== undefined && { encrypted_input_cost: data.encrypted_input_cost }),
      ...(data.input_cost_iv !== undefined && { input_cost_iv: data.input_cost_iv }),
      ...(data.input_cost_tag !== undefined && { input_cost_tag: data.input_cost_tag }),
      ...(data.encrypted_output_cost !== undefined && { encrypted_output_cost: data.encrypted_output_cost }),
      ...(data.output_cost_iv !== undefined && { output_cost_iv: data.output_cost_iv }),
      ...(data.output_cost_tag !== undefined && { output_cost_tag: data.output_cost_tag }),
      ...(data.encrypted_total_cost !== undefined && { encrypted_total_cost: data.encrypted_total_cost }),
      ...(data.total_cost_iv !== undefined && { total_cost_iv: data.total_cost_iv }),
      ...(data.total_cost_tag !== undefined && { total_cost_tag: data.total_cost_tag }),
      updated_at: new Date(),
    },
  });
}

export async function deleteChatRecord(id: string): Promise<ChatRecord> {
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    // Soft delete all messages associated with the chat
    await tx.messages.updateMany({
      where: { chat_id: id },
      data: { status: "DELETED", updated_at: new Date() },
    });

    // Soft delete the chat itself
    return tx.chats.update({
      where: { id },
      data: { status: "DELETED", updated_at: new Date() },
    });
  });
}
