import { getVaultConfig } from "../db/repository/vault.repository.js";
import { 
  deriveKey, 
  decryptBuffer, 
  AAD_WRAPPED_VAULT_KEY_MASTER, 
  AAD_WRAPPED_VAULT_KEY_RECOVERY 
} from "./crypto.js";
import { vaultState } from "./state.js";
import { VaultUnlockResponse } from "@ai-vault/types";

export class VaultNotInitializedError extends Error {
  constructor(message = "Vault is not initialized.") {
    super(message);
    this.name = "VaultNotInitializedError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor(message = "Invalid password or recovery code.") {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

/**
 * Unlocks the vault using either the master password or recovery code,
 * loads the master key into RAM, and issues a session token.
 */
export async function unlockVault(password: string): Promise<VaultUnlockResponse> {
  const dbConfig = await getVaultConfig();
  if (!dbConfig) {
    throw new VaultNotInitializedError();
  }

  let vaultKey: Buffer | null = null;

  // 1. Try master password
  let wrappingKey: Buffer | null = null;
  try {
    wrappingKey = await deriveKey(password, dbConfig.kdf_salt, {
      memoryCost: dbConfig.kdf_memory_cost,
      timeCost: dbConfig.kdf_time_cost,
      parallelism: dbConfig.kdf_parallelism,
      hashLength: 32,
    });

    vaultKey = decryptBuffer(
      {
        ciphertext: dbConfig.wrapped_vault_key,
        iv: dbConfig.wrapped_vault_key_iv,
        tag: dbConfig.wrapped_vault_key_tag,
      },
      wrappingKey,
      AAD_WRAPPED_VAULT_KEY_MASTER
    );
  } catch (e) {
    // Master password decryption failed, fall through to recovery code
  } finally {
    wrappingKey?.fill(0);
  }

  // 2. If master password fails, try recovery code
  if (!vaultKey) {
    let recoveryWrappingKey: Buffer | null = null;
    try {
      recoveryWrappingKey = await deriveKey(password, dbConfig.recovery_kdf_salt, {
        memoryCost: dbConfig.kdf_memory_cost,
        timeCost: dbConfig.kdf_time_cost,
        parallelism: dbConfig.kdf_parallelism,
        hashLength: 32,
      });

      vaultKey = decryptBuffer(
        {
          ciphertext: dbConfig.wrapped_vault_key_recovery,
          iv: dbConfig.wrapped_vault_key_recovery_iv,
          tag: dbConfig.wrapped_vault_key_recovery_tag,
        },
        recoveryWrappingKey,
        AAD_WRAPPED_VAULT_KEY_RECOVERY
      );
    } catch (e) {
      // Recovery password decryption failed
    } finally {
      recoveryWrappingKey?.fill(0);
    }
  }

  if (!vaultKey) {
    throw new InvalidCredentialsError();
  }

  // Successfully unlocked, load into RAM
  vaultState.setUnlocked(vaultKey);

  // Create session token and store hash in RAM
  const sessionToken = vaultState.createSession();

  return {
    success: true,
    sessionToken,
  };
}
