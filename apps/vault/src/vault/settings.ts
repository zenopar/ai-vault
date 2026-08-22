import { vaultState } from "./state.js";
import { encryptBuffer, decryptBuffer } from "./crypto.js";
import { buildFieldAad } from "./keys.js";
import { getSettingsRecord, upsertSettingsRecord, UpdateSettingsData } from "../db/repository/settings.repository.js";
import type { SettingsDto, TokenTierDto } from "@ai-vault/types";

export const DEFAULT_SYSTEM_PROMPT = "Be a friendly but 100% honest assistant. Truth is paramount regardless of emotions. Keep responses as concise as possible while remaining fully meaningful.";
export const DEFAULT_TOKEN_TIERS: TokenTierDto[] = [
  { max_cost: 0.50, tokens: 4000 },
  { max_cost: 2.50, tokens: 2500 },
  { max_cost: 10.00, tokens: 1500 },
  { max_cost: 999999, tokens: 800 },
];
export const DEFAULT_MAX_COST = 0.50;

export async function getSettings(sessionToken: string): Promise<SettingsDto> {
  const record = await getSettingsRecord();
  if (!record) {
    return {
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      tokenTiers: DEFAULT_TOKEN_TIERS,
      maxCostPerRequest: DEFAULT_MAX_COST,
    };
  }

  return vaultState.withDbKey(sessionToken, (dbKey) => {
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    let tokenTiers = DEFAULT_TOKEN_TIERS;
    let maxCostPerRequest = DEFAULT_MAX_COST;
    const version = record.encryption_version;
    const id = record.id;

    if (record.encrypted_system_prompt && record.system_prompt_iv && record.system_prompt_tag) {
      const aad = buildFieldAad("settings", id, "system_prompt", version);
      try {
        const dec = decryptBuffer(
          {
            ciphertext: record.encrypted_system_prompt,
            iv: record.system_prompt_iv,
            tag: record.system_prompt_tag,
          },
          dbKey,
          aad
        );
        systemPrompt = dec.toString("utf-8");
        dec.fill(0);
      } catch (e) {
        console.error("Failed to decrypt system_prompt", e);
      }
    }

    if (record.encrypted_token_tiers && record.token_tiers_iv && record.token_tiers_tag) {
      const aad = buildFieldAad("settings", id, "token_tiers", version);
      try {
        const dec = decryptBuffer(
          {
            ciphertext: record.encrypted_token_tiers,
            iv: record.token_tiers_iv,
            tag: record.token_tiers_tag,
          },
          dbKey,
          aad
        );
        tokenTiers = JSON.parse(dec.toString("utf-8"));
        dec.fill(0);
      } catch (e) {
        console.error("Failed to decrypt token_tiers", e);
      }
    }

    if (record.encrypted_max_cost_per_request && record.max_cost_per_request_iv && record.max_cost_per_request_tag) {
      const aad = buildFieldAad("settings", id, "max_cost_per_request", version);
      try {
        const dec = decryptBuffer(
          {
            ciphertext: record.encrypted_max_cost_per_request,
            iv: record.max_cost_per_request_iv,
            tag: record.max_cost_per_request_tag,
          },
          dbKey,
          aad
        );
        maxCostPerRequest = parseFloat(dec.toString("utf-8"));
        dec.fill(0);
      } catch (e) {
        console.error("Failed to decrypt max_cost_per_request", e);
      }
    }

    return {
      id,
      systemPrompt,
      tokenTiers,
      maxCostPerRequest,
    };
  });
}

export async function updateSettings(
  params: { systemPrompt?: string; tokenTiers?: TokenTierDto[]; maxCostPerRequest?: number },
  sessionToken: string
): Promise<SettingsDto> {
  const currentRecord = await getSettingsRecord();
  const id = currentRecord?.id || "temp"; // The repository upsert handles randomUUID if new.
  
  // If it's totally new, the repo will generate an ID.
  // To avoid AAD mismatch if we encrypt with a fake ID, we must ensure the record exists first.
  let targetId = id;
  if (!currentRecord) {
    const newRecord = await upsertSettingsRecord({});
    targetId = newRecord.id;
  }

  const updateData: UpdateSettingsData = {};

  await vaultState.withDbKey(sessionToken, (dbKey) => {
    const version = 1;

    if (params.systemPrompt !== undefined) {
      const aad = buildFieldAad("settings", targetId, "system_prompt", version);
      const pt = Buffer.from(params.systemPrompt, "utf-8");
      const enc = encryptBuffer(pt, dbKey, aad);
      updateData.encrypted_system_prompt = enc.ciphertext;
      updateData.system_prompt_iv = enc.iv;
      updateData.system_prompt_tag = enc.tag;
      pt.fill(0);
    }

    if (params.tokenTiers !== undefined) {
      const aad = buildFieldAad("settings", targetId, "token_tiers", version);
      const pt = Buffer.from(JSON.stringify(params.tokenTiers), "utf-8");
      const enc = encryptBuffer(pt, dbKey, aad);
      updateData.encrypted_token_tiers = enc.ciphertext;
      updateData.token_tiers_iv = enc.iv;
      updateData.token_tiers_tag = enc.tag;
      pt.fill(0);
    }

    if (params.maxCostPerRequest !== undefined) {
      const aad = buildFieldAad("settings", targetId, "max_cost_per_request", version);
      const pt = Buffer.from(params.maxCostPerRequest.toString(), "utf-8");
      const enc = encryptBuffer(pt, dbKey, aad);
      updateData.encrypted_max_cost_per_request = enc.ciphertext;
      updateData.max_cost_per_request_iv = enc.iv;
      updateData.max_cost_per_request_tag = enc.tag;
      pt.fill(0);
    }
  });

  if (Object.keys(updateData).length > 0) {
    await upsertSettingsRecord(updateData);
  }

  return getSettings(sessionToken);
}
