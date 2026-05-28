import { Router } from "express";
import { z } from "zod";
import * as apiKeyService from "../services/apiKeyService.js";

const router = Router();

const upsertSchema = z.object({
  provider: z.string().min(1),
  key: z.string().min(1),
  label: z.string().optional(),
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

router.delete("/:provider", async (req, res) => {
  await apiKeyService.deleteApiKey(req.params.provider);
  res.status(204).end();
});

export default router;
