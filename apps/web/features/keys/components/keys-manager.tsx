"use client";

import { useState, useTransition } from "react";
import { AiApiKeyMetadata } from "@ai-vault/types";
import { addApiKeyAction, deleteApiKeyAction } from "../actions/keys.action";

interface KeysManagerProps {
  initialKeys: AiApiKeyMetadata[];
}

export function KeysManager({ initialKeys }: KeysManagerProps) {
  const [keys, setKeys] = useState<AiApiKeyMetadata[]>(initialKeys);
  const [provider, setProvider] = useState("google");
  const [name, setName] = useState("Google Gemini");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
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
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Form Card */}
      <div className="bg-white rounded-lg shadow-md border border-gray-100 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">API Keys</h2>
        <p className="text-gray-500 text-sm mb-6">
          Add and manage your AI API keys.
        </p>

        <form onSubmit={handleAddKey} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Provider
            </label>
            <select
              value={provider}
              onChange={handleProviderChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black bg-white"
            >
              <option value="google">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="deepseek">DeepSeek</option>
              <option value="groq">Groq</option>
              <option value="custom">Custom / Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gemini 1.5 Pro"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              API Key
            </label>
            <input
              type="password"
              required
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-mono text-sm"
            />
          </div>

          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full px-4 py-2 mt-2 text-white bg-black rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isPending ? "Adding..." : "Add Key"}
          </button>
        </form>
      </div>

      {/* List Card */}
      <div className="bg-white rounded-lg shadow-md border border-gray-100 p-8">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Saved Keys</h3>

        {keys.length === 0 ? (
          <p className="text-gray-500 text-sm">No API keys saved yet.</p>
        ) : (
          <div className="divide-y divide-gray-200">
            {keys.map((k) => (
              <div key={k.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-gray-900 text-sm">{k.name}</div>
                  <div className="text-xs text-gray-500 uppercase">{k.provider} • ID: {k.id.slice(0, 8)}...</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteKey(k.id, k.name)}
                  disabled={isPending}
                  className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50 transition"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
