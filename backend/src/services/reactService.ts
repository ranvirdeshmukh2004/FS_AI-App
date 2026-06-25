import { resolveEndpoint } from "./chatService.js";
import { logger } from "../utils/logger.js";

// Default to localhost — Docker deployments override via AI_SERVICES_URL env var
const AI_SERVICES_URL = process.env.AI_SERVICES_URL || "http://127.0.0.1:8001";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function streamReactChat(
  provider: string,
  model: string,
  messages: ChatMessage[],
  searchEngine: string,
  googleApiKey: string | undefined,
  googleCx: string | undefined,
  useOrchestrator: boolean,
  sessionId: string | undefined,
  embeddingApiKey: string | undefined,
  maxTokens: number,
  onEvent: (event: { type: string; content: string }) => void,
  onDone: (fullText: string) => void,
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

  // Verify ai-services is up before streaming (10s timeout — Node fetch on Windows is slow to connect)
  try {
    const healthRes = await fetch(`${AI_SERVICES_URL}/api/health`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!healthRes.ok) throw new Error(`Health check returned ${healthRes.status}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ url: AI_SERVICES_URL, err: msg }, "ai-services unreachable");
    onError(new Error(
      `Tool services (ai-services) are not reachable at ${AI_SERVICES_URL}. ` +
      `Start them with: cd ai-services && .\\start-local.bat\n\nOriginal error: ${msg}`
    ));
    return;
  }

  try {
    const response = await fetch(`${AI_SERVICES_URL}/api/react/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_base_url: resolved.baseUrl,
        api_key: resolved.apiKey,
        model: resolved.model,
        messages,
        search_engine: searchEngine,
        google_api_key: googleApiKey || null,
        google_cx: googleCx || null,
        use_orchestrator: useOrchestrator,
        session_id: sessionId || null,
        embedding_api_key: embeddingApiKey || null,
        max_tokens: maxTokens,
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

    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) return;
      const dataStr = trimmed.slice(6);
      try {
        const data = JSON.parse(dataStr);
        if (data.type === "error") {
          onError(new Error(data.content));
          return;
        }
        if (data.type === "done" || data.type === "chunk") {
          fullText = data.content;
        }
        onEvent(data);
      } catch {
        // skip malformed SSE line
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush remaining buffer when stream closes
        if (buffer.trim()) {
          for (const line of buffer.split("\n")) {
            processLine(line);
          }
        }
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        processLine(line);
      }
    }

    onDone(fullText);
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
