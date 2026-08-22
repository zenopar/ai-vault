import crypto from "node:crypto";
import { 
  deriveSubKey, 
  encryptBuffer,
  decryptBuffer,
  sessionTokenToKey,
  AAD_WRAPPED_VAULT_KEY_SESSION,
  HKDF_INFO_DB, 
  HKDF_INFO_FILES, 
  HKDF_INFO_SECRETS,
  EncryptedData 
} from "./crypto.js";

export class VaultLockedError extends Error {
  constructor(message = "Vault is locked. Unlock the vault first.") {
    super(message);
    this.name = "VaultLockedError";
  }
}

/**
 * In-memory active session holding the master vault key encrypted by the session token.
 * Plaintext master key does NOT exist at rest in memory.
 */
export interface VaultSession {
  expiresAt: Date;
  wrappedVaultKey: EncryptedData;
}

/**
 * In-memory vault runtime state.
 * Plaintext keys are never stored here; only session-encrypted vault keys are maintained in RAM.
 */
export interface VaultRuntimeMemory {
  unlockedAt: Date | null;
  lastActivityAt: Date | null;
  // Map of SHA-256 session token hashes to encrypted vault keys
  sessions: Map<string, VaultSession>;
}

class VaultStateManager {
  private state: VaultRuntimeMemory = {
    unlockedAt: null,
    lastActivityAt: null,
    sessions: new Map(),
  };

  private cleanupExpiredSessions(): number {
    const now = new Date();
    for (const [tokenHash, session] of this.state.sessions.entries()) {
      if (now > session.expiresAt) {
        this.state.sessions.delete(tokenHash);
      }
    }
    if (this.state.sessions.size === 0) {
      this.state.unlockedAt = null;
    }
    return this.state.sessions.size;
  }

  public isUnlocked(): boolean {
    return this.cleanupExpiredSessions() > 0;
  }

  public getUnlockedAt(): Date | null {
    return this.state.unlockedAt;
  }

  public getLastActivityAt(): Date | null {
    return this.state.lastActivityAt;
  }

  public getSessionCount(): number {
    return this.cleanupExpiredSessions();
  }

  public touch(): void {
    if (this.isUnlocked()) {
      this.state.lastActivityAt = new Date();
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Creates a new session by encrypting the plaintext master vault key with a key
   * derived from a freshly generated session token.
   * 
   * Note: The caller must immediately overwrite/zeroize their plaintext vaultKey buffer.
   */
  public createSession(vaultKey: Buffer, options?: { expiresInMs?: number; wipeSourceKey?: boolean }): string {
    if (!vaultKey || vaultKey.length !== 32) {
      throw new Error("Invalid vault key length for session encryption.");
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(token);
    
    // Default 24 hours expiry
    const expiryMs = options?.expiresInMs ?? 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + expiryMs);

    // Derive wrapping key from session token
    const sessionWrappingKey = sessionTokenToKey(token);
    let wrappedVaultKey: EncryptedData;

    try {
      wrappedVaultKey = encryptBuffer(vaultKey, sessionWrappingKey, AAD_WRAPPED_VAULT_KEY_SESSION);
    } finally {
      // Overwrite temporary wrapping key
      sessionWrappingKey.fill(0);
      // Defense-in-depth: wipe source vaultKey buffer directly if requested (default true)
      if (options?.wipeSourceKey !== false) {
        vaultKey.fill(0);
      }
    }

    this.state.sessions.set(tokenHash, {
      expiresAt,
      wrappedVaultKey,
    });

    const now = new Date();
    if (!this.state.unlockedAt) {
      this.state.unlockedAt = now;
    }
    this.state.lastActivityAt = now;

    return token;
  }

  /**
   * Helper to set unlocked state with a vault key, creating an initial session.
   */
  public setUnlocked(vaultKey: Buffer): string {
    return this.createSession(vaultKey);
  }

  public verifySession(token: string): boolean {
    if (!token) return false;
    const tokenHash = this.hashToken(token);
    const session = this.state.sessions.get(tokenHash);

    if (!session) {
      return false;
    }

    if (new Date() > session.expiresAt) {
      this.state.sessions.delete(tokenHash);
      if (this.state.sessions.size === 0) {
        this.state.unlockedAt = null;
      }
      return false;
    }

    return true;
  }

  public destroySession(token: string): boolean {
    if (!token) return false;
    const tokenHash = this.hashToken(token);
    const existed = this.state.sessions.delete(tokenHash);
    if (this.state.sessions.size === 0) {
      this.state.unlockedAt = null;
    }
    return existed;
  }

  public lock(): void {
    this.state.sessions.clear();
    this.state.unlockedAt = null;
    this.state.lastActivityAt = null;
  }

  /**
   * Transiently decrypts the master vault key using the provided session token,
   * passes it to the callback, and strictly wipes the decrypted key buffer immediately upon completion.
   */
  public async withVaultKey<T>(
    sessionToken: string,
    callback: (vaultKey: Buffer) => T | Promise<T>
  ): Promise<T> {
    if (!sessionToken) {
      throw new VaultLockedError("Session token is required.");
    }

    const tokenHash = this.hashToken(sessionToken);
    const session = this.state.sessions.get(tokenHash);

    if (!session) {
      throw new VaultLockedError("Vault is locked or session does not exist.");
    }

    if (new Date() > session.expiresAt) {
      this.state.sessions.delete(tokenHash);
      if (this.state.sessions.size === 0) {
        this.state.unlockedAt = null;
      }
      throw new VaultLockedError("Session has expired. Please unlock the vault again.");
    }

    const sessionWrappingKey = sessionTokenToKey(sessionToken);
    let decryptedVaultKey: Buffer | null = null;

    try {
      decryptedVaultKey = decryptBuffer(session.wrappedVaultKey, sessionWrappingKey, AAD_WRAPPED_VAULT_KEY_SESSION);
    } finally {
      sessionWrappingKey.fill(0);
    }

    try {
      this.state.lastActivityAt = new Date();
      return await callback(decryptedVaultKey);
    } finally {
      // Guarantee immediate zeroization of decrypted master key
      if (decryptedVaultKey) {
        decryptedVaultKey.fill(0);
      }
    }
  }

  /**
   * Transiently derives the database encryption sub-key (HKDF_INFO_DB),
   * executes the callback, and strictly wipes both the dbKey and vaultKey buffers immediately.
   */
  public async withDbKey<T>(
    sessionToken: string,
    callback: (dbKey: Buffer) => T | Promise<T>
  ): Promise<T> {
    return this.withVaultKey(sessionToken, async (vaultKey) => {
      const dbKey = deriveSubKey(vaultKey, HKDF_INFO_DB);
      try {
        return await callback(dbKey);
      } finally {
        dbKey.fill(0);
      }
    });
  }

  /**
   * Transiently derives the secrets encryption sub-key (HKDF_INFO_SECRETS),
   * executes the callback, and strictly wipes both the secretsKey and vaultKey buffers immediately.
   */
  public async withSecretsKey<T>(
    sessionToken: string,
    callback: (secretsKey: Buffer) => T | Promise<T>
  ): Promise<T> {
    return this.withVaultKey(sessionToken, async (vaultKey) => {
      const secretsKey = deriveSubKey(vaultKey, HKDF_INFO_SECRETS);
      try {
        return await callback(secretsKey);
      } finally {
        secretsKey.fill(0);
      }
    });
  }

  /**
   * Transiently derives the files encryption sub-key (HKDF_INFO_FILES),
   * executes the callback, and strictly wipes both the fileMasterKey and vaultKey buffers immediately.
   */
  public async withFileMasterKey<T>(
    sessionToken: string,
    callback: (fileMasterKey: Buffer) => T | Promise<T>
  ): Promise<T> {
    return this.withVaultKey(sessionToken, async (vaultKey) => {
      const fileMasterKey = deriveSubKey(vaultKey, HKDF_INFO_FILES);
      try {
        return await callback(fileMasterKey);
      } finally {
        fileMasterKey.fill(0);
      }
    });
  }
}

export const vaultState = new VaultStateManager();
