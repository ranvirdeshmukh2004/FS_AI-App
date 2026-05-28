import { Router } from "express";
import * as sessionService from "../services/sessionService.js";
import { z } from "zod";
import { logger } from "../utils/logger.js";

const router = Router();

const createSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  title: z.string().optional(),
});

const updateTitleSchema = z.object({
  title: z.string().min(1),
});

router.get("/", async (_req, res) => {
  try {
    const sessions = await sessionService.listSessions();
    res.json(sessions);
  } catch (err) {
    logger.error({ err }, "Failed to list sessions");
    res.status(500).json({ error: "Database error. Run: docker compose exec backend npx prisma db push" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const session = await sessionService.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(session);
  } catch (err) {
    logger.error({ err }, "Failed to get session");
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const session = await sessionService.createSession(
      parsed.data.provider,
      parsed.data.model,
      parsed.data.title
    );
    res.status(201).json(session);
  } catch (err) {
    logger.error({ err }, "Failed to create session");
    res.status(500).json({ error: "Failed to create session. Check database connection." });
  }
});

router.patch("/:id/title", async (req, res) => {
  const parsed = updateTitleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const session = await sessionService.updateSessionTitle(req.params.id, parsed.data.title);
    res.json(session);
  } catch (err) {
    logger.error({ err }, "Failed to update session title");
    res.status(500).json({ error: "Database error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await sessionService.deleteSession(req.params.id);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to delete session");
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
