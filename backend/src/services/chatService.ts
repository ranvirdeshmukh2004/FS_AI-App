import { getProviderConfig } from "../config/providers.js";
import { getDecryptedKey } from "./apiKeyService.js";
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

export async function streamChat(
  provider: string,
  model: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: (fullText: string, usage: UsageInfo) => void,
  onError: (err: Error) => void
) {
  const providerConfig = getProviderConfig(provider);
  if (!providerConfig) {
    onError(new Error(`Unknown provider: ${provider}`));
    return;
  }

  const apiKey = await getDecryptedKey(provider);
  if (!apiKey) {
    onError(new Error(`No API key configured for ${provider}`));
    return;
  }

  const url = `${providerConfig.baseUrl}/chat/completions`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
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
