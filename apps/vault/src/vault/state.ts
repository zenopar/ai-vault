import crypto from "node:crypto";
import { 
  deriveSubKey, 
  HKDF_INFO_DB, 
  HKDF_INFO_FILES, 
  HKDF_INFO_SECRETS 
} from "./crypto.js";

/**
 * In-memory vault runtime state.
 * Plaintext derived keys and active session contexts exist only in memory here.
 */
export interface VaultRuntimeMemory {
  isUnlocked: boolean;
  unlockedAt: Date | null;
  lastActivityAt: Date | null;
  // Master vault key buffer when unlocked (null when locked)
  vaultKey: Buffer | null;
  // Domain separated HKDF sub-keys
  dbKey: Buffer | null;
  fileMasterKey: Buffer | null;
  secretsKey: Buffer | null;
  // Map of session hashes to expiry dates
  sessions: Map<string, { expiresAt: Date }>;
}

class VaultStateManager {
  private state: VaultRuntimeMemory = {
    isUnlocked: false,
    unlockedAt: null,
    lastActivityAt: null,
    vaultKey: null,
    dbKey: null,
    fileMasterKey: null,
    secretsKey: null,
    sessions: new Map(),
  };

  public isUnlocked(): boolean {
    return this.state.isUnlocked && this.state.vaultKey !== null;
  }

  public getVaultKey(): Buffer | null {
    if (!this.state.isUnlocked || !this.state.vaultKey) {
      return null;
    }
    return this.state.vaultKey;
  }

  public getDbKey(): Buffer | null {
    if (!this.state.isUnlocked || !this.state.dbKey) {
      return null;
    }
    return this.state.dbKey;
  }

  public getFileMasterKey(): Buffer | null {
    if (!this.state.isUnlocked || !this.state.fileMasterKey) {
      return null;
    }
    return this.state.fileMasterKey;
  }

  public getSecretsKey(): Buffer | null {
    if (!this.state.isUnlocked || !this.state.secretsKey) {
      return null;
    }
    return this.state.secretsKey;
  }

  public getUnlockedAt(): Date | null {
    return this.state.unlockedAt;
  }

  public getLastActivityAt(): Date | null {
    return this.state.lastActivityAt;
  }

  public setUnlocked(vaultKey: Buffer): void {
    const now = new Date();
    this.state.isUnlocked = true;
    this.state.unlockedAt = now;
    this.state.lastActivityAt = now;
    this.state.vaultKey = vaultKey;
    
    // Derive domain-separated HKDF keys
    this.state.dbKey = deriveSubKey(vaultKey, HKDF_INFO_DB);
    this.state.fileMasterKey = deriveSubKey(vaultKey, HKDF_INFO_FILES);
    this.state.secretsKey = deriveSubKey(vaultKey, HKDF_INFO_SECRETS);
  }

  public lock(): void {
    if (this.state.vaultKey) {
      // Securely overwrite buffers before releasing reference
      this.state.vaultKey.fill(0);
    }
    if (this.state.dbKey) {
      this.state.dbKey.fill(0);
    }
    if (this.state.fileMasterKey) {
      this.state.fileMasterKey.fill(0);
    }
    if (this.state.secretsKey) {
      this.state.secretsKey.fill(0);
    }

    this.state.isUnlocked = false;
    this.state.unlockedAt = null;
    this.state.lastActivityAt = null;
    this.state.vaultKey = null;
    this.state.dbKey = null;
    this.state.fileMasterKey = null;
    this.state.secretsKey = null;
    this.state.sessions.clear();
  }

  public touch(): void {
    if (this.state.isUnlocked) {
      this.state.lastActivityAt = new Date();
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  public createSession(): string {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(token);
    
    // 24 hours expiry
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    this.state.sessions.set(tokenHash, { expiresAt });
    return token;
  }

  public verifySession(token: string): boolean {
    const tokenHash = this.hashToken(token);
    const session = this.state.sessions.get(tokenHash);

    if (!session) {
      return false;
    }

    if (new Date() > session.expiresAt) {
      this.state.sessions.delete(tokenHash);
      return false;
    }

    return true;
  }
}

export const vaultState = new VaultStateManager();
