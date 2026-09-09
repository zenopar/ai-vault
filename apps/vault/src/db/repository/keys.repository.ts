import { getPrismaClient } from "../client.js";
import { randomUUID } from "node:crypto";

import { getPrismaClient } from "../client.js";
import { Prisma, ai_api_keys } from "@prisma/client";
import { randomUUID } from "node:crypto";

export async function createApiKeyRecord(data: Prisma.ai_api_keysCreateInput): Promise<ai_api_keys> {
  const prisma = getPrismaClient();
  return prisma.ai_api_keys.create({
    data: {
      ...data,
      id: data.id || randomUUID(),
      is_active: data.is_active ?? true,
    },
  });
}

export async function getAllApiKeys(): Promise<ai_api_keys[]> {
  const prisma = getPrismaClient();
  return prisma.ai_api_keys.findMany({
    orderBy: { created_at: "desc" },
  });
}

export async function getApiKeyRecordById(id: string): Promise<ai_api_keys | null> {
  const prisma = getPrismaClient();
  return prisma.ai_api_keys.findUnique({
    where: { id },
  });
}

export async function deleteApiKeyRecord(id: string): Promise<ai_api_keys> {
  const prisma = getPrismaClient();
  return prisma.ai_api_keys.delete({
    where: { id },
  });
}
