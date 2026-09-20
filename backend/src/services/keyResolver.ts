import type { Request } from "express";
import { config } from "../config/index.js";
import { getDecryptedKey } from "./apiKeyService.js";

/**
 * Header the browser sends in BYOK mode. The key lives in the visitor's
 * own browser storage and travels per-request; it is never written to the
 * database, never logged, and never shared between visitors.
 */
export const BYOK_HEADER = "x-provider-key";

export class MissingKeyError extends Error {
  constructor(provider: string) {
    super(
      config.demoMode
        ? `No API key supplied for ${provider}. Add your own key in Settings — it stays in your browser and is never stored on the server.`
        : `No API key configured for ${provider}. Add one in Settings.`
    );
    this.name = "MissingKeyError";
  }
}

function headerKey(req: Request): string | undefined {
  const raw = req.headers[BYOK_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Resolve the provider key for one request.
 *
 * In demo mode the request header is the only source — we never fall back to
 * stored keys, because that is exactly how a public deployment would end up
 * spending the operator's credits.
 */
export async function resolveApiKey(
  req: Request,
  provider: string
): Promise<string | null> {
  const supplied = headerKey(req);
  if (supplied) return supplied;
  if (config.demoMode) return null;
  return getDecryptedKey(provider);
}

/**
 * Key used for embeddings (PDF search). Optional everywhere — the PDF
 * pipeline falls back to local hash embeddings when it is absent.
 */
export async function resolveEmbeddingKey(
  req: Request
): Promise<string | undefined> {
  const supplied = headerKey(req);
  if (supplied) return supplied;
  if (config.demoMode) return undefined;

  try {
    return (
      (await getDecryptedKey("openai")) ||
      (await getDecryptedKey("openrouter")) ||
      undefined
    );
  } catch {
    return undefined;
  }
}
