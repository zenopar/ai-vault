import { redirect } from "next/navigation";
import { verifySession } from "@/shared/lib/session";
import { getVaultStatus } from "@/features/vault/services/vault-status.service";
import { getAnalyticsService } from "@/features/analytics/services/analytics.service";
import { AnalyticsDashboard } from "@/features/analytics/components/analytics-dashboard";
import { AutoLockGuard } from "@/features/vault/components/auto-lock-guard";
import type { AnalyticsSummaryResponse } from "@ai-vault/types";

export const dynamic = "force-dynamic";

interface AnalyticsPageProps {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const isValidSession = await verifySession();
  if (!isValidSession) {
    redirect("/");
  }

  const status = await getVaultStatus();
  if (status.status !== "UNLOCKED") {
    redirect("/");
  }

  const resolvedParams = await searchParams;
  let analyticsData: AnalyticsSummaryResponse;

  try {
    analyticsData = await getAnalyticsService({
      period: resolvedParams?.period || "all",
      from: resolvedParams?.from,
      to: resolvedParams?.to,
    });
  } catch (err) {
    console.error("[AnalyticsPage] Error loading analytics data:", err);
    // Fallback safe zero response in case of transient error
    analyticsData = {
      success: true,
      period: {
        preset: resolvedParams?.period || "all",
        from: resolvedParams?.from || null,
        to: resolvedParams?.to || null,
      },
      totals: {
        inputTokens: 0,
        outputTokens: 0,
        thoughtTokens: 0,
        totalTokens: 0,
        inputCost: 0,
        outputCost: 0,
        thoughtCost: 0,
        totalCost: 0,
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        systemMessages: 0,
        totalChats: 0,
        activeChats: 0,
      },
      models: {
        mostUsed: null,
        mostExpensive: null,
        breakdown: [],
      },
      topExpensiveChats: [],
      timeline: [],
    };
  }

  return (
    <AutoLockGuard>
      <div className="min-h-screen bg-[#0e0f12] text-neutral-100 flex flex-col">
        <AnalyticsDashboard initialData={analyticsData} />
      </div>
    </AutoLockGuard>
  );
}
