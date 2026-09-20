import { Router } from "express";
import { providers } from "../config/providers.js";
import * as endpointService from "../services/customEndpointService.js";
import { logger } from "../utils/logger.js";
import { OLLAMA_BASE } from "./ollama.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const builtIn = providers.map((p) => ({
      id: p.id,
      name: p.name,
      models: p.defaultModels,
    }));

    // Ollama — dynamically load installed models
    try {
      const r = await fetch(`${OLLAMA_BASE}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) {
        const data = await r.json() as { models?: { name: string; model: string }[] };
        const ollamaModels = (data.models || []).map((m) => ({
          id: m.model || m.name,
          name: m.name,
        }));
        if (ollamaModels.length > 0) {
          builtIn.push({ id: "ollama", name: "Ollama (Local)", models: ollamaModels });
        }
      }
    } catch { /* Ollama not running — silently skip */ }

    // Custom self-hosted endpoints grouped as "Self-Hosted" provider
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

    res.json(builtIn);
  } catch (err) {
    logger.error({ err }, "Failed to load providers");
    res.json(providers.map((p) => ({ id: p.id, name: p.name, models: p.defaultModels })));
  }
});

export default router;
