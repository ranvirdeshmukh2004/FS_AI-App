import { Router } from "express";
import { z } from "zod";
import * as apiKeyService from "../services/apiKeyService.js";
import { getProviderConfig } from "../config/providers.js";
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

router.get("/", async (_req, res) => {
  const keys = await apiKeyService.listApiKeys();
  res.json(keys);
});

router.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await apiKeyService.upsertApiKey(parsed.data.provider, parsed.data.key, parsed.data.label);
  res.status(200).json({ message: "API key saved" });
});

router.post("/test", async (req, res) => {
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ valid: false, error: "Missing provider or key" });
    return;
  }

  const { provider, key } = parsed.data;
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
          model: "claude-3-5-haiku-20241022",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (response.status === 401 || response.status === 403) {
        res.json({ valid: false, message: "Invalid API key — authentication failed" });
      } else {
        res.json({ valid: true, message: `Connected to ${providerConfig.name} successfully` });
      }
    } else {
      response = await fetch(`${providerConfig.baseUrl}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });

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
  await apiKeyService.deleteApiKey(req.params.provider);
  res.status(204).end();
});

export default router;
