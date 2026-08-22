"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import {
  AnalyticsSummaryResponse,
  AnalyticsPeriodPreset,
} from "@ai-vault/types";
import { fetchAnalyticsAction } from "../actions/analytics.action";
import { Badge, Button, Card } from "@/shared/components";
import { Download, Upload, Brain } from "lucide-react";

interface AnalyticsDashboardProps {
  initialData: AnalyticsSummaryResponse;
}

const PERIOD_PRESETS: { id: AnalyticsPeriodPreset; label: string }[] = [
  { id: "all", label: "All Time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "this_month", label: "This Month" },
  { id: "custom", label: "Custom Range" },
];

export function AnalyticsDashboard({ initialData }: AnalyticsDashboardProps) {
  const [data, setData] = useState<AnalyticsSummaryResponse>(initialData);
  const [selectedPreset, setSelectedPreset] = useState<string>(
    initialData.period.preset || "all"
  );
  const [customFrom, setCustomFrom] = useState<string>(
    initialData.period.from?.split("T")[0] || ""
  );
  const [customTo, setCustomTo] = useState<string>(
    initialData.period.to?.split("T")[0] || ""
  );
  const [timelineMetric, setTimelineMetric] = useState<"cost" | "tokens">("cost");
  const [timelineTooltip, setTimelineTooltip] = useState<{ x: number; y: number; day: any } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const chartCardRef = useRef<HTMLDivElement>(null);

  const loadData = (params: {
    period?: string;
    from?: string;
    to?: string;
  }) => {
    setError(null);
    startTransition(async () => {
      const res = await fetchAnalyticsAction(params);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || "Failed to fetch analytics");
      }
    });
  };

  const handleSelectPreset = (preset: AnalyticsPeriodPreset) => {
    setSelectedPreset(preset);
    if (preset !== "custom") {
      loadData({ period: preset });
    }
  };

  const handleApplyCustomRange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFrom) {
      setError("Please select a start date.");
      return;
    }
    loadData({
      period: "custom",
      from: customFrom ? new Date(customFrom).toISOString() : undefined,
      to: customTo
        ? new Date(`${customTo}T23:59:59.999Z`).toISOString()
        : undefined,
    });
  };

  const formatCurrency = (val: number) => {
    if (val === 0) return "$0.00";
    if (val < 0.0001) return `$${val.toFixed(6)}`;
    if (val < 0.01) return `$${val.toFixed(4)}`;
    return `$${val.toFixed(3)}`;
  };

  const formatNumber = (val: number) => {
    return val.toLocaleString();
  };

  const getProviderColor = (provider?: string, modelName?: string) => {
    const text = (provider || modelName || "").toLowerCase();
    if (text.includes("gemini") || text.includes("google")) {
      return {
        bg: "bg-blue-500/10 border-blue-500/20 text-blue-400",
        badge: "bg-blue-500/20 text-blue-300",
        bar: "from-blue-500 to-indigo-500",
      };
    }
    if (text.includes("claude") || text.includes("anthropic")) {
      return {
        bg: "bg-amber-500/10 border-amber-500/20 text-amber-400",
        badge: "bg-amber-500/20 text-amber-300",
        bar: "from-amber-500 to-orange-500",
      };
    }
    if (text.includes("openai") || text.includes("gpt") || text.includes("o3")) {
      return {
        bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
        badge: "bg-emerald-500/20 text-emerald-300",
        bar: "from-emerald-500 to-teal-500",
      };
    }
    if (text.includes("deepseek")) {
      return {
        bg: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
        badge: "bg-cyan-500/20 text-cyan-300",
        bar: "from-cyan-500 to-blue-500",
      };
    }
    return {
      bg: "bg-purple-500/10 border-purple-500/20 text-purple-400",
      badge: "bg-purple-500/20 text-purple-300",
      bar: "from-purple-500 to-pink-500",
    };
  };

  const totals = data.totals;
  const models = data.models;
  const topChats = data.topExpensiveChats;
  const timeline = data.timeline;

  // Max value in timeline for scaling bar chart
  const maxTimelineCost = Math.max(...timeline.map((t) => t.totalCost), 0.0001);
  const maxTimelineTokens = Math.max(...timeline.map((t) => t.totalTokens), 1);

  return (
    <div className="flex-1 flex flex-col w-full bg-[#0e0f12] bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(120,119,198,0.08),transparent)] text-neutral-100 min-h-screen">
      {/* Top Header Navigation */}
      <header className="w-full px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-neutral-400 bg-[#0e0f12]/60 backdrop-blur-md border-b border-white/[0.04] sticky top-0 z-30 select-none">
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.06] transition-all cursor-pointer"
          >
            <span>←</span>
            <span>app</span>
          </Link>
          <span className="text-neutral-700">/</span>
          <span className="text-neutral-200 font-sans font-medium">
            Analytics & Stats
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              loadData({
                period: selectedPreset !== "custom" ? selectedPreset : undefined,
                from:
                  selectedPreset === "custom" && customFrom
                    ? new Date(customFrom).toISOString()
                    : undefined,
                to:
                  selectedPreset === "custom" && customTo
                    ? new Date(`${customTo}T23:59:59.999Z`).toISOString()
                    : undefined,
              })
            }
            disabled={isPending}
            className="text-neutral-400 hover:text-white px-2.5 py-1 h-auto text-xs gap-1.5"
            title="Refresh analytics data"
          >
            <span className={isPending ? "animate-spin" : ""}>↻</span>
            <span>{isPending ? "updating..." : "refresh"}</span>
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8 animate-enter">
        {/* Filter Controls Bar */}
        <Card className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white flex items-center gap-2.5">
                <span>Usage & Cost Analytics</span>
              </h1>
              <p className="text-xs text-neutral-400 mt-1">
                Detailed breakdowns of input, output, thought tokens, costs, and models used.
              </p>
            </div>

            {/* Period Pills */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-black/40 border border-white/[0.06] rounded-xl self-start sm:self-auto">
              {PERIOD_PRESETS.map((p) => {
                const isActive = selectedPreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPreset(p.id)}
                    className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all cursor-pointer ${isActive
                        ? "bg-white/[0.12] text-white font-medium shadow-sm"
                        : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]"
                      }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Date Range Picker Accordion */}
          {selectedPreset === "custom" && (
            <form
              onSubmit={handleApplyCustomRange}
              className="pt-3 border-t border-white/[0.04] flex flex-wrap items-center gap-3 animate-enter"
            >
              <div className="flex items-center gap-2 text-xs text-neutral-300 font-mono">
                <span>From:</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/[0.1] text-white text-xs focus:outline-none focus:border-emerald-500/50"
                  required
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-neutral-300 font-mono">
                <span>To:</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/[0.1] text-white text-xs focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isPending}
                className="text-xs px-3 py-1.5 h-auto ml-auto sm:ml-0"
              >
                {isPending ? "Filtering..." : "Apply Range"}
              </Button>
            </form>
          )}

          {error && (
            <div className="p-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl">
              {error}
            </div>
          )}
        </Card>

        {/* 1. Hero Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Cost Card */}
          <Card className="relative overflow-hidden p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Total Cost
              </span>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">USD</span>
            </div>
            <div className="text-3xl font-bold tracking-tight text-white font-mono bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent">
              {formatCurrency(totals.totalCost)}
            </div>
            <div className="text-[11px] text-neutral-400 flex items-center justify-between pt-2 border-t border-white/[0.04]">
              <span>In: {formatCurrency(totals.inputCost)}</span>
              <span>Out: {formatCurrency(totals.outputCost)}</span>
              {totals.thoughtCost > 0 && (
                <span className="text-indigo-300">
                  Thought: {formatCurrency(totals.thoughtCost)}
                </span>
              )}
            </div>
          </Card>

          {/* Total Tokens Card */}
          <Card className="relative overflow-hidden p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                Total Tokens
              </span>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Usage</span>
            </div>
            <div className="text-3xl font-bold tracking-tight text-white font-mono">
              {formatNumber(totals.totalTokens)}
            </div>
            <div className="text-[11px] text-neutral-400 flex items-center justify-between pt-2 border-t border-white/[0.04]">
              <span>In: {formatNumber(totals.inputTokens)}</span>
              <span>Out: {formatNumber(totals.outputTokens)}</span>
              {totals.thoughtTokens > 0 && (
                <span className="text-indigo-300">
                  Th: {formatNumber(totals.thoughtTokens)}
                </span>
              )}
            </div>
          </Card>

          {/* Messages & Volume Card */}
          <Card className="relative overflow-hidden p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                Total Messages
              </span>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Volume</span>
            </div>
            <div className="text-3xl font-bold tracking-tight text-white font-mono">
              {formatNumber(totals.totalMessages)}
            </div>
            <div className="text-[11px] text-neutral-400 flex items-center justify-between pt-2 border-t border-white/[0.04]">
              <span>User: {formatNumber(totals.userMessages)}</span>
              <span>AI: {formatNumber(totals.assistantMessages)}</span>
              <span>Chats: {totals.activeChats}</span>
            </div>
          </Card>

          {/* Flagship Highlight Card */}
          <Card className="relative overflow-hidden p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                Top Models
              </span>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Rank</span>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-neutral-400">Most Used:</div>
              <div className="text-sm font-semibold text-neutral-200 truncate font-mono">
                {models.mostUsed || "None"}
              </div>
            </div>
            <div className="pt-2 border-t border-white/[0.04] space-y-1">
              <div className="text-[10px] text-neutral-500">Most Expensive:</div>
              <div className="text-xs text-amber-300 font-mono truncate">
                {models.mostExpensive || "None"}
              </div>
            </div>
          </Card>
        </div>

        {/* 2. Detailed Token & Reasoning Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Input Tokens */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-neutral-400" />
                <span className="text-sm font-medium text-neutral-200">Input Tokens</span>
              </div>
              <Badge variant="mono" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">
                {totals.totalTokens > 0
                  ? `${((totals.inputTokens / totals.totalTokens) * 100).toFixed(1)}%`
                  : "0%"}
              </Badge>
            </div>
            <div className="text-2xl font-bold font-mono text-white">
              {formatNumber(totals.inputTokens)}
            </div>
            <div className="text-xs text-neutral-400 flex items-center justify-between pt-2 border-t border-white/[0.04]">
              <span>Cost:</span>
              <span className="font-mono text-emerald-400">{formatCurrency(totals.inputCost)}</span>
            </div>
          </Card>

          {/* Output Tokens */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-neutral-400" />
                <span className="text-sm font-medium text-neutral-200">Output Tokens</span>
              </div>
              <Badge variant="mono" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                {totals.totalTokens > 0
                  ? `${((totals.outputTokens / totals.totalTokens) * 100).toFixed(1)}%`
                  : "0%"}
              </Badge>
            </div>
            <div className="text-2xl font-bold font-mono text-white">
              {formatNumber(totals.outputTokens)}
            </div>
            <div className="text-xs text-neutral-400 flex items-center justify-between pt-2 border-t border-white/[0.04]">
              <span>Cost:</span>
              <span className="font-mono text-emerald-400">{formatCurrency(totals.outputCost)}</span>
            </div>
          </Card>

          {/* Reasoning / Thought Tokens */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-medium text-indigo-200">Reasoning (Thought)</span>
              </div>
              <Badge variant="mono" className="text-[10px] bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
                {totals.totalTokens > 0
                  ? `${((totals.thoughtTokens / totals.totalTokens) * 100).toFixed(1)}%`
                  : "0%"}
              </Badge>
            </div>
            <div className="text-2xl font-bold font-mono text-indigo-300">
              {formatNumber(totals.thoughtTokens)}
            </div>
            <div className="text-xs text-neutral-400 flex items-center justify-between pt-2 border-t border-white/[0.04]">
              <span>Thought Cost:</span>
              <span className="font-mono text-indigo-300">{formatCurrency(totals.thoughtCost)}</span>
            </div>
          </Card>
        </div>

        {/* 3. Daily Activity Chart */}
        <Card ref={chartCardRef} className={`p-5 sm:p-6 space-y-5 relative transition-colors ${timelineTooltip ? "z-50" : "z-10"}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <span>Daily Activity Timeline</span>
                <span className="text-xs font-normal text-neutral-400 font-mono">
                  ({timeline.length} active day{timeline.length !== 1 ? "s" : ""})
                </span>
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Trends of daily spending and token consumption over time
              </p>
            </div>

            <div className="flex items-center gap-1.5 p-1 bg-black/40 border border-white/[0.06] rounded-xl self-start">
              <button
                onClick={() => setTimelineMetric("cost")}
                className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all ${timelineMetric === "cost"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium"
                    : "text-neutral-400 hover:text-white"
                  }`}
              >
                Cost ($)
              </button>
              <button
                onClick={() => setTimelineMetric("tokens")}
                className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all ${timelineMetric === "tokens"
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium"
                    : "text-neutral-400 hover:text-white"
                  }`}
              >
                Tokens
              </button>
            </div>
          </div>

          {timeline.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500 border border-dashed border-white/[0.06] rounded-xl">
              No daily activity recorded for this period.
            </div>
          ) : (
            <div className="space-y-3 relative" onMouseLeave={() => setTimelineTooltip(null)}>
              {/* Absolute Tooltip Overlay relative to Card */}
              {timelineTooltip && (
                <div 
                  className="absolute z-[999] flex flex-col gap-1 p-2.5 bg-[#16181d] border border-white/[0.1] rounded-xl text-[10px] font-mono text-neutral-200 shadow-2xl pointer-events-none transition-opacity duration-75"
                  style={{ 
                    left: timelineTooltip.x, 
                    top: timelineTooltip.y - 8, 
                    transform: 'translate(-50%, -100%)' 
                  }}
                >
                  <div className="font-semibold text-white pb-1 border-b border-white/[0.06]">
                    {timelineTooltip.day.date}
                  </div>
                  <div className="flex justify-between gap-4 text-emerald-400">
                    <span>Cost:</span>
                    <span>{formatCurrency(timelineTooltip.day.totalCost)}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-blue-300">
                    <span>Tokens:</span>
                    <span>{formatNumber(timelineTooltip.day.totalTokens)}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-neutral-400">
                    <span>Messages:</span>
                    <span>{timelineTooltip.day.totalMessages} (U: {timelineTooltip.day.userMessages}, AI: {timelineTooltip.day.assistantMessages})</span>
                  </div>
                </div>
              )}

              <div 
                className="h-44 sm:h-52 flex items-end gap-1.5 sm:gap-2.5 pt-6 pb-2 overflow-x-auto scroll-smooth" 
                onScroll={() => setTimelineTooltip(null)}
              >
                {timeline.map((day, idx) => {
                  const val =
                    timelineMetric === "cost" ? day.totalCost : day.totalTokens;
                  const maxVal =
                    timelineMetric === "cost" ? maxTimelineCost : maxTimelineTokens;
                  const pct = Math.max((val / maxVal) * 100, 4);

                  return (
                    <div
                      key={day.date}
                      onMouseEnter={(e) => {
                        if (!chartCardRef.current) return;
                        const cardRect = chartCardRef.current.getBoundingClientRect();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTimelineTooltip({ 
                          x: rect.left - cardRect.left + rect.width / 2, 
                          y: rect.top - cardRect.top, 
                          day 
                        });
                      }}
                      onMouseLeave={() => setTimelineTooltip(null)}
                      className="group relative flex-1 min-w-[28px] max-w-[48px] h-full flex flex-col justify-end items-center"
                    >

                      {/* Bar Pillar */}
                      <div
                        style={{ height: `${pct}%` }}
                        className={`w-full rounded-t-md transition-all duration-300 group-hover:brightness-125 ${timelineMetric === "cost"
                            ? "bg-gradient-to-t from-emerald-600/60 to-emerald-400"
                            : "bg-gradient-to-t from-blue-600/60 to-cyan-400"
                          }`}
                      />

                      {/* Date Label */}
                      <span className="text-[9px] font-mono text-neutral-500 mt-1 truncate max-w-full">
                        {day.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        {/* 4. Model Usage Leaderboard */}
        <Card className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Models Breakdown & Pricing</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Usage frequency, token consumption, and costs per AI model
              </p>
            </div>
            <Badge variant="mono" className="text-xs text-neutral-400">
              {models.breakdown.length} model{models.breakdown.length !== 1 ? "s" : ""}
            </Badge>
          </div>

          {models.breakdown.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500 border border-dashed border-white/[0.06] rounded-xl">
              No model usage data recorded for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/[0.06] text-neutral-500 text-[11px]">
                    <th className="pb-3 font-medium">Model</th>
                    <th className="pb-3 font-medium text-right">Messages</th>
                    <th className="pb-3 font-medium text-right">Tokens (In / Out / Thought)</th>
                    <th className="pb-3 font-medium text-right">Total Tokens</th>
                    <th className="pb-3 font-medium text-right">Total Cost</th>
                    <th className="pb-3 font-medium text-right">% of Spend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {models.breakdown.map((m) => {
                    const styling = getProviderColor(m.provider, m.modelName);

                    return (
                      <tr key={m.modelName} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-[10px] rounded-md border font-semibold ${styling.bg}`}>
                              {m.modelName}
                            </span>
                            {m.provider && (
                              <span className="text-[10px] text-neutral-500 font-sans uppercase">
                                {m.provider}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right text-neutral-300">
                          {formatNumber(m.messageCount)}
                        </td>
                        <td className="py-3 px-3 text-right text-neutral-400 text-[11px]">
                          <span>{formatNumber(m.inputTokens)}</span>
                          <span className="text-neutral-600 mx-1">/</span>
                          <span>{formatNumber(m.outputTokens)}</span>
                          {m.thoughtTokens > 0 && (
                            <>
                              <span className="text-neutral-600 mx-1">/</span>
                              <span className="text-indigo-300">{formatNumber(m.thoughtTokens)}</span>
                            </>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right text-white font-medium">
                          {formatNumber(m.totalTokens)}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-400 font-medium">
                          {formatCurrency(m.totalCost)}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-14 bg-white/[0.06] h-1.5 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${Math.min(m.percentageOfTotalCost, 100)}%` }}
                                className={`h-full bg-gradient-to-r ${styling.bar}`}
                              />
                            </div>
                            <span className="text-neutral-300 w-10 text-right">
                              {m.percentageOfTotalCost}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 5. Top Expensive Chats Leaderboard */}
        <Card className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Most Expensive Chats</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Chats that accumulated the highest cost and token volume
              </p>
            </div>
            <Badge variant="mono" className="text-xs text-neutral-400">
              Top {topChats.length}
            </Badge>
          </div>

          {topChats.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500 border border-dashed border-white/[0.06] rounded-xl">
              No chat activity recorded for this period.
            </div>
          ) : (
            <div className="space-y-2">
              {topChats.map((chat, idx) => {
                const rankColor =
                  idx === 0
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                    : idx === 1
                      ? "bg-slate-400/20 text-slate-200 border-slate-400/30"
                      : idx === 2
                        ? "bg-amber-700/20 text-amber-600 border-amber-700/30"
                        : "bg-white/[0.05] text-neutral-400 border-white/[0.08]";

                return (
                  <Link
                    key={chat.id}
                    href={`/app?c=${chat.id}`}
                    className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-white/[0.015] hover:bg-white/[0.04] border border-white/[0.04] hover:border-white/[0.1] rounded-xl transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-mono font-bold border shrink-0 ${rankColor}`}
                      >
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-neutral-200 group-hover:text-white truncate">
                          {chat.title || "Untitled Chat"}
                        </div>
                        <div className="text-[11px] text-neutral-500 font-mono mt-0.5 flex items-center gap-2">
                          <span>{chat.messageCount} msg{chat.messageCount !== 1 ? "s" : ""}</span>
                          <span>•</span>
                          <span>{formatNumber(chat.totalTokens)} tokens</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 text-xs font-mono shrink-0 pl-9 sm:pl-0">
                      <div className="text-[11px] text-neutral-400 text-right">
                        <div>In: {formatCurrency(chat.inputCost)}</div>
                        <div>Out: {formatCurrency(chat.outputCost)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-emerald-400">
                          {formatCurrency(chat.totalCost)}
                        </div>
                        <span className="text-[10px] text-neutral-500 group-hover:text-neutral-300 transition-colors">
                          open chat →
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
