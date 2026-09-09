import { getPrismaClient } from "../client.js";
import { Prisma, vault_config } from "@prisma/client";
import { randomUUID } from "node:crypto";

/**
 * Retrieves the single vault configuration from the database.
 * Returns null if the vault has not been initialized yet.
 */
export async function getVaultConfig(): Promise<vault_config | null> {
  const prisma = getPrismaClient();
  return prisma.vault_config.findFirst();
}

/**
 * Creates the initial vault configuration.
 * Throws an error if a configuration already exists.
 */
export async function createVaultConfig(data: Prisma.vault_configCreateInput): Promise<vault_config> {
  const prisma = getPrismaClient();

  // Ensure no existing config
  const existing = await getVaultConfig();
  if (existing) {
    throw new Error("Vault is already initialized.");
  }

  return prisma.vault_config.create({
    data: {
      ...data,
      id: data.id || randomUUID(),
    },
  });
}
