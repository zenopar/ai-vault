import { getPrismaClient } from "../client.js";

/**
 * Retrieves the single vault configuration from the database.
 * Returns null if the vault has not been initialized yet.
 */
export async function getVaultConfig() {
  const prisma = getPrismaClient();
  return prisma.vault_config.findFirst();
}
