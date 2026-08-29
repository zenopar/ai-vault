import { getPrismaClient } from "../client.js";
import { randomUUID } from "node:crypto";

export interface CreateApiKeyData {
  id?: string;
  provider: string;
  name: string;
  encrypted_key: string;
  iv: string;
  tag: string;
  is_active?: boolean;
  encrypted_base_url?: string;
  base_url_iv?: string;
  base_url_tag?: string;
}

export interface ApiKeyRecord {
  id: string;
  provider: string;
  name: string;
  encrypted_key: string;
  iv: string;
  tag: string;
  is_active: boolean;
  encrypted_base_url: string | null;
  base_url_iv: string | null;
  base_url_tag: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createApiKeyRecord(data: CreateApiKeyData) {
  const prisma = getPrismaClient();
  return prisma.ai_api_keys.create({
    data: {
      id: data.id || randomUUID(),
      provider: data.provider,
      name: data.name,
      encrypted_key: data.encrypted_key,
      iv: data.iv,
      tag: data.tag,
      is_active: data.is_active ?? true,
      encrypted_base_url: data.encrypted_base_url ?? null,
      base_url_iv: data.base_url_iv ?? null,
      base_url_tag: data.base_url_tag ?? null,
    },
  });
}

export async function getAllApiKeys() {
  const prisma = getPrismaClient();
  return prisma.ai_api_keys.findMany({
    orderBy: { created_at: "desc" },
  });
}

export async function getApiKeyRecordById(id: string) {
  const prisma = getPrismaClient();
  return prisma.ai_api_keys.findUnique({
    where: { id },
  });
}

export async function deleteApiKeyRecord(id: string) {
  const prisma = getPrismaClient();
  return prisma.ai_api_keys.delete({
    where: { id },
  });
}
