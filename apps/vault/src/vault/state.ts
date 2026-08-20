import crypto from "node:crypto";

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
  // Map of session hashes to expiry dates
  sessions: Map<string, { expiresAt: Date }>;
}

class VaultStateManager {
  private state: VaultRuntimeMemory = {
    isUnlocked: false,
    unlockedAt: null,
    lastActivityAt: null,
    vaultKey: null,
    sessions: new Map(),
  };

  public isUnlocked(): boolean {
    return this.state.isUnlocked && this.state.vaultKey !== null;
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
  }

  public lock(): void {
    if (this.state.vaultKey) {
      // Securely overwrite buffer before releasing reference
      this.state.vaultKey.fill(0);
    }
    this.state.isUnlocked = false;
    this.state.unlockedAt = null;
    this.state.lastActivityAt = null;
    this.state.vaultKey = null;
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
