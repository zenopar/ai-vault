"use server";

import { getAnalyticsService, type GetAnalyticsParams } from "../services/analytics.service";
import type { AnalyticsSummaryResponse } from "@ai-vault/types";

export type FetchAnalyticsActionResult = {
  success: boolean;
  data?: AnalyticsSummaryResponse;
  error?: string;
};

export async function fetchAnalyticsAction(params: GetAnalyticsParams = {}): Promise<FetchAnalyticsActionResult> {
  try {
    const data = await getAnalyticsService(params);
    return { success: true, data };
  } catch (err: unknown) {
    console.error("[fetchAnalyticsAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load analytics data.",
    };
  }
}
