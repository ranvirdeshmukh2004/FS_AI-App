export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  /**
   * Shown before a key is supplied, and used as the fallback when the
   * provider's /models endpoint cannot be reached. Providers ship new model
   * IDs constantly, so treat this list as a starting point — GET
   * /api/providers/:id/models returns the live catalogue once a key exists.
   */
  defaultModels: { id: string; name: string }[];
  /** False for providers that expose no OpenAI-compatible /models route. */
  supportsModelListing: boolean;
}

export const providers: ProviderConfig[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    supportsModelListing: true,
    defaultModels: [
      { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5" },
      { id: "anthropic/claude-opus-5", name: "Claude Opus 5" },
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "openai/gpt-4o", name: "GPT-4o" },
      { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick" },
      { id: "deepseek/deepseek-r1", name: "DeepSeek R1" },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    supportsModelListing: true,
    defaultModels: [
      { id: "meta-llama/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick" },
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout" },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
      { id: "gemma2-9b-it", name: "Gemma 2 9B" },
    ],
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    supportsModelListing: true,
    defaultModels: [
      { id: "grok-3", name: "Grok 3" },
      { id: "grok-3-mini", name: "Grok 3 Mini" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    supportsModelListing: true,
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
    // Anthropic's /models route is not OpenAI-compatible, so the static list
    // is authoritative here.
    supportsModelListing: false,
    defaultModels: [
      { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
      { id: "claude-opus-5", name: "Claude Opus 5" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    ],
  },
];

export function getProviderConfig(providerId: string): ProviderConfig | undefined {
  return providers.find((p) => p.id === providerId);
}
