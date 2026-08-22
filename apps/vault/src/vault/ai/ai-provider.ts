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
  maxOutputTokens?: number;
  thinkingLevel?: "low" | "medium" | "high" | "none";
}

export interface AiExecutionResult {
  content: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  thinkingLevel?: string;
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

export class UnsupportedProviderError extends Error {
  constructor(provider: string) {
    super(`Unsupported AI provider: "${provider}".`);
    this.name = "UnsupportedProviderError";
  }
}

const BASE_SYSTEM_PROMPT = "Be a friendly but 100% honest assistant. Truth is paramount regardless of emotions. Keep responses as concise as possible while remaining fully meaningful.";

function mergeSystemPrompt(messages: ChatMessagePrompt[]): ChatMessagePrompt[] {
  const existingSystemMsg = messages.find((m) => m.role === "system")?.content || "";
  const finalSystemInstructionText = existingSystemMsg
    ? `${existingSystemMsg}\n\n${BASE_SYSTEM_PROMPT}`
    : BASE_SYSTEM_PROMPT;

  return [
    { role: "system", content: finalSystemInstructionText },
    ...messages.filter((m) => m.role !== "system"),
  ];
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
  let thinkingLevel: string = params.thinkingLevel !== undefined ? params.thinkingLevel : (provider === "google" ? "medium" : "none");
  let result: { text: string; inputTokens?: number; outputTokens?: number; thoughtTokens?: number; thinkingLevel?: string };

  const mergedMessages = mergeSystemPrompt(params.messages);

  if (provider === "google") {
    model = model || "gemini-3.7-flash";
    result = await callGemini(apiKey, model, mergedMessages, params.maxOutputTokens, thinkingLevel);
  } else if (provider === "anthropic") {
    model = model || "claude-sonnet-5";
    result = await callAnthropic(apiKey, model, mergedMessages, params.maxOutputTokens, thinkingLevel);
  } else if (provider === "deepseek") {
    model = model || "deepseek-v4-pro";
    result = await callOpenAiCompatible("https://api.deepseek.com/chat/completions", apiKey, model, mergedMessages, params.maxOutputTokens, thinkingLevel);
  } else if (provider === "groq") {
    model = model || "openai/gpt-oss-120b";
    result = await callOpenAiCompatible("https://api.groq.com/openai/v1/chat/completions", apiKey, model, mergedMessages, params.maxOutputTokens, thinkingLevel);
  } else if (provider === "openai") {
    model = model || "gpt-5.6-sol";
    result = await callOpenAiCompatible("https://api.openai.com/v1/chat/completions", apiKey, model, mergedMessages, params.maxOutputTokens, thinkingLevel);
  } else {
    throw new UnsupportedProviderError(provider);
  }

  return {
    content: result.text,
    provider,
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    thoughtTokens: result.thoughtTokens,
    thinkingLevel: result.thinkingLevel || thinkingLevel,
  };
}

async function callGemini(
  apiKey: string,
  model: string,
  messages: ChatMessagePrompt[],
  maxOutputTokens: number = 2000,
  thinkingLevel: string = "medium"
): Promise<{ text: string; inputTokens?: number; outputTokens?: number; thoughtTokens?: number; thinkingLevel?: string }> {
  const cleanModel = model.replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent`;

  const finalSystemInstructionText = messages.find((m) => m.role === "system")?.content || "";

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const generationConfig: Record<string, any> = {
    max_output_tokens: maxOutputTokens,
  };

  if (thinkingLevel && thinkingLevel !== "none") {
    generationConfig.thinking_config = {
      thinking_level: thinkingLevel,
    };
  }

  const payload: Record<string, any> = {
    contents,
    generation_config: generationConfig,
  };

  if (finalSystemInstructionText) {
    payload.system_instruction = {
      parts: [{ text: finalSystemInstructionText }],
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[Gemini] API error (${res.status}):`, errorText);
    throw new Error(`AI request failed (${res.status}). Please try again.`);
  }

  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
    }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
      thoughtsTokenCount?: number;
      thinkingTokenCount?: number;
    };
  };

  const candidate = data.candidates?.[0];
  const partText = candidate?.content?.parts?.map((p) => p.text).join("");

  if (!partText) {
    throw new Error("No text response received from Gemini API");
  }

  return {
    text: partText,
    inputTokens: data.usageMetadata?.promptTokenCount,
    outputTokens: data.usageMetadata?.candidatesTokenCount,
    thoughtTokens:
      (data.usageMetadata as any)?.thoughtsTokenCount ??
      (data.usageMetadata as any)?.thinkingTokenCount ??
      (data.usageMetadata as any)?.reasoningTokenCount,
    thinkingLevel,
  };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  messages: ChatMessagePrompt[],
  maxTokens: number = 2000,
  thinkingLevel: string = "none"
): Promise<{ text: string; inputTokens?: number; outputTokens?: number; thoughtTokens?: number; thinkingLevel?: string }> {
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
    max_tokens: maxTokens,
    messages: conversation,
  };

  if (systemMsg) {
    payload.system = systemMsg.content;
  }

  if (thinkingLevel && thinkingLevel !== "none") {
    const budgetMap: Record<string, number> = {
      low: 1024,
      medium: 4096,
      high: 8192,
    };
    const budgetTokens = budgetMap[thinkingLevel] || 2048;
    payload.thinking = {
      type: "enabled",
      budget_tokens: budgetTokens,
    };
    payload.max_tokens = Math.max(maxTokens, budgetTokens + 1024);
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
    console.error(`[Anthropic] API error (${res.status}):`, errorText);
    throw new Error(`AI request failed (${res.status}). Please try again.`);
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
    thoughtTokens: (data.usage as any)?.completion_tokens_details?.thinking_tokens,
    thinkingLevel,
  };
}

async function callOpenAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessagePrompt[],
  maxTokens: number = 2000,
  thinkingLevel: string = "none"
): Promise<{ text: string; inputTokens?: number; outputTokens?: number; thoughtTokens?: number; thinkingLevel?: string }> {
  const payload: Record<string, any> = {
    model,
    max_tokens: maxTokens,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };

  if (thinkingLevel && thinkingLevel !== "none") {
    payload.reasoning_effort = thinkingLevel;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[AI provider] API error (${res.status}):`, errorText);
    throw new Error(`AI request failed (${res.status}). Please try again.`);
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
    thoughtTokens: (data.usage as any)?.completion_tokens_details?.reasoning_tokens ?? (data.usage as any)?.completion_tokens_details?.thinking_tokens,
    thinkingLevel,
  };
}
