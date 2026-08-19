import { getVaultConfig } from "../db/repository/vault.repository.js";
import { vaultState } from "./state.js";

import { VaultOverallStatus } from "@ai-vault/types";

export interface VaultKdfParams {
  algorithm: string;
  memoryCost: number;
  timeCost: number;
  parallelism: number;
  salt: string;
  recoverySalt: string;
}

export interface VaultStatusResult {
  status: VaultOverallStatus;
  isUnlocked: boolean;
  version?: number;
  kdfParams?: VaultKdfParams;
  unlockedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Checks the database and in-memory runtime to determine current vault status.
 */
export async function getVaultStatus(): Promise<VaultStatusResult> {
  try {
    const config = await getVaultConfig();

    // If no vault_config row is present in the database, the vault is uninitialized
    if (!config) {
      return {
        status: "UNINITIALIZED",
        isUnlocked: false,
      };
    }

    const isUnlocked = vaultState.isUnlocked();

    return {
      status: isUnlocked ? "UNLOCKED" : "LOCKED",
      isUnlocked,
      version: config.version,
      kdfParams: {
        algorithm: config.kdf_algorithm,
        memoryCost: config.kdf_memory_cost,
        timeCost: config.kdf_time_cost,
        parallelism: config.kdf_parallelism,
        salt: config.kdf_salt,
        recoverySalt: config.recovery_kdf_salt,
      },
      unlockedAt: vaultState.getUnlockedAt()?.toISOString() ?? null,
      createdAt: config.created_at.toISOString(),
      updatedAt: config.updated_at.toISOString(),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to query vault status from database: ${message}`);
  }
}
