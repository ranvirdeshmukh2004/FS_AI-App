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

  loadSessions: () => void;
  loadSession: (id: string) => void;
  createSession: () => Promise<string | null>;
  deleteSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;

  loadProviders: () => void;
  setProvider: (provider: string) => void;
  setModel: (model: string) => void;

  sendMessage: (content: string) => void;
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

  loadSessions: () => {
    api.getSessions()
      .then((sessions) => set({ sessions }))
      .catch(() => set({ sessions: [] }));
  },

  loadSession: (id) => {
    api.getSession(id)
      .then((session) => {
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
      })
      .catch(() => set({ error: "Failed to load session" }));
  },

  createSession: () => {
    const { selectedProvider, selectedModel } = get();
    return api.createSession(selectedProvider, selectedModel)
      .then((session) => {
        get().loadSessions();
        set({ activeSessionId: session.id, messages: [], error: null });
        return session.id;
      })
      .catch((err) => {
        set({ error: "Failed to create session: " + (err instanceof Error ? err.message : "Unknown error") });
        return null;
      });
  },

  deleteSession: (id) => {
    api.deleteSession(id)
      .then(() => {
        if (get().activeSessionId === id) {
          set({ activeSessionId: null, messages: [] });
        }
        get().loadSessions();
      })
      .catch(() => {});
  },

  updateSessionTitle: (id, title) => {
    api.updateSessionTitle(id, title)
      .then(() => get().loadSessions())
      .catch(() => {});
  },

  loadProviders: () => {
    api.getProviders()
      .then((providers) => set({ providers }))
      .catch(() => {});
  },

  setProvider: (provider) => {
    const providerData = get().providers.find((p) => p.id === provider);
    set({
      selectedProvider: provider,
      selectedModel: providerData?.models[0]?.id || "",
    });
  },

  setModel: (model) => set({ selectedModel: model }),

  sendMessage: (content) => {
    const state = get();

    if (state.isStreaming) return;

    set({ error: null });

    const doChat = (sessionId: string) => {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        sessionId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };

      set((s) => ({
        messages: [...s.messages, userMessage],
        isStreaming: true,
        streamingContent: "",
      }));

      let fullContent = "";

      api.streamChat(
        sessionId,
        content,
        (chunk) => {
          fullContent += chunk;
          set({ streamingContent: fullContent });
        },
        (doneText) => {
          const finalContent = doneText || fullContent;
          if (finalContent) {
            const assistantMessage: Message = {
              id: crypto.randomUUID(),
              sessionId,
              role: "assistant",
              content: finalContent,
              createdAt: new Date().toISOString(),
            };
            set((s) => ({
              messages: [...s.messages, assistantMessage],
              isStreaming: false,
              streamingContent: "",
            }));
          } else {
            set({
              isStreaming: false,
              streamingContent: "",
              error: "No response received from AI. Check your API key and credits.",
            });
          }

          // Auto-title
          const msgs = get().messages;
          if (msgs.length === 2) {
            const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
            get().updateSessionTitle(sessionId, title);
          }
        },
        (errorMsg) => {
          set({
            isStreaming: false,
            streamingContent: "",
            error: errorMsg,
          });
        }
      );
    };

    if (state.activeSessionId) {
      doChat(state.activeSessionId);
    } else {
      get().createSession().then((sessionId) => {
        if (sessionId) {
          doChat(sessionId);
        }
      });
    }
  },
}));
