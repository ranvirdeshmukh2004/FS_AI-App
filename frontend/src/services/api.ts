import { keyHeaderFor } from "./byokStore";

/**
 * Where the API lives.
 *
 * Empty means same-origin, which is correct behind the Docker nginx proxy
 * and the Vite dev proxy. A split deployment (static frontend on one host,
 * API on another) sets VITE_API_URL at build time — without it every
 * request would hit the static host and 404.
 */
const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export const apiBaseUrl = BASE;

/** Turn an error response into something worth showing a person. */
async function toError(res: Response): Promise<Error> {
  let detail = "";
  try {
    const body = await res.text();
    try {
      const parsed = JSON.parse(body);
      detail = typeof parsed.error === "string" ? parsed.error : body;
    } catch {
      detail = body;
    }
  } catch {
    /* body already consumed or unreadable */
  }

  if (res.status === 429) {
    return new Error(detail || "Too many requests — wait a moment and try again.");
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return new Error(
      detail ||
        "The server is waking up. Free-tier instances sleep when idle — wait ~30s and retry."
    );
  }
  return new Error(detail || `Request failed (${res.status})`);
}

async function request<T>(
  path: string,
  init?: RequestInit,
  provider?: string
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...keyHeaderFor(provider),
      ...init?.headers,
    },
  });
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface StreamEvent {
  type: "chunk" | "done" | "error" | "thinking" | "tool" | "observation" | "trace";
  content: string;
}

export interface ServerConfig {
  demoMode: boolean;
  pythonToolEnabled: boolean;
  maxUploadMb: number;
}

export const api = {
  /**
   * Server capabilities. Fetched at startup so the UI can adapt (BYOK vs
   * stored keys) without needing a matching build-time flag.
   */
  getConfig: () => request<ServerConfig>("/api/config"),

  getProviderModels: (provider: string) =>
    request<{ models: { id: string; name: string }[]; live: boolean }>(
      `/api/providers/${encodeURIComponent(provider)}/models`,
      undefined,
      provider
    ),

  getSessions: () =>
    request<import("@/types").ChatSession[]>("/api/sessions"),

  getSession: (id: string) =>
    request<import("@/types").ChatSession>(`/api/sessions/${id}`),

  createSession: (provider: string, model: string, title?: string) =>
    request<import("@/types").ChatSession>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ provider, model, title }),
    }),

  updateSessionTitle: (id: string, title: string) =>
    request<import("@/types").ChatSession>(`/api/sessions/${id}/title`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),

  updateSessionModel: (id: string, provider: string, model: string) =>
    request<import("@/types").ChatSession>(`/api/sessions/${id}/model`, {
      method: "PATCH",
      body: JSON.stringify({ provider, model }),
    }),

  deleteSession: (id: string) =>
    request<void>(`/api/sessions/${id}`, { method: "DELETE" }),

  getProviders: () =>
    request<import("@/types").Provider[]>("/api/providers"),

  getApiKeys: () =>
    request<import("@/types").ApiKeyInfo[]>("/api/keys"),

  saveApiKey: (provider: string, key: string, label?: string) =>
    request<{ message: string }>("/api/keys", {
      method: "POST",
      body: JSON.stringify({ provider, key, label }),
    }),

  deleteApiKey: (provider: string) =>
    request<void>(`/api/keys/${provider}`, { method: "DELETE" }),

  testApiKey: (provider: string, key: string) =>
    request<{ valid: boolean; message: string }>("/api/keys/test", {
      method: "POST",
      body: JSON.stringify({ provider, key }),
    }),

  // Custom self-hosted endpoints
  getCustomEndpoints: () =>
    request<import("@/types").CustomEndpoint[]>("/api/custom-endpoints"),

  createCustomEndpoint: (data: {
    name: string;
    baseUrl: string;
    apiKey?: string;
    modelId: string;
    modelName: string;
  }) =>
    request<import("@/types").CustomEndpoint>("/api/custom-endpoints", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  testCustomEndpoint: (baseUrl: string, apiKey?: string) =>
    request<{ valid: boolean; message: string; models?: string[] }>(
      "/api/custom-endpoints/test",
      { method: "POST", body: JSON.stringify({ baseUrl, apiKey }) }
    ),

  deleteCustomEndpoint: (id: string) =>
    request<void>(`/api/custom-endpoints/${id}`, { method: "DELETE" }),

  // Ollama local model management
  getOllamaStatus: () =>
    request<{ running: boolean }>("/api/ollama/status"),

  getOllamaModels: () =>
    request<import("@/types").OllamaModel[]>("/api/ollama/models"),

  deleteOllamaModel: (name: string) =>
    request<void>(`/api/ollama/models/${encodeURIComponent(name)}`, { method: "DELETE" }),

  pullOllamaModel(
    name: string,
    onProgress: (p: import("@/types").OllamaPullProgress) => void,
    onDone: () => void,
    onError: (err: string) => void
  ): void {
    fetch(`${BASE}/api/ollama/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((res) => {
      if (!res.ok || !res.body) { onError("Pull request failed"); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      function read(): void {
        reader.read().then(({ done, value }) => {
          if (done) { onDone(); return; }
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(t.slice(6)) as import("@/types").OllamaPullProgress;
              if (data.error) { onError(data.error); return; }
              if (data.status === "success") { onDone(); return; }
              onProgress(data);
            } catch { /* skip */ }
          }
          read();
        }).catch((e) => onError(e instanceof Error ? e.message : "Stream failed"));
      }
      read();
    }).catch((e) => onError(e instanceof Error ? e.message : "Network error"));
  },

  // PDF upload
  uploadPdf: async (file: File, sessionId: string, docId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("sessionId", sessionId);
    if (docId) formData.append("docId", docId);
    const res = await fetch(`${BASE}/api/pdf/upload`, {
      method: "POST",
      // No Content-Type here: the browser must set the multipart boundary.
      headers: { ...keyHeaderFor() },
      body: formData,
    });
    if (!res.ok) throw await toError(res);
    return res.json() as Promise<{
      doc_id: string;
      filename: string;
      pages: number;
      chunks: number;
      status: string;
      message?: string;
    }>;
  },

  streamChat(
    sessionId: string,
    message: string,
    onChunk: (text: string) => void,
    onDone: (fullText: string) => void,
    onError: (error: string) => void,
    options?: {
      useTools?: boolean;
      useOrchestrator?: boolean;
      maxTokens?: number;
      searchEngine?: string;
      googleApiKey?: string;
      googleCx?: string;
      onThinking?: (text: string) => void;
      onTool?: (text: string) => void;
      onObservation?: (text: string) => void;
      onTrace?: (traceJson: string) => void;
      provider?: string;
      signal?: AbortSignal;
    }
  ): void {
    fetch(`${BASE}/api/chat`, {
      method: "POST",
      signal: options?.signal,
      headers: {
        "Content-Type": "application/json",
        ...keyHeaderFor(options?.provider),
      },
      body: JSON.stringify({
        sessionId,
        message,
        useTools: options?.useTools ?? false,
        useOrchestrator: options?.useOrchestrator ?? true,
        maxTokens: options?.maxTokens ?? 512,
        searchEngine: options?.searchEngine ?? "duckduckgo",
        googleApiKey: options?.googleApiKey || undefined,
        googleCx: options?.googleCx || undefined,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          return toError(res).then((err) => onError(err.message));
        }

        const reader = res.body?.getReader();
        if (!reader) {
          onError("No response body from server");
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        function read(): void {
          reader!.read().then(({ done, value }) => {
            if (done) {
              onDone("");
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;
              try {
                const data = JSON.parse(trimmed.slice(6)) as StreamEvent;
                if (data.type === "chunk") {
                  onChunk(data.content);
                } else if (data.type === "done") {
                  onDone(data.content);
                  return;
                } else if (data.type === "error") {
                  onError(data.content);
                  return;
                } else if (data.type === "thinking" && options?.onThinking) {
                  options.onThinking(data.content);
                } else if (data.type === "tool" && options?.onTool) {
                  options.onTool(data.content);
                } else if (data.type === "observation" && options?.onObservation) {
                  options.onObservation(data.content);
                } else if (data.type === "trace" && options?.onTrace) {
                  options.onTrace(data.content);
                }
              } catch {
                // skip malformed SSE
              }
            }

            read();
          }).catch((err) => {
            onError(err instanceof Error ? err.message : "Stream read failed");
          });
        }

        read();
      })
      .catch((err) => {
        onError(err instanceof Error ? err.message : "Network request failed");
      });
  },
};
