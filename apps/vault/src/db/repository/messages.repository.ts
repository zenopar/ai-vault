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
  encrypted_thought_cost?: string | null;
  thought_cost_iv?: string | null;
  thought_cost_tag?: string | null;
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
  encrypted_thought_cost: string | null;
  thought_cost_iv: string | null;
  thought_cost_tag: string | null;
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
      encrypted_thought_cost: data.encrypted_thought_cost ?? null,
      thought_cost_iv: data.thought_cost_iv ?? null,
      thought_cost_tag: data.thought_cost_tag ?? null,
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

/**
 * Atomically reads the latest sequence number and creates a message in a single transaction.
 * Returns the created record and the sequence number base used (for inserting follow-up messages).
 */
export async function createMessageWithSequence(
  data: Omit<CreateMessageData, "sequence_number">,
  chatId: string,
  sequenceOffset: number = 1,
): Promise<{ record: MessageRecord; latestSeq: number }> {
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const latest = await tx.messages.findFirst({
      where: { chat_id: chatId, status: "ACTIVE" },
      orderBy: { sequence_number: "desc" },
      select: { sequence_number: true },
    });
    const latestSeq = latest?.sequence_number ?? 0;

    const record = await tx.messages.create({
      data: {
        id: data.id || randomUUID(),
        chat_id: data.chat_id,
        parent_message_id: data.parent_message_id ?? null,
        sequence_number: latestSeq + sequenceOffset,
        role: data.role,
        encryption_version: data.encryption_version ?? 1,
        status: data.status ?? "ACTIVE",
        encrypted_content: data.encrypted_content,
        content_iv: data.content_iv,
        content_tag: data.content_tag,
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
        encrypted_thought_cost: data.encrypted_thought_cost ?? null,
        thought_cost_iv: data.thought_cost_iv ?? null,
        thought_cost_tag: data.thought_cost_tag ?? null,
        encrypted_metadata: data.encrypted_metadata ?? null,
        metadata_iv: data.metadata_iv ?? null,
        metadata_tag: data.metadata_tag ?? null,
      },
    });

    return { record, latestSeq };
  });
}
