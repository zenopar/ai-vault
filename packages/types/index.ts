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

export interface AiModelMetadata {
  id: string;
  provider: string;
  name: string;
  displayName: string;
  description?: string | null;
  contextWindow?: number | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListModelsResponse {
  success: boolean;
  models?: AiModelMetadata[];
  error?: string;
}

export interface AiApiKeyMetadata {
  id: string;
  provider: string;
  name: string;
  isActive: boolean;
  models?: AiModelMetadata[];
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

export interface ChatMetadata {
  id: string;
  title: string;
  status: string;
  metadata?: Record<string, any> | null;
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  inputCost?: number;
  outputCost?: number;
  totalCost?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChatRequest {
  title?: string;
  metadata?: Record<string, any>;
  sessionToken?: string;
}

export interface CreateChatResponse {
  success: boolean;
  chat?: ChatMetadata;
  error?: string;
}

export interface ListChatsResponse {
  success: boolean;
  chats?: ChatMetadata[];
  error?: string;
}

export interface ChatMessageDto {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  sequenceNumber: number;
  modelId?: string;
  modelName?: string;
  thinkingLevel?: string;
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  inputCost?: number;
  outputCost?: number;
  thoughtCost?: number;
  totalCost?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SendChatMessageRequest {
  chatId?: string;
  message: string;
  provider?: string;
  model?: string;
  sessionToken?: string;
}

export interface SendChatMessageResponse {
  success: boolean;
  chat: ChatMetadata;
  userMessage: ChatMessageDto;
  assistantMessage: ChatMessageDto;
  error?: string;
}

export interface GetChatMessagesResponse {
  success: boolean;
  chat?: ChatMetadata;
  messages?: ChatMessageDto[];
  error?: string;
}

