import { create } from "zustand";
import type { ChatSession, Message, Provider, ReasoningTrace, SearchEngine, Theme, View } from "@/types";
import { api } from "@/services/api";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

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
  useTools: boolean;
  useOrchestrator: boolean;
  searchEngine: SearchEngine;
  googleApiKey: string;
  googleCx: string;
  toolActivity: string | null;
  pendingTrace: ReasoningTrace | null;

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

  setUseTools: (enabled: boolean) => void;
  setUseOrchestrator: (enabled: boolean) => void;
  setSearchEngine: (engine: SearchEngine) => void;
  setGoogleApiKey: (key: string) => void;
  setGoogleCx: (cx: string) => void;

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
  useTools: true,
  useOrchestrator: localStorage.getItem("useOrchestrator") !== "false",
  searchEngine: (localStorage.getItem("searchEngine") as SearchEngine) || "duckduckgo",
  googleApiKey: localStorage.getItem("googleApiKey") || "",
  googleCx: localStorage.getItem("googleCx") || "",
  toolActivity: null,
  pendingTrace: null,

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
          const msgs = (session.messages || []).map((m) => {
            const msg: Message = { ...m };
            // Restore trace from DB metadata field
            if (m.role === "assistant" && (m as unknown as Record<string, unknown>).metadata) {
              const meta = (m as unknown as Record<string, unknown>).metadata as Record<string, unknown>;
              if (meta && typeof meta === "object" && "steps" in meta) {
                msg.trace = meta as unknown as ReasoningTrace;
              }
            }
            return msg;
          });
          set({
            activeSessionId: id,
            messages: msgs,
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

  setUseTools: (enabled) => set({ useTools: enabled }),
  setUseOrchestrator: (enabled) => {
    localStorage.setItem("useOrchestrator", String(enabled));
    set({ useOrchestrator: enabled });
  },
  setSearchEngine: (engine) => {
    localStorage.setItem("searchEngine", engine);
    set({ searchEngine: engine });
  },
  setGoogleApiKey: (key) => {
    localStorage.setItem("googleApiKey", key);
    set({ googleApiKey: key });
  },
  setGoogleCx: (cx) => {
    localStorage.setItem("googleCx", cx);
    set({ googleCx: cx });
  },

  sendMessage: (content) => {
    const state = get();

    if (state.isStreaming) return;

    set({ error: null });

    const doChat = (sessionId: string) => {
      const userMessage: Message = {
        id: generateId(),
        sessionId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };

      const { useTools, useOrchestrator, searchEngine, googleApiKey, googleCx } = get();

      set((s) => ({
        messages: [...s.messages, userMessage],
        isStreaming: true,
        streamingContent: "",
        toolActivity: null,
        pendingTrace: null,
      }));

      let fullContent = "";

      api.streamChat(
        sessionId,
        content,
        (chunk) => {
          fullContent += chunk;
          set({ streamingContent: fullContent, toolActivity: null });
        },
        (doneText) => {
          const finalContent = doneText || fullContent;
          const trace = get().pendingTrace;
          if (finalContent) {
            const assistantMessage: Message = {
              id: generateId(),
              sessionId,
              role: "assistant",
              content: finalContent,
              createdAt: new Date().toISOString(),
              trace: trace || undefined,
            };
            set((s) => ({
              messages: [...s.messages, assistantMessage],
              isStreaming: false,
              streamingContent: "",
              toolActivity: null,
              pendingTrace: null,
            }));
          } else {
            set({
              isStreaming: false,
              streamingContent: "",
              toolActivity: null,
              pendingTrace: null,
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
            toolActivity: null,
            pendingTrace: null,
            error: errorMsg,
          });
        },
        {
          useTools,
          useOrchestrator,
          searchEngine,
          googleApiKey: searchEngine === "google" ? googleApiKey : undefined,
          googleCx: searchEngine === "google" ? googleCx : undefined,
          onThinking: (text) => {
            set({ toolActivity: `Thinking: ${text}` });
          },
          onTool: (text) => {
            set({ toolActivity: text });
          },
          onObservation: (text) => {
            set({ toolActivity: text });
          },
          onTrace: (traceJson) => {
            try {
              const trace = JSON.parse(traceJson) as ReasoningTrace;
              set({ pendingTrace: trace });
            } catch {
              // ignore malformed trace
            }
          },
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
