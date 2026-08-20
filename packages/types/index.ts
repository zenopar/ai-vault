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
  sessionToken?: string;
  error?: string;
}

export interface VaultUnlockResponse {
  success: boolean;
  error?: string;
  sessionToken?: string;
}

export interface AiApiKeyMetadata {
  id: string;
  provider: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddApiKeyRequest {
  provider: string;
  name: string;
  apiKey: string;
}

export interface AddApiKeyResponse {
  success: boolean;
  key?: AiApiKeyMetadata;
  error?: string;
}

export interface ListApiKeysResponse {
  success: boolean;
  keys?: AiApiKeyMetadata[];
  error?: string;
}
