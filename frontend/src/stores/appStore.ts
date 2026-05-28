import { create } from "zustand";
import type { ChatSession, Message, Provider, Theme, View } from "@/types";
import { api } from "@/services/api";

interface AppState {
  theme: Theme;
  view: View;
  sessions: ChatSession[];
  activeSessionId: string | null;
  messages: Message[];
  providers: Provider[];
  selectedProvider: string;
  selectedModel: string;
  isStreaming: boolean;
  streamingContent: string;
  sidebarOpen: boolean;
  error: string | null;

  toggleTheme: () => void;
  setView: (view: View) => void;
  setSidebarOpen: (open: boolean) => void;
  clearError: () => void;

  loadSessions: () => Promise<void>;
  loadSession: (id: string) => Promise<void>;
  createSession: () => Promise<string | null>;
  deleteSession: (id: string) => Promise<void>;
  updateSessionTitle: (id: string, title: string) => Promise<void>;

  loadProviders: () => Promise<void>;
  setProvider: (provider: string) => void;
  setModel: (model: string) => void;

  sendMessage: (content: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: (localStorage.getItem("theme") as Theme) || "dark",
  view: "chat",
  sessions: [],
  activeSessionId: null,
  messages: [],
  providers: [],
  selectedProvider: "openrouter",
  selectedModel: "anthropic/claude-sonnet-4",
  isStreaming: false,
  streamingContent: "",
  sidebarOpen: true,
  error: null,

  toggleTheme: () => {
    const newTheme = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    set({ theme: newTheme });
  },

  setView: (view) => set({ view }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  clearError: () => set({ error: null }),

  loadSessions: async () => {
    try {
      const sessions = await api.getSessions();
      set({ sessions });
    } catch (err) {
      console.error("Failed to load sessions:", err);
      set({ error: "Failed to load sessions. Is the backend running?" });
    }
  },

  loadSession: async (id) => {
    try {
      const session = await api.getSession(id);
      if (session) {
        set({
          activeSessionId: id,
          messages: session.messages || [],
          selectedProvider: session.provider,
          selectedModel: session.model,
          view: "chat",
          error: null,
        });
      }
    } catch (err) {
      console.error("Failed to load session:", err);
      set({ error: "Failed to load session" });
    }
  },

  createSession: async () => {
    try {
      const { selectedProvider, selectedModel } = get();
      const session = await api.createSession(selectedProvider, selectedModel);
      await get().loadSessions();
      set({ activeSessionId: session.id, messages: [], error: null });
      return session.id;
    } catch (err) {
      console.error("Failed to create session:", err);
      set({ error: "Failed to create chat session. Check database connection." });
      return null;
    }
  },

  deleteSession: async (id) => {
    try {
      await api.deleteSession(id);
      const { activeSessionId } = get();
      if (activeSessionId === id) {
        set({ activeSessionId: null, messages: [] });
      }
      await get().loadSessions();
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  },

  updateSessionTitle: async (id, title) => {
    try {
      await api.updateSessionTitle(id, title);
      await get().loadSessions();
    } catch {
      // non-critical
    }
  },

  loadProviders: async () => {
    try {
      const providers = await api.getProviders();
      set({ providers });
    } catch (err) {
      console.error("Failed to load providers:", err);
    }
  },

  setProvider: (provider) => {
    const providerData = get().providers.find((p) => p.id === provider);
    set({
      selectedProvider: provider,
      selectedModel: providerData?.models[0]?.id || "",
    });
  },

  setModel: (model) => set({ selectedModel: model }),

  sendMessage: async (content) => {
    let { activeSessionId } = get();
    set({ error: null });

    if (!activeSessionId) {
      activeSessionId = await get().createSession();
      if (!activeSessionId) return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      sessionId: activeSessionId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    set((s) => ({
      messages: [...s.messages, userMessage],
      isStreaming: true,
      streamingContent: "",
    }));

    try {
      let fullContent = "";
      let gotResponse = false;

      for await (const event of api.streamChat(activeSessionId, content)) {
        if (event.type === "chunk") {
          gotResponse = true;
          fullContent += event.content;
          set({ streamingContent: fullContent });
        } else if (event.type === "done") {
          gotResponse = true;
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            sessionId: activeSessionId!,
            role: "assistant",
            content: event.content || fullContent,
            createdAt: new Date().toISOString(),
          };
          set((s) => ({
            messages: [...s.messages, assistantMessage],
            isStreaming: false,
            streamingContent: "",
          }));
        } else if (event.type === "error") {
          set({
            isStreaming: false,
            streamingContent: "",
            error: `AI Error: ${event.content}`,
          });
          return;
        }
      }

      // If stream ended without a done event but we got chunks
      if (!gotResponse) {
        set({
          isStreaming: false,
          streamingContent: "",
          error: "No response from AI provider. Check your API key and try again.",
        });
      } else if (fullContent && get().isStreaming) {
        // Stream ended without explicit done event
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          sessionId: activeSessionId!,
          role: "assistant",
          content: fullContent,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({
          messages: [...s.messages, assistantMessage],
          isStreaming: false,
          streamingContent: "",
        }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Chat error:", err);
      set({
        isStreaming: false,
        streamingContent: "",
        error: `Chat failed: ${message}`,
      });
    }

    // Auto-title after first exchange
    try {
      if (get().messages.length === 2 && activeSessionId) {
        const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
        await get().updateSessionTitle(activeSessionId, title);
      }
    } catch {
      // non-critical
    }
  },
}));
