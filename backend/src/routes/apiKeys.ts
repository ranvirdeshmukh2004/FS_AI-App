import { Router } from "express";
import { z } from "zod";
import * as apiKeyService from "../services/apiKeyService.js";
import { getProviderConfig } from "../config/providers.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

const router = Router();

const upsertSchema = z.object({
  provider: z.string().min(1),
  key: z.string().min(1),
  label: z.string().optional(),
});

const testSchema = z.object({
  provider: z.string().min(1),
  key: z.string().min(1),
});

/**
 * In demo mode the server keeps no keys at all, so these routes report an
 * empty set and refuse writes. Without this a public URL would let anyone
 * plant or replace a key for every other visitor.
 */
function rejectInDemoMode(res: import("express").Response): boolean {
  if (!config.demoMode) return false;
  res.status(403).json({
    error:
      "This deployment does not store API keys. Your key stays in your browser and is sent only with your own requests.",
  });
  return true;
}

router.get("/", async (_req, res) => {
  if (config.demoMode) {
    res.json([]);
    return;
  }
  try {
    const keys = await apiKeyService.listApiKeys();
    res.json(keys);
  } catch (err) {
    logger.error({ err }, "Failed to list API keys");
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/", async (req, res) => {
  if (rejectInDemoMode(res)) return;

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    await apiKeyService.upsertApiKey(parsed.data.provider, parsed.data.key, parsed.data.label);
    res.status(200).json({ message: "API key saved" });
  } catch (err) {
    logger.error({ err }, "Failed to save API key");
    res.status(500).json({ error: "Could not save the key. Check ENCRYPTION_KEY and the database connection." });
  }
});

router.post("/test", async (req, res) => {
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ valid: false, error: "Missing provider or key" });
    return;
  }

  const { provider, key } = parsed.data;

  // Ollama is local — no API key needed, just ping it
  if (provider === "ollama") {
    const ollamaBase = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    try {
      const r = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        res.json({ valid: true, message: "Ollama is running locally — no API key needed" });
      } else {
        res.json({ valid: false, message: "Ollama responded but with an error" });
      }
    } catch {
      res.json({ valid: false, message: "Ollama is not running. Start it with: ollama serve" });
    }
    return;
  }

  const providerConfig = getProviderConfig(provider);

  if (!providerConfig) {
    res.status(400).json({ valid: false, error: `Unknown provider: ${provider}` });
    return;
  }

  try {
    let response: Response;

    if (provider === "anthropic") {
      // Anthropic has no /models endpoint — validate with a tiny messages call
      response = await fetch(`${providerConfig.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (response.status === 401 || response.status === 403) {
        res.json({ valid: false, message: "Invalid API key — authentication failed" });
      } else if (response.ok || response.status === 429 || response.status === 400) {
        // 400 here means the key authenticated and the request itself was
        // rejected (e.g. an unavailable model), which still proves the key.
        res.json({ valid: true, message: `Connected to ${providerConfig.name} successfully` });
      } else {
        res.json({ valid: false, message: `${providerConfig.name} returned ${response.status}` });
      }
    } else {
      let urlToTest = `${providerConfig.baseUrl}/models`;
      response = await fetch(urlToTest, {
        method: "GET",
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });

      // Fallback for custom EC2 FastAPI servers that expose /health instead of /models
      if (response.status === 404 && provider === "self-hosted") {
        let baseHealthUrl = providerConfig.baseUrl.replace(/\/v1$/, ""); // Remove /v1 if present
        response = await fetch(`${baseHealthUrl}/health`, {
          method: "GET",
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(10000),
        });
      }

      if (response.ok) {
        res.json({ valid: true, message: `Connected to ${providerConfig.name} successfully` });
      } else {
        const body = await response.text();
        logger.warn({ provider, status: response.status, body }, "API key test failed");
        let errorMsg = `${providerConfig.name} returned ${response.status}`;
        if (response.status === 401) errorMsg = "Invalid API key — authentication failed";
        if (response.status === 403) errorMsg = "API key does not have permission";
        if (response.status === 429) errorMsg = "Rate limited — but key is valid";
        res.json({ valid: response.status === 429, message: errorMsg });
      }
    }
  } catch (err) {
    logger.error({ err, provider }, "API key test error");
    const message = err instanceof Error ? err.message : "Connection failed";
    res.json({ valid: false, message: `Could not reach ${providerConfig.name}: ${message}` });
  }
});

router.delete("/:provider", async (req, res) => {
  if (rejectInDemoMode(res)) return;
  try {
    const deleted = await apiKeyService.deleteApiKey(req.params.provider);
    if (!deleted) {
      res.status(404).json({ error: "No key stored for that provider" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to delete API key");
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
