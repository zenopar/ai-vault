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
  AAD_WRAPPED_VAULT_KEY_RECOVERY,
  EncryptedData
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

  let vaultKey: Buffer | null = null;
  let initialized = false;

  try {
    // Generate salts
    const kdfSalt = generateRandomSalt();
    const recoverySalt = generateRandomSalt();

    // Generate Master Vault Key (true key that encrypts data)
    vaultKey = generateVaultKey();

    // Generate Recovery Password for the user
    const recoveryPassword = generateRecoveryPassword();

    let wrappingKey: Buffer | null = null;
    let recoveryWrappingKey: Buffer | null = null;
    let wrappedVaultKey: EncryptedData;
    let wrappedRecoveryKey: EncryptedData;

    try {
      // Derive Wrapping Keys using Argon2
      wrappingKey = await deriveKey(masterPassword, kdfSalt, DEFAULT_KDF_PARAMS);
      recoveryWrappingKey = await deriveKey(recoveryPassword, recoverySalt, DEFAULT_KDF_PARAMS);

      // Encrypt the Vault Key with explicit domain-separated AAD
      wrappedVaultKey = encryptBuffer(vaultKey, wrappingKey, AAD_WRAPPED_VAULT_KEY_MASTER);
      wrappedRecoveryKey = encryptBuffer(vaultKey, recoveryWrappingKey, AAD_WRAPPED_VAULT_KEY_RECOVERY);
    } finally {
      wrappingKey?.fill(0);
      recoveryWrappingKey?.fill(0);
    }

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
    initialized = true;

    // Create session token and store hash in RAM
    const sessionToken = vaultState.createSession();

    return {
      success: true,
      recoveryPassword,
      sessionToken,
    };
  } finally {
    if (!initialized && vaultKey) {
      vaultKey.fill(0);
    }
  }
}
