export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  defaultModels: { id: string; name: string }[];
}

export const providers: ProviderConfig[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModels: [
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
      { id: "google/gemini-2.5-pro-preview", name: "Gemini 2.5 Pro" },
      { id: "openai/gpt-4o", name: "GPT-4o" },
      { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick" },
      { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout" },
      { id: "deepseek/deepseek-r1", name: "DeepSeek R1" },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModels: [
      { id: "meta-llama/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick" },
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout" },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B" },
      { id: "gemma2-9b-it", name: "Gemma 2 9B" },
    ],
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    defaultModels: [
      { id: "grok-3", name: "Grok 3" },
      { id: "grok-3-mini", name: "Grok 3 Mini" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModels: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "o3-mini", name: "o3 Mini" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModels: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-haiku-3-5-20241022", name: "Claude 3.5 Haiku" },
      { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
    ],
  },
];

export function getProviderConfig(providerId: string): ProviderConfig | undefined {
  return providers.find((p) => p.id === providerId);
}
