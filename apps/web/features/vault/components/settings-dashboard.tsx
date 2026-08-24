"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { SettingsDto, TokenTierDto, AiApiKeyMetadata } from "@ai-vault/types";
import { updateSettingsAction } from "../actions/settings.action";
import { Button, Input, Card, ErrorAlert } from "@/shared/components";

interface SettingsDashboardProps {
  initialSettings: SettingsDto;
  apiKeys: AiApiKeyMetadata[];
}

export function SettingsDashboard({ initialSettings, apiKeys }: SettingsDashboardProps) {
  const [settings, setSettings] = useState<SettingsDto>(initialSettings);
  const [systemPrompt, setSystemPrompt] = useState(initialSettings.systemPrompt);
  const [maxCostPerRequest, setMaxCostPerRequest] = useState(initialSettings.maxCostPerRequest.toString());
  const [tokenTiers, setTokenTiers] = useState<TokenTierDto[]>(initialSettings.tokenTiers);
  const [titlePrompt, setTitlePrompt] = useState(initialSettings.titlePrompt || "");
  const [titleApiKeyId, setTitleApiKeyId] = useState(initialSettings.titleApiKeyId || "");
  const [titleModelId, setTitleModelId] = useState(initialSettings.titleModelId || "");
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const costNum = parseFloat(maxCostPerRequest);
    if (isNaN(costNum) || costNum < 0) {
      setError("Max cost must be a valid positive number.");
      return;
    }

    startTransition(async () => {
      const res = await updateSettingsAction({
        systemPrompt,
        maxCostPerRequest: costNum,
        tokenTiers,
        titlePrompt,
        titleApiKeyId: titleApiKeyId || null,
        titleModelId: titleModelId || null,
      });

      if (!res.success || !res.settings) {
        setError(res.error || "Failed to save settings.");
      } else {
        setSettings(res.settings);
        setSuccess("Settings saved successfully!");
      }
    });
  };

  const updateTierCost = (index: number, val: string) => {
    const newTiers = [...tokenTiers];
    newTiers[index].max_cost = parseFloat(val) || 0;
    setTokenTiers(newTiers);
  };

  const updateTierTokens = (index: number, val: string) => {
    const newTiers = [...tokenTiers];
    newTiers[index].tokens = parseInt(val, 10) || 0;
    setTokenTiers(newTiers);
  };

  const addTier = () => {
    setTokenTiers([...tokenTiers, { max_cost: 0, tokens: 0 }]);
  };

  const removeTier = (index: number) => {
    const newTiers = tokenTiers.filter((_, i) => i !== index);
    setTokenTiers(newTiers);
  };

  return (
    <div className="flex-1 flex flex-col w-full bg-[#0e0f12] bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(120,119,198,0.08),transparent)] text-neutral-100 min-h-screen">
      {/* Top Header */}
      <header className="w-full px-5 py-3.5 flex items-center justify-between text-[11px] font-mono text-neutral-400 bg-[#0e0f12]/60 backdrop-blur-md border-b border-white/[0.04] select-none">
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.06] transition-all cursor-pointer"
          >
            <span>←</span>
            <span>app</span>
          </Link>
          <span className="text-neutral-700">/</span>
          <span className="text-neutral-200 font-sans font-medium">Settings</span>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-5 py-8 space-y-8 animate-enter">
        <form onSubmit={handleSave} className="space-y-8">
          {error && <ErrorAlert message={error} />}
          {success && (
            <div className="p-3 mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-sm">
              {success}
            </div>
          )}

          <Card className="p-6 sm:p-8 space-y-6">
            <div className="space-y-1">
              <h2 className="text-base font-medium text-neutral-100 font-sans">Global System Prompt</h2>
              <p className="text-xs text-neutral-500 font-mono">
                Appended to all AI chats automatically
              </p>
            </div>
            <div className="space-y-1.5 w-full">
              <textarea
                className="w-full h-32 px-3.5 py-2.5 bg-[#181920] border border-white/[0.08] rounded-xl text-neutral-100 placeholder:text-neutral-600 text-sm focus:outline-none focus:border-white/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed resize-y"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Enter a system prompt..."
                required
              />
            </div>
          </Card>

          <Card className="p-6 sm:p-8 space-y-6">
            <div className="space-y-1">
              <h2 className="text-base font-medium text-neutral-100 font-sans">Cost Controls</h2>
              <p className="text-xs text-neutral-500 font-mono">
                Set budget limitations for AI usage
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Max Cost Per Request (USD $)"
                type="number"
                step="0.01"
                min="0"
                value={maxCostPerRequest}
                onChange={(e) => setMaxCostPerRequest(e.target.value)}
                placeholder="e.g. 0.50"
                required
              />
            </div>
          </Card>

          <Card className="p-6 sm:p-8 space-y-6">
            <div className="space-y-1">
              <h2 className="text-base font-medium text-neutral-100 font-sans">Chat Title Generation</h2>
              <p className="text-xs text-neutral-500 font-mono">
                Configure AI for automatic chat title generation.
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 w-full">
                <label className="text-[13px] font-medium text-neutral-300 font-sans">API Key</label>
                <select
                  className="w-full h-10 px-3 bg-[#181920] border border-white/[0.08] rounded-xl text-neutral-100 text-sm focus:outline-none focus:border-white/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  value={titleApiKeyId}
                  onChange={(e) => {
                    setTitleApiKeyId(e.target.value);
                    setTitleModelId("");
                  }}
                >
                  <option value="">None (Use default)</option>
                  {apiKeys.map((k) => (
                    <option key={k.id} value={k.id}>{k.name} ({k.provider})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 w-full">
                <label className="text-[13px] font-medium text-neutral-300 font-sans">Model</label>
                <select
                  className="w-full h-10 px-3 bg-[#181920] border border-white/[0.08] rounded-xl text-neutral-100 text-sm focus:outline-none focus:border-white/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  value={titleModelId}
                  onChange={(e) => setTitleModelId(e.target.value)}
                  disabled={!titleApiKeyId}
                >
                  <option value="">Select a model</option>
                  {apiKeys.find(k => k.id === titleApiKeyId)?.models?.map((m) => (
                    <option key={m.id} value={m.id}>{m.displayName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5 w-full mt-4">
              <label className="text-[13px] font-medium text-neutral-300 font-sans">Custom Title Prompt (Optional)</label>
              <textarea
                className="w-full h-24 px-3.5 py-2.5 bg-[#181920] border border-white/[0.08] rounded-xl text-neutral-100 placeholder:text-neutral-600 text-sm focus:outline-none focus:border-white/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed resize-y"
                value={titlePrompt}
                onChange={(e) => setTitlePrompt(e.target.value)}
                placeholder="You are a title generator. Generate a very short, concise title (max 4-5 words)..."
              />
            </div>
          </Card>

          <Card className="p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-base font-medium text-neutral-100 font-sans">Dynamic Token Tiers</h2>
                <p className="text-xs text-neutral-500 font-mono">
                  Limit output tokens based on model output cost (per 1M).
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={addTier} size="sm" className="px-3">
                + Add Tier
              </Button>
            </div>

            <div className="space-y-4">
              {tokenTiers.map((tier, index) => (
                <div key={index} className="flex gap-4 items-end bg-[#181920]/50 p-4 rounded-xl border border-white/[0.04]">
                  <div className="flex-1">
                    <Input
                      label="Cost <= ($)"
                      type="number"
                      step="0.01"
                      value={tier.max_cost}
                      onChange={(e) => updateTierCost(index, e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      label="Max Output Tokens"
                      type="number"
                      step="1"
                      value={tier.tokens}
                      onChange={(e) => updateTierTokens(index, e.target.value)}
                    />
                  </div>
                  <div className="pb-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                      onClick={() => removeTier(index)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="flex justify-end pt-4">
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
