export interface ChatSession {
  id: string;
  title: string;
  provider: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
  messages?: Message[];
}

export interface TraceStep {
  type: "thought" | "action" | "observation" | "direct";
  content?: string;
  tool?: string;
  input?: string;
  duration?: number;
}

export interface ReasoningTrace {
  steps: TraceStep[];
  tool_calls: number;
  total_time: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  db_time?: number;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens?: number;
  createdAt: string;
  trace?: ReasoningTrace;
}

export interface Provider {
  id: string;
  name: string;
  models: ProviderModel[];
}

export interface ProviderModel {
  id: string;
  name: string;
}

export interface ApiKeyInfo {
  id: string;
  provider: string;
  label?: string;
  keyPreview: string;
  createdAt: string;
  updatedAt: string;
}

export type Theme = "light" | "dark";

export type View = "chat" | "settings";

export type SearchEngine = "duckduckgo" | "google";
