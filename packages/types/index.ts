export type VaultOverallStatus = "UNINITIALIZED" | "LOCKED" | "UNLOCKED";

export interface VaultStatusResponse {
  status: VaultOverallStatus;
  isUnlocked: boolean;
  version?: number;
  error?: string;
}

export interface VaultInitResponse {
  success: boolean;
  recoveryPassword?: string;
  error?: string;
}

export interface VaultUnlockResponse {
  success: boolean;
  error?: string;
}
