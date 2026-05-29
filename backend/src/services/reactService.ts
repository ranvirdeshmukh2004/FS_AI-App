import { getProviderConfig } from "../config/providers.js";
import { getDecryptedKey } from "./apiKeyService.js";
import { logger } from "../utils/logger.js";

const AI_SERVICES_URL = process.env.AI_SERVICES_URL || "http://ai-services:8000";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Stream a ReAct-powered chat through ai-services.
 * Forwards all event types: thinking, tool, observation, chunk, trace, done, error
 */
export async function streamReactChat(
  provider: string,
  model: string,
  messages: ChatMessage[],
  searchEngine: string,
  googleApiKey: string | undefined,
  googleCx: string | undefined,
  onEvent: (event: { type: string; content: string }) => void,
  onDone: (fullText: string) => void,
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

  const url = `${AI_SERVICES_URL}/api/react/chat`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_base_url: providerConfig.baseUrl,
        api_key: apiKey,
        model,
        messages,
        search_engine: searchEngine,
        google_api_key: googleApiKey || null,
        google_cx: googleCx || null,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      logger.error({ status: response.status, body: errBody }, "ReAct API error");
      onError(new Error(`ReAct service returned ${response.status}: ${errBody}`));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError(new Error("No response body from ReAct service"));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const dataStr = trimmed.slice(6);
        try {
          const data = JSON.parse(dataStr);

          if (data.type === "error") {
            onError(new Error(data.content));
            return;
          }

          if (data.type === "done") {
            fullText = data.content;
          } else if (data.type === "chunk") {
            fullText = data.content;
          }

          // Forward all event types to the Express response
          onEvent(data);
        } catch {
          // skip malformed SSE
        }
      }
    }

    onDone(fullText);
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
