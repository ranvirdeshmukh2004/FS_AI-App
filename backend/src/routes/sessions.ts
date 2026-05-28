import { Router } from "express";
import * as sessionService from "../services/sessionService.js";
import { z } from "zod";

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
  const sessions = await sessionService.listSessions();
  res.json(sessions);
});

router.get("/:id", async (req, res) => {
  const session = await sessionService.getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(session);
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const session = await sessionService.createSession(
    parsed.data.provider,
    parsed.data.model,
    parsed.data.title
  );
  res.status(201).json(session);
});

router.patch("/:id/title", async (req, res) => {
  const parsed = updateTitleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const session = await sessionService.updateSessionTitle(req.params.id, parsed.data.title);
  res.json(session);
});

router.delete("/:id", async (req, res) => {
  await sessionService.deleteSession(req.params.id);
  res.status(204).end();
});

export default router;
