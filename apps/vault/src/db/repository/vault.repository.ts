import { getPrismaClient } from "../client.js";
import { randomUUID } from "node:crypto";

/**
 * Retrieves the single vault configuration from the database.
 * Returns null if the vault has not been initialized yet.
 */
export async function getVaultConfig() {
  const prisma = getPrismaClient();
  return prisma.vault_config.findFirst();
}

/**
 * Creates the initial vault configuration.
 * Throws an error if a configuration already exists.
 */
export async function createVaultConfig(data: {
  kdf_algorithm: string;
  kdf_memory_cost: number;
  kdf_time_cost: number;
  kdf_parallelism: number;
  kdf_salt: string;
  wrapped_vault_key: string;
  wrapped_vault_key_iv: string;
  wrapped_vault_key_tag: string;
  recovery_kdf_salt: string;
  wrapped_vault_key_recovery: string;
  wrapped_vault_key_recovery_iv: string;
  wrapped_vault_key_recovery_tag: string;
}) {
  const prisma = getPrismaClient();

  // Ensure no existing config
  const existing = await getVaultConfig();
  if (existing) {
    throw new Error("Vault is already initialized.");
  }

  return prisma.vault_config.create({
    data: {
      id: randomUUID(),
      ...data
    },
  });
}
