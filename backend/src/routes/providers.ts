import { Router } from "express";
import { providers } from "../config/providers.js";
import * as endpointService from "../services/customEndpointService.js";
import { logger } from "../utils/logger.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    // Built-in providers
    const builtIn = providers.map((p) => ({
      id: p.id,
      name: p.name,
      models: p.defaultModels,
    }));

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
    // Fallback to built-in only
    res.json(
      providers.map((p) => ({
        id: p.id,
        name: p.name,
        models: p.defaultModels,
      }))
    );
  }
});

export default router;
