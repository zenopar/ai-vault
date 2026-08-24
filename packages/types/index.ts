export type VaultOverallStatus = "UNINITIALIZED" | "LOCKED" | "UNLOCKED";

export interface VaultStatusResponse {
  status: VaultOverallStatus;
  isUnlocked: boolean;
  version?: number;
  unlockedAt?: string | null;
  lastActivityAt?: string | null;
  inactivityTimeoutMs?: number;
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
  thoughtCost?: number;
  totalCost?: number;
  createdAt: string;
  updatedAt: string;
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
  thinkingLevel?: "low" | "medium" | "high" | "none" | string;
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

// === ANALYTICS & STATS TYPES ===

export type AnalyticsPeriodPreset = "all" | "today" | "7d" | "30d" | "this_month" | "custom";

export interface AnalyticsPeriodDto {
  preset: AnalyticsPeriodPreset | string;
  from: string | null;
  to: string | null;
}

export interface AnalyticsTotalsDto {
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  thoughtCost: number;
  totalCost: number;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  systemMessages: number;
  totalChats: number;
  activeChats: number;
}

export interface ModelAnalyticsDto {
  modelName: string;
  provider?: string;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  thoughtCost: number;
  totalCost: number;
  percentageOfTotalCost: number;
  percentageOfTotalTokens: number;
}

export interface ChatCostSummaryDto {
  id: string;
  title: string;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  thoughtCost: number;
  totalCost: number;
  createdAt: string;
  updatedAt: string;
}

export interface DailyUsageDto {
  date: string;
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  thoughtCost: number;
  totalCost: number;
  userMessages: number;
  assistantMessages: number;
  totalMessages: number;
}

export interface AnalyticsSummaryResponse {
  success: boolean;
  period: AnalyticsPeriodDto;
  totals: AnalyticsTotalsDto;
  models: {
    mostUsed: string | null;
    mostExpensive: string | null;
    breakdown: ModelAnalyticsDto[];
  };
  topExpensiveChats: ChatCostSummaryDto[];
  timeline: DailyUsageDto[];
  error?: string;
}

// === SETTINGS TYPES ===

export interface TokenTierDto {
  max_cost: number;
  tokens: number;
}

export interface SettingsDto {
  id?: string;
  systemPrompt: string;
  tokenTiers: TokenTierDto[];
  maxCostPerRequest: number;
  titlePrompt?: string;
  titleApiKeyId?: string | null;
  titleModelId?: string | null;
}

export interface GetSettingsResponse {
  success: boolean;
  settings?: SettingsDto;
  error?: string;
}

export interface UpdateSettingsRequest {
  systemPrompt?: string;
  tokenTiers?: TokenTierDto[];
  maxCostPerRequest?: number;
  titlePrompt?: string;
  titleApiKeyId?: string | null;
  titleModelId?: string | null;
}

export interface UpdateSettingsResponse {
  success: boolean;
  settings?: SettingsDto;
  error?: string;
}
