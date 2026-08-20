import { getVaultStatus } from "./status.js";
import { createVaultConfig } from "../db/repository/vault.repository.js";
import { 
  generateRandomSalt, 
  generateVaultKey, 
  generateRecoveryPassword, 
  deriveKey, 
  encryptBuffer, 
  DEFAULT_KDF_PARAMS,
  AAD_WRAPPED_VAULT_KEY_MASTER,
  AAD_WRAPPED_VAULT_KEY_RECOVERY
} from "./crypto.js";
import { vaultState } from "./state.js";
import { VaultInitResponse } from "@ai-vault/types";

export class VaultAlreadyInitializedError extends Error {
  constructor(message = "Vault is already initialized.") {
    super(message);
    this.name = "VaultAlreadyInitializedError";
  }
}

/**
 * Initializes a new vault configuration in the database and loads the master key into RAM.
 */
export async function initVault(masterPassword: string): Promise<VaultInitResponse> {
  const currentStatus = await getVaultStatus();
  if (currentStatus.status !== "UNINITIALIZED") {
    throw new VaultAlreadyInitializedError();
  }

  // Generate salts
  const kdfSalt = generateRandomSalt();
  const recoverySalt = generateRandomSalt();

  // Generate Master Vault Key (true key that encrypts data)
  const vaultKey = generateVaultKey();

  // Generate Recovery Password for the user
  const recoveryPassword = generateRecoveryPassword();

  // Derive Wrapping Keys using Argon2
  const wrappingKey = await deriveKey(masterPassword, kdfSalt, DEFAULT_KDF_PARAMS);
  const recoveryWrappingKey = await deriveKey(recoveryPassword, recoverySalt, DEFAULT_KDF_PARAMS);

  // Encrypt the Vault Key with explicit domain-separated AAD
  const wrappedVaultKey = encryptBuffer(vaultKey, wrappingKey, AAD_WRAPPED_VAULT_KEY_MASTER);
  const wrappedRecoveryKey = encryptBuffer(vaultKey, recoveryWrappingKey, AAD_WRAPPED_VAULT_KEY_RECOVERY);

  // Save everything to DB
  await createVaultConfig({
    kdf_algorithm: "argon2id",
    kdf_memory_cost: DEFAULT_KDF_PARAMS.memoryCost,
    kdf_time_cost: DEFAULT_KDF_PARAMS.timeCost,
    kdf_parallelism: DEFAULT_KDF_PARAMS.parallelism,
    kdf_salt: kdfSalt,
    wrapped_vault_key: wrappedVaultKey.ciphertext,
    wrapped_vault_key_iv: wrappedVaultKey.iv,
    wrapped_vault_key_tag: wrappedVaultKey.tag,
    recovery_kdf_salt: recoverySalt,
    wrapped_vault_key_recovery: wrappedRecoveryKey.ciphertext,
    wrapped_vault_key_recovery_iv: wrappedRecoveryKey.iv,
    wrapped_vault_key_recovery_tag: wrappedRecoveryKey.tag,
  });

  // Load into RAM immediately
  vaultState.setUnlocked(vaultKey);

  // Create session token and store hash in RAM
  const sessionToken = vaultState.createSession();

  return {
    success: true,
    recoveryPassword,
    sessionToken,
  };
}
