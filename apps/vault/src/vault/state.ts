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
}

class VaultStateManager {
  private state: VaultRuntimeMemory = {
    isUnlocked: false,
    unlockedAt: null,
    lastActivityAt: null,
    vaultKey: null,
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
  }

  public touch(): void {
    if (this.state.isUnlocked) {
      this.state.lastActivityAt = new Date();
    }
  }
}

export const vaultState = new VaultStateManager();
