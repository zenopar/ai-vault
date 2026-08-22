import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vaultState, VaultLockedError, DEFAULT_INACTIVITY_TIMEOUT_MS } from "../src/vault/state.js";

describe("VaultStateManager Auto-Lock & Inactivity Management", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vaultState.lock();
  });

  afterEach(() => {
    vaultState.lock();
    vi.useRealTimers();
  });

  it("should have a default inactivity timeout of 1 hour (3600000 ms)", () => {
    expect(DEFAULT_INACTIVITY_TIMEOUT_MS).toBe(60 * 60 * 1000);
    expect(vaultState.getInactivityTimeoutMs()).toBe(3600000);
  });

  it("should start locked with null timestamps", () => {
    expect(vaultState.isUnlocked()).toBe(false);
    expect(vaultState.getUnlockedAt()).toBeNull();
    expect(vaultState.getLastActivityAt()).toBeNull();
    expect(vaultState.getSessionCount()).toBe(0);
  });

  it("should unlock and automatically lock after 1 hour of inactivity", () => {
    const rawKey = Buffer.alloc(32, 0x11);
    const token = vaultState.createSession(rawKey);

    expect(vaultState.isUnlocked()).toBe(true);
    expect(vaultState.getUnlockedAt()).not.toBeNull();
    expect(vaultState.getLastActivityAt()).not.toBeNull();
    expect(vaultState.verifySession(token)).toBe(true);

    // Fast-forward 59 minutes (activity still valid)
    vi.advanceTimersByTime(59 * 60 * 1000);
    expect(vaultState.isUnlocked()).toBe(true);
    expect(vaultState.verifySession(token, { touch: false })).toBe(true);

    // Fast-forward 2 more minutes (total 61 minutes of inactivity)
    vi.advanceTimersByTime(2 * 60 * 1000);

    // Vault should now be auto-locked due to inactivity
    expect(vaultState.isUnlocked()).toBe(false);
    expect(vaultState.verifySession(token)).toBe(false);
    expect(vaultState.getUnlockedAt()).toBeNull();
    expect(vaultState.getLastActivityAt()).toBeNull();
  });

  it("should reset inactivity timeout when touch() or active operations occur", async () => {
    const rawKey = Buffer.alloc(32, 0x22);
    const token = vaultState.createSession(rawKey);

    // Advance 45 minutes
    vi.advanceTimersByTime(45 * 60 * 1000);
    expect(vaultState.isUnlocked()).toBe(true);

    // Touch the session / vault
    vaultState.touch(token);

    // Advance another 45 minutes (90 minutes total elapsed, but only 45m since touch)
    vi.advanceTimersByTime(45 * 60 * 1000);
    expect(vaultState.isUnlocked()).toBe(true);
    expect(vaultState.verifySession(token, { touch: false })).toBe(true);

    // Perform an active operation via withVaultKey
    await vaultState.withVaultKey(token, (key) => {
      expect(key.length).toBe(32);
    });

    // Advance another 45 minutes (only 45m since withVaultKey)
    vi.advanceTimersByTime(45 * 60 * 1000);
    expect(vaultState.isUnlocked()).toBe(true);

    // Now let 61 minutes pass without any activity
    vi.advanceTimersByTime(61 * 60 * 1000);
    expect(vaultState.isUnlocked()).toBe(false);
    await expect(vaultState.withVaultKey(token, () => {})).rejects.toThrow(VaultLockedError);
  });

  it("should support custom inactivity timeouts for specific sessions or tests", async () => {
    const rawKey = Buffer.alloc(32, 0x33);
    // 5 seconds inactivity timeout
    const token = vaultState.createSession(rawKey, { inactivityTimeoutMs: 5000 });

    expect(vaultState.isUnlocked()).toBe(true);

    // Advance 4 seconds
    vi.advanceTimersByTime(4000);
    expect(vaultState.verifySession(token, { touch: false })).toBe(true);

    // Advance 2 more seconds (6s total)
    vi.advanceTimersByTime(2000);
    expect(vaultState.isUnlocked()).toBe(false);
    expect(vaultState.verifySession(token)).toBe(false);
  });

  it("should track inactivity independently for multiple sessions", async () => {
    const rawKey1 = Buffer.alloc(32, 0x44);
    const token1 = vaultState.createSession(rawKey1);

    // Advance 30 minutes
    vi.advanceTimersByTime(30 * 60 * 1000);

    // Create session 2
    const rawKey2 = Buffer.alloc(32, 0x44);
    const token2 = vaultState.createSession(rawKey2);

    expect(vaultState.getSessionCount()).toBe(2);

    // Advance 35 minutes (session 1 is now inactive for 65m; session 2 is inactive for 35m)
    vi.advanceTimersByTime(35 * 60 * 1000);

    expect(vaultState.verifySession(token1)).toBe(false);
    expect(vaultState.verifySession(token2, { touch: false })).toBe(true);
    expect(vaultState.getSessionCount()).toBe(1);
    expect(vaultState.isUnlocked()).toBe(true);

    // Advance another 30 minutes (session 2 is now inactive for 65m)
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(vaultState.verifySession(token2)).toBe(false);
    expect(vaultState.getSessionCount()).toBe(0);
    expect(vaultState.isUnlocked()).toBe(false);
  });

  it("lock() should immediately clear all sessions and reset timestamps", () => {
    const rawKey = Buffer.alloc(32, 0x55);
    const token = vaultState.createSession(rawKey);

    expect(vaultState.isUnlocked()).toBe(true);
    vaultState.lock();

    expect(vaultState.isUnlocked()).toBe(false);
    expect(vaultState.getUnlockedAt()).toBeNull();
    expect(vaultState.getLastActivityAt()).toBeNull();
    expect(vaultState.verifySession(token)).toBe(false);
  });
});
