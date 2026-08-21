import { getPrismaClient } from "../client.js";
import { randomUUID } from "node:crypto";

export interface CreateModelData {
  id?: string;
  provider: string;
  name: string;
  display_name: string;
  description?: string | null;
  context_window?: number | null;
  input_price_per_1m?: number | null;
  output_price_per_1m?: number | null;
  is_active?: boolean;
}

export interface ModelRecord {
  id: string;
  provider: string;
  name: string;
  display_name: string;
  description: string | null;
  context_window: number | null;
  input_price_per_1m?: any | null;
  output_price_per_1m?: any | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function getAllModels(provider?: string): Promise<ModelRecord[]> {
  const prisma = getPrismaClient();
  const where = provider ? { provider: provider.toLowerCase(), is_active: true } : { is_active: true };
  return prisma.models.findMany({
    where,
    orderBy: [{ provider: "asc" }, { name: "asc" }],
  });
}

export async function getModelsByProvider(provider: string): Promise<ModelRecord[]> {
  const prisma = getPrismaClient();
  return prisma.models.findMany({
    where: {
      provider: provider.toLowerCase(),
      is_active: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getModelById(id: string): Promise<ModelRecord | null> {
  const prisma = getPrismaClient();
  return prisma.models.findUnique({
    where: { id },
  });
}

export async function createModelRecord(data: CreateModelData): Promise<ModelRecord> {
  const prisma = getPrismaClient();
  return prisma.models.create({
    data: {
      id: data.id || randomUUID(),
      provider: data.provider.toLowerCase(),
      name: data.name,
      display_name: data.display_name,
      description: data.description ?? null,
      context_window: data.context_window ?? null,
      input_price_per_1m: data.input_price_per_1m ?? null,
      output_price_per_1m: data.output_price_per_1m ?? null,
      is_active: data.is_active ?? true,
    },
  });
}

export async function deleteModelRecord(id: string): Promise<ModelRecord> {
  const prisma = getPrismaClient();
  return prisma.models.delete({
    where: { id },
  });
}
