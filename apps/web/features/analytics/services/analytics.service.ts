import "server-only";
import { VaultApiClient } from "@/shared/lib/vault-client";
import { getSessionToken } from "@/shared/lib/session";
import type { AnalyticsSummaryResponse, AnalyticsPeriodPreset } from "@ai-vault/types";

export interface GetAnalyticsParams {
  period?: AnalyticsPeriodPreset | string;
  from?: string;
  to?: string;
  topChatsLimit?: number;
}

export async function getAnalyticsService(params: GetAnalyticsParams = {}): Promise<AnalyticsSummaryResponse> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    throw new Error("No active session. Please unlock the vault.");
  }

  const searchParams = new URLSearchParams();
  if (params.period) searchParams.append("period", params.period);
  if (params.from) searchParams.append("from", params.from);
  if (params.to) searchParams.append("to", params.to);
  if (params.topChatsLimit !== undefined) searchParams.append("topChatsLimit", params.topChatsLimit.toString());

  const query = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const response = await VaultApiClient.sendGetRequest<AnalyticsSummaryResponse>(`/analytics${query}`, {
    sessionToken,
  });

  if (response.error) {
    throw new Error(response.errorDetails || response.error);
  }

  if (!response.data || !response.data.success) {
    throw new Error(response.data?.error || "Failed to retrieve analytics.");
  }

  return response.data;
}
