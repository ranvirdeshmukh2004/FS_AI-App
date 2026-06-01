import { getProviderConfig } from "../config/providers.js";
import { getDecryptedKey } from "./apiKeyService.js";
import * as endpointService from "./customEndpointService.js";
import { logger } from "../utils/logger.js";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface UsageInfo {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/**
 * Resolve provider + model to (baseUrl, apiKey, actualModel).
 * Handles self-hosted custom endpoints (model IDs like "custom:<uuid>").
 */
async function resolveEndpoint(
  provider: string,
  model: string
): Promise<{ baseUrl: string; apiKey: string; model: string; isAnthropic: boolean } | null> {
  // Self-hosted custom endpoint
  if (provider === "self-hosted" && model.startsWith("custom:")) {
    const endpointId = model.slice(7); // remove "custom:" prefix
    const endpoint = await endpointService.getEndpoint(endpointId);
    if (!endpoint) return null;
    return {
      baseUrl: endpoint.baseUrl.replace(/\/+$/, ""),
      apiKey: endpoint.apiKey || "",
      model: endpoint.modelId,
      isAnthropic: false,
    };
  }

  // Built-in provider
  const config = getProviderConfig(provider);
  if (!config) return null;

  const apiKey = await getDecryptedKey(provider);
  if (!apiKey) return null;

  return {
    baseUrl: config.baseUrl,
    apiKey,
    model,
    isAnthropic: provider === "anthropic",
  };
}

export async function streamChat(
  provider: string,
  model: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: (fullText: string, usage: UsageInfo) => void,
  onError: (err: Error) => void
) {
  const resolved = await resolveEndpoint(provider, model);
  if (!resolved) {
    onError(new Error(
      provider === "self-hosted"
        ? "Self-hosted endpoint not found or inactive"
        : `No API key configured for ${provider}`
    ));
    return;
  }

  if (resolved.isAnthropic) {
    return streamChatAnthropic(resolved.baseUrl, resolved.apiKey, resolved.model, messages, onChunk, onDone, onError);
  }

  return streamChatOpenAI(resolved.baseUrl, resolved.apiKey, resolved.model, messages, onChunk, onDone, onError);
}

/**
 * Also export resolveEndpoint for use by reactService
 */
export { resolveEndpoint };

async function streamChatOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: (fullText: string, usage: UsageInfo) => void,
  onError: (err: Error) => void
) {
  const url = `${baseUrl}/chat/completions`;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: 1024,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      logger.error({ status: response.status, body: errBody }, "Provider API error");
      onError(new Error(`Provider returned ${response.status}: ${errBody}`));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError(new Error("No response body"));
      return;
    }

    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";
    let usage: UsageInfo = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk(content);
          }
          if (parsed.usage) {
            usage = parsed.usage;
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    onDone(fullText, usage);
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

async function streamChatAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: (fullText: string, usage: UsageInfo) => void,
  onError: (err: Error) => void
) {
  const url = `${baseUrl}/messages`;
  const systemMsg = messages.find((m) => m.role === "system");
  const convMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  try {
    const body: Record<string, unknown> = {
      model,
      messages: convMessages,
      max_tokens: 1024,
      stream: true,
    };
    if (systemMsg) body.system = systemMsg.content;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text();
      logger.error({ status: response.status, body: errBody }, "Anthropic API error");
      onError(new Error(`Anthropic returned ${response.status}: ${errBody}`));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError(new Error("No response body"));
      return;
    }

    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";
    let usage: UsageInfo = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "content_block_delta") {
            const text = parsed.delta?.text;
            if (text) {
              fullText += text;
              onChunk(text);
            }
          } else if (parsed.type === "message_start" && parsed.message?.usage) {
            usage.prompt_tokens = parsed.message.usage.input_tokens;
          } else if (parsed.type === "message_delta" && parsed.usage) {
            usage.completion_tokens = parsed.usage.output_tokens;
            usage.total_tokens = (usage.prompt_tokens || 0) + (parsed.usage.output_tokens || 0);
          }
        } catch {
          // skip malformed
        }
      }
    }

    onDone(fullText, usage);
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
