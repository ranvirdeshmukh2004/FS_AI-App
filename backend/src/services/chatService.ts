import { getProviderConfig } from "../config/providers.js";
import { getDecryptedKey } from "./apiKeyService.js";
import * as endpointService from "./customEndpointService.js";
import { config } from "../config/index.js";
import { checkOutboundUrl } from "../utils/urlGuard.js";
import { logger } from "../utils/logger.js";

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Provider error bodies can echo back the request, including the key.
 * Map the common statuses to something safe and actionable instead.
 */
function providerErrorMessage(status: number, body: string): string {
  if (status === 401) return "Invalid API key — the provider rejected it.";
  if (status === 403) return "This API key does not have access to that model.";
  if (status === 404) return "That model was not found for this provider.";
  if (status === 429) return "Rate limited by the provider. Wait a moment and retry.";
  if (status >= 500) return `The provider is having trouble (${status}). Try again shortly.`;

  // 4xx we don't recognise: surface a trimmed hint, never the whole body.
  const hint = body.slice(0, 200).replace(/sk-[A-Za-z0-9_-]+/g, "sk-***");
  return `Provider returned ${status}: ${hint}`;
}

interface UsageInfo {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/**
 * Resolve provider + model to (baseUrl, apiKey, actualModel).
 * Handles self-hosted custom endpoints (model IDs like "custom:<uuid>").
 *
 * `suppliedKey` is the caller's own key (BYOK). When it is present it always
 * wins; when it is absent we only fall back to a stored key outside demo
 * mode, so a public deployment can never spend the operator's credits.
 */
async function resolveEndpoint(
  provider: string,
  model: string,
  suppliedKey?: string | null
): Promise<{ baseUrl: string; apiKey: string; model: string; isAnthropic: boolean } | null> {
  // Ollama — local LLM, no API key needed
  if (provider === "ollama") {
    return {
      baseUrl: `${OLLAMA_BASE}/v1`,
      apiKey: "ollama",
      model,
      isAnthropic: false,
    };
  }

  // Self-hosted custom endpoint
  if (provider === "self-hosted" && model.startsWith("custom:")) {
    const endpointId = model.slice(7); // remove "custom:" prefix
    const endpoint = await endpointService.getEndpoint(endpointId);
    if (!endpoint) return null;

    // Re-check on use: an endpoint may have been stored before the guard
    // existed, or the environment may have changed since it was created.
    const guard = checkOutboundUrl(endpoint.baseUrl);
    if (!guard.ok) {
      logger.warn({ baseUrl: endpoint.baseUrl, reason: guard.reason }, "Blocked custom endpoint");
      return null;
    }

    return {
      baseUrl: endpoint.baseUrl.replace(/\/+$/, ""),
      apiKey: endpoint.apiKey || "",
      model: endpoint.modelId,
      isAnthropic: false,
    };
  }

  // Built-in provider
  const providerConfig = getProviderConfig(provider);
  if (!providerConfig) return null;

  const apiKey = suppliedKey || (config.demoMode ? null : await getDecryptedKey(provider));
  if (!apiKey) return null;

  return {
    baseUrl: providerConfig.baseUrl,
    apiKey,
    model,
    isAnthropic: provider === "anthropic",
  };
}

export async function streamChat(
  provider: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  onChunk: (text: string) => void,
  onDone: (fullText: string, usage: UsageInfo) => void,
  onError: (err: Error) => void,
  suppliedKey?: string | null,
  signal?: AbortSignal
) {
  const resolved = await resolveEndpoint(provider, model, suppliedKey);
  if (!resolved) {
    onError(new Error(
      provider === "self-hosted"
        ? "Self-hosted endpoint not found, inactive, or pointing at a blocked address"
        : config.demoMode
          ? `No API key supplied for ${provider}. Add your own key in Settings — it stays in your browser.`
          : `No API key configured for ${provider}`
    ));
    return;
  }

  if (resolved.isAnthropic) {
    return streamChatAnthropic(resolved.baseUrl, resolved.apiKey, resolved.model, messages, maxTokens, onChunk, onDone, onError, signal);
  }

  return streamChatOpenAI(resolved.baseUrl, resolved.apiKey, resolved.model, messages, maxTokens, onChunk, onDone, onError, signal);
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
  maxTokens: number,
  onChunk: (text: string) => void,
  onDone: (fullText: string, usage: UsageInfo) => void,
  onError: (err: Error) => void,
  signal?: AbortSignal
) {
  const url = `${baseUrl}/chat/completions`;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    let response = await fetch(url, {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: maxTokens,
        stream_options: { include_usage: true },
      }),
    });

    // Fallback for custom EC2 FastAPI servers that expose /chat instead of /v1/chat/completions
    if (response.status === 404 && baseUrl.includes(":8080")) {
      const baseChatUrl = baseUrl.replace(/\/v1$/, ""); // Remove /v1 if present
      
      // Combine all messages into a single prompt string since the custom API expects "message"
      const combinedMessage = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
      
      const customResponse = await fetch(`${baseChatUrl}/chat`, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
          message: combinedMessage,
          max_tokens: maxTokens
        }),
      });

      if (customResponse.ok) {
        const data = await customResponse.json();
        // Simulate a single streaming chunk with the entire response
        if (data.response) {
          onChunk(data.response);
          onDone(data.response, { 
            completion_tokens: data.tokens_used || 0,
            prompt_tokens: 0,
            total_tokens: data.tokens_used || 0
          });
          return;
        }
      }
    }

    if (!response.ok) {
      const errBody = await response.text();
      logger.error({ status: response.status, body: errBody }, "Provider API error");
      onError(new Error(providerErrorMessage(response.status, errBody)));
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
      if (signal?.aborted) {
        await reader.cancel().catch(() => {});
        return;
      }
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
    if (err instanceof Error && err.name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

async function streamChatAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  onChunk: (text: string) => void,
  onDone: (fullText: string, usage: UsageInfo) => void,
  onError: (err: Error) => void,
  signal?: AbortSignal
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
      max_tokens: maxTokens,
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
      signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text();
      logger.error({ status: response.status, body: errBody }, "Anthropic API error");
      onError(new Error(providerErrorMessage(response.status, errBody)));
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
      if (signal?.aborted) {
        await reader.cancel().catch(() => {});
        return;
      }
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
    if (err instanceof Error && err.name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
