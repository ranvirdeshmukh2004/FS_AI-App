const BASE = import.meta.env.VITE_API_URL || "";

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

export const api = {
  getSessions: () => request<import("@/types").ChatSession[]>("/api/sessions"),

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

  getProviders: () => request<import("@/types").Provider[]>("/api/providers"),

  getApiKeys: () => request<import("@/types").ApiKeyInfo[]>("/api/keys"),

  saveApiKey: (provider: string, key: string, label?: string) =>
    request<{ message: string }>("/api/keys", {
      method: "POST",
      body: JSON.stringify({ provider, key, label }),
    }),

  deleteApiKey: (provider: string) =>
    request<void>(`/api/keys/${provider}`, { method: "DELETE" }),

  streamChat: async function* (sessionId: string, message: string) {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Chat API ${res.status}: ${body}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(trimmed.slice(6));
          yield data as { type: "chunk" | "done" | "error"; content: string };
        } catch {
          // skip
        }
      }
    }
  },
};
