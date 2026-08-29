"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AiApiKeyMetadata } from "@ai-vault/types";
import { addApiKeyAction, deleteApiKeyAction, addModelAction, deleteModelAction } from "../actions/keys.action";
import { Button, Input, DropdownSelect, Card, ErrorAlert, Badge, ConfirmDialog } from "@/shared/components";

interface KeysManagerProps {
  initialKeys: AiApiKeyMetadata[];
}

const PROVIDER_OPTIONS = [
  { value: "google", label: "Google Gemini" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic Claude" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "groq", label: "Groq" },
  { value: "local", label: "Local Models (Ollama, LM Studio)" },
  { value: "custom", label: "Custom / Other" },
];

function AddCustomModel({ provider, onAdded }: { provider: string; onAdded: (model: any) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!isOpen) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setIsOpen(true)} className="h-6 px-2 text-[10px] bg-white/[0.04]">
        + add custom model
      </Button>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const formData = new FormData();
    formData.append("provider", provider);
    formData.append("name", name.trim());
    formData.append("displayName", displayName.trim() || name.trim());

    startTransition(async () => {
      const res = await addModelAction(formData);
      if (res.success && res.model) {
        onAdded(res.model);
        setIsOpen(false);
        setName("");
        setDisplayName("");
      } else {
        alert(res.error || "Failed to add model");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 mt-2 p-1.5 bg-white/[0.02] border border-white/[0.05] rounded-xl w-fit">
      <div className="w-[150px]">
        <Input
          type="text"
          placeholder="e.g. phi3:mini"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 text-[11px] px-2.5 bg-[#14151a]"
          isMono
          required
        />
      </div>
      <div className="w-[150px]">
        <Input
          type="text"
          placeholder="Display Name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="h-8 text-[11px] px-2.5 bg-[#14151a]"
        />
      </div>
      <Button type="submit" size="sm" isLoading={isPending} className="h-8 px-3 text-[11px] bg-white text-black hover:bg-neutral-200">
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="h-8 px-2.5 text-[11px] text-neutral-400 hover:text-white">
        Cancel
      </Button>
    </form>
  );
}

export function KeysManager({ initialKeys }: KeysManagerProps) {
  const [keys, setKeys] = useState<AiApiKeyMetadata[]>(initialKeys);
  const [provider, setProvider] = useState("google");
  const [name, setName] = useState("Google Gemini");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [modelToDelete, setModelToDelete] = useState<{ id: string; name: string; provider: string } | null>(null);

  const handleProviderChange = (val: string) => {
    setProvider(val);
    if (val === "google") setName("Google Gemini");
    else if (val === "openai") setName("OpenAI");
    else if (val === "anthropic") setName("Anthropic Claude");
    else if (val === "deepseek") setName("DeepSeek");
    else if (val === "groq") setName("Groq");
    else if (val === "local") setName("Local AI Model");
    else setName("Custom AI Key");
  };


  const handleAddKey = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.append("provider", provider);
    formData.append("name", name);
    const finalApiKey = provider === "local" && !apiKey.trim() ? "none" : apiKey;
    formData.append("apiKey", finalApiKey);
    if (baseUrl.trim()) {
      formData.append("baseUrl", baseUrl.trim());
    }

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

            {(provider === "local" || provider === "custom") && (
              <Input
                label="API Base URL"
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={provider === "local" ? "http://localhost:11434/v1/chat/completions" : "https://api.example.com/v1/chat/completions"}
              />
            )}

            <Input
              label="API Secret Key"
              type="password"
              required={provider !== "local"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === "local" ? "(Optional for local models)" : "sk-..."}
              isMono
            />

            <ErrorAlert message={error} onDismiss={() => setError(null)} />

            <div className="pt-2 flex justify-end">
              <Button
                type="submit"
                isLoading={isPending}
                disabled={provider !== "local" && !apiKey.trim()}
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
                          <div key={model.id} className="group relative flex items-center bg-white/[0.03] border border-white/[0.05] rounded-md transition-colors hover:bg-white/[0.05]">
                            <span className="px-2 py-0.5 text-neutral-300 text-[11px] font-mono cursor-default" title={model.description || model.displayName}>
                              {model.displayName || model.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => setModelToDelete({ id: model.id, name: model.name, provider: k.provider })}
                              className="px-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-500 hover:text-red-400"
                              title="Delete model"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <AddCustomModel
                      provider={k.provider}
                      onAdded={(model) => {
                        setKeys(prev => prev.map(key => {
                          if (key.provider === k.provider) {
                            return { ...key, models: [...(key.models || []), model] };
                          }
                          return key;
                        }));
                      }}
                    />
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

      <ConfirmDialog
        isOpen={modelToDelete !== null}
        title="Delete Custom Model"
        description={`Are you sure you want to delete the model "${modelToDelete?.name}"? This cannot be undone.`}
        confirmText="Delete Model"
        isDestructive
        onCancel={() => setModelToDelete(null)}
        onConfirm={() => {
          if (!modelToDelete) return;
          const { id, provider } = modelToDelete;
          setModelToDelete(null);
          startTransition(async () => {
            const res = await deleteModelAction(id);
            if (res.success) {
              setKeys(prev => prev.map(key => {
                if (key.provider === provider) {
                  return { ...key, models: key.models?.filter(m => m.id !== id) };
                }
                return key;
              }));
            } else {
              alert(res.error || "Failed to delete model");
            }
          });
        }}
      />
    </div>
  );
}

