import { Router } from "express";
import { z } from "zod";
import * as endpointService from "../services/customEndpointService.js";
import { logger } from "../utils/logger.js";

const router = Router();

const createSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  modelId: z.string().min(1),
  modelName: z.string().min(1),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  modelId: z.string().min(1).optional(),
  modelName: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

// List all custom endpoints
router.get("/", async (_req, res) => {
  try {
    const endpoints = await endpointService.listEndpoints();
    // Mask API keys in response
    res.json(
      endpoints.map((e) => ({
        ...e,
        apiKey: e.apiKey ? e.apiKey.slice(0, 4) + "..." + e.apiKey.slice(-4) : null,
      }))
    );
  } catch (err) {
    logger.error({ err }, "Failed to list custom endpoints");
    res.status(500).json({ error: "Database error" });
  }
});

// Create endpoint
router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const endpoint = await endpointService.createEndpoint(parsed.data);
    res.status(201).json(endpoint);
  } catch (err) {
    logger.error({ err }, "Failed to create custom endpoint");
    res.status(500).json({ error: "Failed to create endpoint" });
  }
});

// Test endpoint connectivity
router.post("/test", async (req, res) => {
  const { baseUrl, apiKey } = req.body;
  if (!baseUrl) {
    res.status(400).json({ valid: false, message: "Missing baseUrl" });
    return;
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    // Try /v1/models (vLLM, text-generation-inference, etc.)
    const modelsUrl = baseUrl.replace(/\/+$/, "") + "/models";
    const response = await fetch(modelsUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const data = await response.json();
      const models = data.data?.map((m: { id: string }) => m.id) || [];
      res.json({
        valid: true,
        message: `Connected! Found ${models.length} model(s)`,
        models,
      });
    } else {
      const body = await response.text();
      res.json({
        valid: false,
        message: `Server returned ${response.status}: ${body.slice(0, 200)}`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    res.json({ valid: false, message: `Cannot reach server: ${message}` });
  }
});

// Update endpoint
router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const endpoint = await endpointService.updateEndpoint(req.params.id, parsed.data);
    res.json(endpoint);
  } catch (err) {
    logger.error({ err }, "Failed to update custom endpoint");
    res.status(500).json({ error: "Failed to update endpoint" });
  }
});

// Delete endpoint
router.delete("/:id", async (req, res) => {
  try {
    await endpointService.deleteEndpoint(req.params.id);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to delete custom endpoint");
    res.status(500).json({ error: "Failed to delete endpoint" });
  }
});

export default router;
