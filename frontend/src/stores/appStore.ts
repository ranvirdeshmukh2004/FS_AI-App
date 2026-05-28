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

  toggleTheme: () => void;
  setView: (view: View) => void;
  setSidebarOpen: (open: boolean) => void;

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

  toggleTheme: () => {
    const newTheme = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    set({ theme: newTheme });
  },

  setView: (view) => set({ view }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  loadSessions: async () => {
    const sessions = await api.getSessions();
    set({ sessions });
  },

  loadSession: async (id) => {
    const session = await api.getSession(id);
    if (session) {
      set({
        activeSessionId: id,
        messages: session.messages || [],
        selectedProvider: session.provider,
        selectedModel: session.model,
        view: "chat",
      });
    }
  },

  createSession: async () => {
    const { selectedProvider, selectedModel } = get();
    const session = await api.createSession(selectedProvider, selectedModel);
    await get().loadSessions();
    set({ activeSessionId: session.id, messages: [] });
    return session.id;
  },

  deleteSession: async (id) => {
    await api.deleteSession(id);
    const { activeSessionId } = get();
    if (activeSessionId === id) {
      set({ activeSessionId: null, messages: [] });
    }
    await get().loadSessions();
  },

  updateSessionTitle: async (id, title) => {
    await api.updateSessionTitle(id, title);
    await get().loadSessions();
  },

  loadProviders: async () => {
    const providers = await api.getProviders();
    set({ providers });
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
      for await (const event of api.streamChat(activeSessionId, content)) {
        if (event.type === "chunk") {
          fullContent += event.content;
          set({ streamingContent: fullContent });
        } else if (event.type === "done") {
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            sessionId: activeSessionId!,
            role: "assistant",
            content: event.content,
            createdAt: new Date().toISOString(),
          };
          set((s) => ({
            messages: [...s.messages, assistantMessage],
            isStreaming: false,
            streamingContent: "",
          }));
        } else if (event.type === "error") {
          set({ isStreaming: false, streamingContent: "" });
        }
      }
    } catch {
      set({ isStreaming: false, streamingContent: "" });
    }

    if (get().messages.length === 2) {
      const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
      await get().updateSessionTitle(activeSessionId, title);
    }
  },
}));
