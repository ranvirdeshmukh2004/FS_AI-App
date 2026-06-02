const BASE = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface StreamEvent {
  type: "chunk" | "done" | "error" | "thinking" | "tool" | "observation" | "trace";
  content: string;
}

export const api = {
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

  // PDF upload
  uploadPdf: async (file: File, sessionId: string, docId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("sessionId", sessionId);
    if (docId) formData.append("docId", docId);
    const res = await fetch(`${BASE}/api/pdf/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Upload failed: ${body}`);
    }
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
      searchEngine?: string;
      googleApiKey?: string;
      googleCx?: string;
      onThinking?: (text: string) => void;
      onTool?: (text: string) => void;
      onObservation?: (text: string) => void;
      onTrace?: (traceJson: string) => void;
    }
  ): void {
    fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message,
        useTools: options?.useTools ?? false,
        useOrchestrator: options?.useOrchestrator ?? true,
        searchEngine: options?.searchEngine ?? "duckduckgo",
        googleApiKey: options?.googleApiKey || undefined,
        googleCx: options?.googleCx || undefined,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.text().then((body) => {
            onError(`Server error ${res.status}: ${body}`);
          });
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
