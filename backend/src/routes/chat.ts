import { Router } from "express";
import { z } from "zod";
import * as sessionService from "../services/sessionService.js";
import { streamChat } from "../services/chatService.js";
import { logger } from "../utils/logger.js";

const router = Router();

const chatSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1),
});

router.post("/", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { sessionId, message } = parsed.data;

  let session;
  try {
    session = await sessionService.getSession(sessionId);
  } catch (err) {
    logger.error({ err }, "Database error fetching session");
    res.status(500).json({ error: "Database error. Check database connection." });
    return;
  }

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  try {
    await sessionService.addMessage(sessionId, "user", message);
  } catch (err) {
    logger.error({ err }, "Database error saving user message");
    res.status(500).json({ error: "Failed to save message to database." });
    return;
  }

  const messages = [
    ...session.messages.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  streamChat(
    session.provider,
    session.model,
    messages,
    (chunk) => {
      res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
    },
    async (fullText) => {
      try {
        await sessionService.addMessage(sessionId, "assistant", fullText);
      } catch (err) {
        logger.error({ err }, "Database error saving assistant message");
      }
      res.write(`data: ${JSON.stringify({ type: "done", content: fullText })}\n\n`);
      res.end();
    },
    (err) => {
      logger.error({ err }, "Chat stream error");
      res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`);
      res.end();
    }
  );
});

export default router;
