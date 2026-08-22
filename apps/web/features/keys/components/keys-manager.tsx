"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AiApiKeyMetadata } from "@ai-vault/types";
import { addApiKeyAction, deleteApiKeyAction } from "../actions/keys.action";
import { Button, Input, DropdownSelect, Card, ErrorAlert, Badge } from "@/shared/components";

interface KeysManagerProps {
  initialKeys: AiApiKeyMetadata[];
}

const PROVIDER_OPTIONS = [
  { value: "google", label: "Google Gemini" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic Claude" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "groq", label: "Groq" },
  { value: "custom", label: "Custom / Other" },
];

export function KeysManager({ initialKeys }: KeysManagerProps) {
  const [keys, setKeys] = useState<AiApiKeyMetadata[]>(initialKeys);
  const [provider, setProvider] = useState("google");
  const [name, setName] = useState("Google Gemini");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleProviderChange = (val: string) => {
    setProvider(val);
    if (val === "google") setName("Google Gemini");
    else if (val === "openai") setName("OpenAI");
    else if (val === "anthropic") setName("Anthropic Claude");
    else if (val === "deepseek") setName("DeepSeek");
    else if (val === "groq") setName("Groq");
    else setName("Custom AI Key");
  };


  const handleAddKey = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.append("provider", provider);
    formData.append("name", name);
    formData.append("apiKey", apiKey);

    startTransition(async () => {
      const res = await addApiKeyAction(formData);
      if (!res.success) {
        setError(res.error || "Failed to add API key");
      } else if (res.key) {
        setKeys((prev) => [res.key!, ...prev]);
        setApiKey("");
      }
    });
  };

  const handleDeleteKey = async (id: string, keyName: string) => {
    if (!window.confirm(`Delete API key "${keyName}"?`)) {
      return;
    }

    startTransition(async () => {
      const res = await deleteApiKeyAction(id);
      if (res.success) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
      } else {
        setError(res.error || "Failed to delete API key");
      }
    });
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
          <span className="text-neutral-200 font-sans font-medium">API Keys</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-neutral-500">
            {keys.length} active key{keys.length !== 1 ? "s" : ""}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-5 py-8 space-y-8 animate-enter">
        {/* Form Card */}
        <Card className="p-6 sm:p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-base font-medium text-neutral-100 font-sans">Add API Key</h2>
            <p className="text-xs text-neutral-500 font-mono">
              Configure credentials for Gemini, OpenAI, Claude, DeepSeek, or Groq
            </p>
          </div>

          <form onSubmit={handleAddKey} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DropdownSelect
                label="Provider"
                options={PROVIDER_OPTIONS}
                value={provider}
                onChange={handleProviderChange}
                variant="input"
                direction="down"
                className="w-full"
              />

              <Input
                label="Key Name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Gemini Production"
              />
            </div>


            <Input
              label="API Secret Key"
              type="password"
              required
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              isMono
            />

            <ErrorAlert message={error} onDismiss={() => setError(null)} />

            <div className="pt-2 flex justify-end">
              <Button
                type="submit"
                isLoading={isPending}
                disabled={!apiKey.trim()}
              >
                Add Key
              </Button>
            </div>
          </form>
        </Card>

        {/* List Card */}
        <Card className="p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-neutral-200 font-sans">Saved Credentials</h3>
            <span className="font-mono text-xs text-neutral-500">
              {keys.length} configured
            </span>
          </div>

          {keys.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-neutral-500">
              No API keys configured yet.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="py-4 first:pt-2 last:pb-0 flex flex-col sm:flex-row sm:items-start justify-between gap-4 group hover:bg-white/[0.01] -mx-2 px-2 rounded-xl transition-colors"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-neutral-100 text-sm font-sans">{k.name}</span>
                      <Badge variant="default">{k.provider}</Badge>
                    </div>

                    <div className="text-[11px] text-neutral-500 font-mono flex items-center gap-2">
                      <span>id: {k.id.slice(0, 8)}...</span>
                      <span>·</span>
                      <span>created {new Date(k.createdAt).toLocaleDateString()}</span>
                    </div>

                    {k.models && k.models.length > 0 && (
                      <div className="pt-1 flex flex-wrap gap-1.5">
                        {k.models.map((model) => (
                          <Badge
                            key={model.id}
                            variant="model"
                            title={model.description || model.displayName}
                          >
                            {model.displayName || model.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="self-end sm:self-start pt-1">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteKey(k.id, k.name)}
                      disabled={isPending}
                    >
                      delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

