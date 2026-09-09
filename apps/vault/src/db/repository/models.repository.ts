import { getPrismaClient } from "../client.js";
import { Prisma, models } from "@prisma/client";
import { randomUUID } from "node:crypto";

export type ModelRecord = models;

export async function getAllModels(provider?: string): Promise<models[]> {
  const prisma = getPrismaClient();
  const where = provider ? { provider: provider.toLowerCase(), is_active: true } : { is_active: true };
  return prisma.models.findMany({
    where,
    orderBy: [{ provider: "asc" }, { name: "asc" }],
  });
}

export async function getModelsByProvider(provider: string): Promise<models[]> {
  const prisma = getPrismaClient();
  return prisma.models.findMany({
    where: {
      provider: provider.toLowerCase(),
      is_active: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getModelById(id: string): Promise<models | null> {
  const prisma = getPrismaClient();
  return prisma.models.findUnique({
    where: { id },
  });
}

export async function createModelRecord(data: Prisma.modelsCreateInput): Promise<models> {
  const prisma = getPrismaClient();
  return prisma.models.create({
    data: {
      ...data,
      id: data.id || randomUUID(),
      provider: data.provider.toLowerCase(),
      is_active: data.is_active ?? true,
    },
  });
}

export async function deleteModelRecord(id: string): Promise<models> {
  const prisma = getPrismaClient();
  return prisma.models.delete({
    where: { id },
  });
}
