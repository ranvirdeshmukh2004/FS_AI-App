/**
 * Browser-side storage for the visitor's own provider keys (BYOK).
 *
 * The key is held in this browser and attached to outgoing requests as a
 * header. It is never sent to the backend for storage, never persisted
 * server-side, and never shared with other visitors — which is what makes
 * a public deployment safe to leave running.
 *
 * sessionStorage rather than localStorage on purpose: the key disappears
 * when the tab closes, which is the safer default on a shared machine.
 */

const STORAGE_PREFIX = "fsai.byok.";

function safeGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    // Private browsing and blocked site-data both throw here.
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* Nothing to do — the app still works, the key just won't persist. */
  }
}

function safeRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getProviderKey(provider: string): string | null {
  return safeGet(STORAGE_PREFIX + provider);
}

export function setProviderKey(provider: string, key: string): void {
  const trimmed = key.trim();
  if (trimmed) safeSet(STORAGE_PREFIX + provider, trimmed);
  else safeRemove(STORAGE_PREFIX + provider);
}

export function clearProviderKey(provider: string): void {
  safeRemove(STORAGE_PREFIX + provider);
}

export function listStoredProviders(): string[] {
  try {
    return Object.keys(sessionStorage)
      .filter((k) => k.startsWith(STORAGE_PREFIX))
      .map((k) => k.slice(STORAGE_PREFIX.length));
  } catch {
    return [];
  }
}

/**
 * Which provider's key to send for a given request. `activeProvider` is the
 * session's provider; embeddings fall back to any OpenAI-compatible key the
 * visitor has already entered.
 */
export function keyHeaderFor(activeProvider?: string): Record<string, string> {
  const candidates = activeProvider
    ? [activeProvider, "openai", "openrouter"]
    : ["openai", "openrouter"];

  for (const provider of candidates) {
    const key = getProviderKey(provider);
    if (key) return { "x-provider-key": key };
  }
  return {};
}
