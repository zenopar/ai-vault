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

export const DEFAULT_INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

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
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  inactivityTimeoutMs: number;
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

  private autoLockTimer: NodeJS.Timeout | null = null;

  private clearAutoLockTimer(): void {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
  }

  private scheduleAutoLockCheck(): void {
    this.clearAutoLockTimer();
    if (this.state.sessions.size === 0) return;

    const now = Date.now();
    let earliestDeadline = Infinity;

    for (const session of this.state.sessions.values()) {
      const inactivityDeadline = session.lastActivityAt.getTime() + session.inactivityTimeoutMs;
      const expiryDeadline = session.expiresAt.getTime();
      const deadline = Math.min(inactivityDeadline, expiryDeadline);
      if (deadline < earliestDeadline) {
        earliestDeadline = deadline;
      }
    }

    if (earliestDeadline === Infinity) return;

    const delay = Math.max(0, earliestDeadline - now);
    const clampedDelay = Math.min(delay, 2147483647);

    this.autoLockTimer = setTimeout(() => {
      this.cleanupExpiredSessions();
      this.scheduleAutoLockCheck();
    }, clampedDelay);

    if (typeof this.autoLockTimer.unref === "function") {
      this.autoLockTimer.unref();
    }
  }

  private cleanupExpiredSessions(): number {
    const now = Date.now();
    for (const [tokenHash, session] of this.state.sessions.entries()) {
      const isInactive = now - session.lastActivityAt.getTime() > session.inactivityTimeoutMs;
      const isExpired = now > session.expiresAt.getTime();
      if (isInactive || isExpired) {
        this.state.sessions.delete(tokenHash);
      }
    }
    if (this.state.sessions.size === 0) {
      this.state.unlockedAt = null;
      this.state.lastActivityAt = null;
      this.clearAutoLockTimer();
    }
    return this.state.sessions.size;
  }

  public isUnlocked(): boolean {
    return this.cleanupExpiredSessions() > 0;
  }

  public getUnlockedAt(): Date | null {
    if (this.cleanupExpiredSessions() === 0) return null;
    return this.state.unlockedAt;
  }

  public getLastActivityAt(): Date | null {
    if (this.cleanupExpiredSessions() === 0) return null;
    return this.state.lastActivityAt;
  }

  public getInactivityTimeoutMs(): number {
    return DEFAULT_INACTIVITY_TIMEOUT_MS;
  }

  public getSessionCount(): number {
    return this.cleanupExpiredSessions();
  }

  public touch(token?: string): void {
    if (this.cleanupExpiredSessions() === 0) return;
    const now = new Date();
    if (token) {
      const tokenHash = this.hashToken(token);
      const session = this.state.sessions.get(tokenHash);
      if (session) {
        session.lastActivityAt = now;
      }
    }
    this.state.lastActivityAt = now;
    this.scheduleAutoLockCheck();
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
  public createSession(
    vaultKey: Buffer,
    options?: { expiresInMs?: number; inactivityTimeoutMs?: number; wipeSourceKey?: boolean }
  ): string {
    if (!vaultKey || vaultKey.length !== 32) {
      throw new Error("Invalid vault key length for session encryption.");
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(token);
    
    // Default 24 hours absolute expiry, 1 hour inactivity timeout
    const expiryMs = options?.expiresInMs ?? 24 * 60 * 60 * 1000;
    const inactivityTimeoutMs = options?.inactivityTimeoutMs ?? DEFAULT_INACTIVITY_TIMEOUT_MS;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiryMs);

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
      createdAt: now,
      lastActivityAt: now,
      expiresAt,
      inactivityTimeoutMs,
      wrappedVaultKey,
    });

    if (!this.state.unlockedAt) {
      this.state.unlockedAt = now;
    }
    this.state.lastActivityAt = now;
    this.scheduleAutoLockCheck();

    return token;
  }

  /**
   * Helper to set unlocked state with a vault key, creating an initial session.
   */
  public setUnlocked(vaultKey: Buffer, options?: { expiresInMs?: number; inactivityTimeoutMs?: number }): string {
    return this.createSession(vaultKey, options);
  }

  public verifySession(token: string, options?: { touch?: boolean }): boolean {
    if (!token) return false;
    const tokenHash = this.hashToken(token);
    const session = this.state.sessions.get(tokenHash);

    if (!session) {
      return false;
    }

    const now = Date.now();
    const isInactive = now - session.lastActivityAt.getTime() > session.inactivityTimeoutMs;
    const isExpired = now > session.expiresAt.getTime();

    if (isInactive || isExpired) {
      this.state.sessions.delete(tokenHash);
      if (this.state.sessions.size === 0) {
        this.state.unlockedAt = null;
        this.state.lastActivityAt = null;
        this.clearAutoLockTimer();
      }
      return false;
    }

    if (options?.touch !== false) {
      const nowDate = new Date();
      session.lastActivityAt = nowDate;
      this.state.lastActivityAt = nowDate;
      this.scheduleAutoLockCheck();
    }

    return true;
  }

  public destroySession(token: string): boolean {
    if (!token) return false;
    const tokenHash = this.hashToken(token);
    const existed = this.state.sessions.delete(tokenHash);
    if (this.state.sessions.size === 0) {
      this.state.unlockedAt = null;
      this.state.lastActivityAt = null;
      this.clearAutoLockTimer();
    } else {
      this.scheduleAutoLockCheck();
    }
    return existed;
  }

  public lock(): void {
    this.clearAutoLockTimer();
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

    const now = Date.now();
    const isInactive = now - session.lastActivityAt.getTime() > session.inactivityTimeoutMs;
    const isExpired = now > session.expiresAt.getTime();

    if (isInactive || isExpired) {
      this.state.sessions.delete(tokenHash);
      if (this.state.sessions.size === 0) {
        this.state.unlockedAt = null;
        this.state.lastActivityAt = null;
        this.clearAutoLockTimer();
      }
      throw new VaultLockedError(
        isInactive
          ? "Vault locked due to 1 hour of inactivity. Please unlock the vault again."
          : "Session has expired. Please unlock the vault again."
      );
    }

    const sessionWrappingKey = sessionTokenToKey(sessionToken);
    let decryptedVaultKey: Buffer | null = null;

    try {
      decryptedVaultKey = decryptBuffer(session.wrappedVaultKey, sessionWrappingKey, AAD_WRAPPED_VAULT_KEY_SESSION);
    } finally {
      sessionWrappingKey.fill(0);
    }

    try {
      const nowDate = new Date();
      session.lastActivityAt = nowDate;
      this.state.lastActivityAt = nowDate;
      this.scheduleAutoLockCheck();

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
