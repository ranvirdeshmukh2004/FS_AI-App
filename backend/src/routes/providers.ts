import { Router } from "express";
import { providers, getProviderConfig } from "../config/providers.js";
import * as endpointService from "../services/customEndpointService.js";
import { resolveApiKey } from "../services/keyResolver.js";
import { checkOutboundUrl } from "../utils/urlGuard.js";
import { logger } from "../utils/logger.js";
import { OLLAMA_BASE } from "./ollama.js";

const router = Router();

interface ProviderListItem {
  id: string;
  name: string;
  models: { id: string; name: string }[];
}

router.get("/", async (_req, res) => {
  const builtIn: ProviderListItem[] = providers.map((p) => ({
    id: p.id,
    name: p.name,
    models: p.defaultModels,
  }));

  // Ollama — only present when a local daemon is actually running. On a
  // hosted deployment there is none, so this silently contributes nothing.
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (r.ok) {
      const data = (await r.json()) as { models?: { name: string; model: string }[] };
      const ollamaModels = (data.models || []).map((m) => ({
        id: m.model || m.name,
        name: m.name,
      }));
      if (ollamaModels.length > 0) {
        builtIn.push({ id: "ollama", name: "Ollama (Local)", models: ollamaModels });
      }
    }
  } catch {
    /* Ollama not running — expected off a dev machine. */
  }

  // Custom self-hosted endpoints, grouped as one "Self-Hosted" provider.
  try {
    const customEndpoints = await endpointService.listEndpoints();
    const activeEndpoints = customEndpoints.filter((e) => e.active);
    if (activeEndpoints.length > 0) {
      builtIn.push({
        id: "self-hosted",
        name: "Self-Hosted",
        models: activeEndpoints.map((e) => ({
          id: `custom:${e.id}`,
          name: e.modelName,
        })),
      });
    }
  } catch (err) {
    // A database hiccup shouldn't hide the built-in providers.
    logger.error({ err }, "Failed to load custom endpoints");
  }

  res.json(builtIn);
});

/**
 * Live model catalogue for one provider.
 *
 * Hardcoded model lists go stale the moment a provider ships something new,
 * which is how an invalid ID ends up in the picker. When a key is available
 * we ask the provider directly and fall back to the static list otherwise.
 */
router.get("/:id/models", async (req, res) => {
  const providerConfig = getProviderConfig(req.params.id);
  if (!providerConfig) {
    res.status(404).json({ error: `Unknown provider: ${req.params.id}` });
    return;
  }

  const fallback = {
    models: providerConfig.defaultModels,
    live: false,
  };

  if (!providerConfig.supportsModelListing) {
    res.json(fallback);
    return;
  }

  const apiKey = await resolveApiKey(req, providerConfig.id);
  if (!apiKey) {
    res.json(fallback);
    return;
  }

  const guard = checkOutboundUrl(providerConfig.baseUrl);
  if (!guard.ok) {
    res.json(fallback);
    return;
  }

  try {
    const r = await fetch(`${providerConfig.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!r.ok) {
      res.json(fallback);
      return;
    }

    const data = (await r.json()) as { data?: { id: string; name?: string }[] };
    const models = (data.data || [])
      .filter((m) => typeof m.id === "string")
      .map((m) => ({ id: m.id, name: m.name || m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(models.length > 0 ? { models, live: true } : fallback);
  } catch (err) {
    logger.warn({ err, provider: providerConfig.id }, "Live model listing failed");
    res.json(fallback);
  }
});

export default router;
