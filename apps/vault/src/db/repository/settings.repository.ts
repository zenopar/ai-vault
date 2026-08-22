import { getPrismaClient } from "../client.js";
import { randomUUID } from "node:crypto";

export interface SettingsRecord {
  id: string;
  encryption_version: number;
  encrypted_system_prompt: string | null;
  system_prompt_iv: string | null;
  system_prompt_tag: string | null;
  encrypted_token_tiers: string | null;
  token_tiers_iv: string | null;
  token_tiers_tag: string | null;
  encrypted_max_cost_per_request: string | null;
  max_cost_per_request_iv: string | null;
  max_cost_per_request_tag: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UpdateSettingsData {
  encrypted_system_prompt?: string | null;
  system_prompt_iv?: string | null;
  system_prompt_tag?: string | null;
  
  encrypted_token_tiers?: string | null;
  token_tiers_iv?: string | null;
  token_tiers_tag?: string | null;
  
  encrypted_max_cost_per_request?: string | null;
  max_cost_per_request_iv?: string | null;
  max_cost_per_request_tag?: string | null;
}

export async function getSettingsRecord(): Promise<SettingsRecord | null> {
  const prisma = getPrismaClient();
  const settings = await prisma.settings.findFirst();
  return settings as SettingsRecord | null;
}

export async function upsertSettingsRecord(data: UpdateSettingsData): Promise<SettingsRecord> {
  const prisma = getPrismaClient();
  const existing = await prisma.settings.findFirst();

  if (existing) {
    return prisma.settings.update({
      where: { id: existing.id },
      data: {
        ...(data.encrypted_system_prompt !== undefined && { encrypted_system_prompt: data.encrypted_system_prompt }),
        ...(data.system_prompt_iv !== undefined && { system_prompt_iv: data.system_prompt_iv }),
        ...(data.system_prompt_tag !== undefined && { system_prompt_tag: data.system_prompt_tag }),

        ...(data.encrypted_token_tiers !== undefined && { encrypted_token_tiers: data.encrypted_token_tiers }),
        ...(data.token_tiers_iv !== undefined && { token_tiers_iv: data.token_tiers_iv }),
        ...(data.token_tiers_tag !== undefined && { token_tiers_tag: data.token_tiers_tag }),

        ...(data.encrypted_max_cost_per_request !== undefined && { encrypted_max_cost_per_request: data.encrypted_max_cost_per_request }),
        ...(data.max_cost_per_request_iv !== undefined && { max_cost_per_request_iv: data.max_cost_per_request_iv }),
        ...(data.max_cost_per_request_tag !== undefined && { max_cost_per_request_tag: data.max_cost_per_request_tag }),
      },
    }) as unknown as Promise<SettingsRecord>;
  } else {
    return prisma.settings.create({
      data: {
        id: randomUUID(),
        encryption_version: 1,
        encrypted_system_prompt: data.encrypted_system_prompt ?? null,
        system_prompt_iv: data.system_prompt_iv ?? null,
        system_prompt_tag: data.system_prompt_tag ?? null,

        encrypted_token_tiers: data.encrypted_token_tiers ?? null,
        token_tiers_iv: data.token_tiers_iv ?? null,
        token_tiers_tag: data.token_tiers_tag ?? null,

        encrypted_max_cost_per_request: data.encrypted_max_cost_per_request ?? null,
        max_cost_per_request_iv: data.max_cost_per_request_iv ?? null,
        max_cost_per_request_tag: data.max_cost_per_request_tag ?? null,
      },
    }) as unknown as Promise<SettingsRecord>;
  }
}
