import { getAllApiKeys } from "../../db/repository/keys.repository.js";
import { getDecryptedApiKey } from "../keys.js";

export interface ChatMessagePrompt {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AiExecutionParams {
  messages: ChatMessagePrompt[];
  provider?: string;
  model?: string;
}

export interface AiExecutionResult {
  content: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export class NoActiveApiKeyError extends Error {
  constructor(provider?: string) {
    const msg = provider
      ? `No active API key found for provider "${provider}". Please add an API key in Keys manager.`
      : "No active API keys found in vault. Please add an API key first.";
    super(msg);
    this.name = "NoActiveApiKeyError";
  }
}

export async function executeAiCompletion(params: AiExecutionParams): Promise<AiExecutionResult> {
  const allKeys = await getAllApiKeys();
  const activeKeys = allKeys.filter((k) => k.is_active);

  if (activeKeys.length === 0) {
    throw new NoActiveApiKeyError();
  }

  let selectedKeyRecord = params.provider
    ? activeKeys.find((k) => k.provider.toLowerCase() === params.provider?.toLowerCase())
    : activeKeys[0];

  if (!selectedKeyRecord) {
    throw new NoActiveApiKeyError(params.provider);
  }

  const provider = selectedKeyRecord.provider.toLowerCase();
  const apiKey = await getDecryptedApiKey(selectedKeyRecord.id);

  let model = params.model;
  let result: { text: string; inputTokens?: number; outputTokens?: number };

  if (provider === "google") {
    model = model || "gemini-3.7-flash";
    result = await callGemini(apiKey, model, params.messages);
  } else if (provider === "anthropic") {
    model = model || "claude-sonnet-5";
    result = await callAnthropic(apiKey, model, params.messages);
  } else if (provider === "deepseek") {
    model = model || "deepseek-v4-pro";
    result = await callOpenAiCompatible("https://api.deepseek.com/chat/completions", apiKey, model, params.messages);
  } else if (provider === "groq") {
    model = model || "openai/gpt-oss-120b";
    result = await callOpenAiCompatible("https://api.groq.com/openai/v1/chat/completions", apiKey, model, params.messages);
  } else {
    // Default to OpenAI
    model = model || "gpt-5.6-sol";
    result = await callOpenAiCompatible("https://api.openai.com/v1/chat/completions", apiKey, model, params.messages);
  }

  return {
    content: result.text,
    provider,
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

async function callGemini(
  apiKey: string,
  model: string,
  messages: ChatMessagePrompt[]
): Promise<{ text: string; inputTokens?: number; outputTokens?: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: 2000,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const candidate = data.candidates?.[0];
  const partText = candidate?.content?.parts?.[0]?.text;

  if (!partText) {
    throw new Error("No text response received from Gemini API");
  }

  return {
    text: partText,
    inputTokens: data.usageMetadata?.promptTokenCount,
    outputTokens: data.usageMetadata?.candidatesTokenCount,
  };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  messages: ChatMessagePrompt[]
): Promise<{ text: string; inputTokens?: number; outputTokens?: number }> {
  const url = "https://api.anthropic.com/v1/messages";

  const systemMsg = messages.find((m) => m.role === "system");
  const conversation = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  const payload: Record<string, any> = {
    model,
    max_tokens: 2000,
    messages: conversation,
  };

  if (systemMsg) {
    payload.system = systemMsg.content;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as {
    content?: { text?: string }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  const text = data.content?.[0]?.text;

  if (!text) {
    throw new Error("No text response received from Anthropic API");
  }

  return {
    text,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
  };
}

async function callOpenAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessagePrompt[]
): Promise<{ text: string; inputTokens?: number; outputTokens?: number }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`AI API error (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content received from AI provider");
  }

  return {
    text: content,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
  };
}
