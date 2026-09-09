"use server";

import { withSafeAction, type ActionResult } from "@/shared/lib/safe-action";
import { getAnalyticsService, type GetAnalyticsParams } from "../services/analytics.service";
import type { AnalyticsSummaryResponse } from "@ai-vault/types";

export type FetchAnalyticsActionResult = ActionResult<AnalyticsSummaryResponse>;

export const fetchAnalyticsAction = withSafeAction(
  "fetchAnalyticsAction",
  async (params: GetAnalyticsParams = {}) => getAnalyticsService(params)
);
