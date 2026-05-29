import { Router } from "express";
import { z } from "zod";
import * as sessionService from "../services/sessionService.js";
import { streamChat } from "../services/chatService.js";
import { streamReactChat } from "../services/reactService.js";
import { logger } from "../utils/logger.js";

const router = Router();

const chatSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1),
  useTools: z.boolean().optional().default(false),
  searchEngine: z.enum(["duckduckgo", "google"]).optional().default("duckduckgo"),
  googleApiKey: z.string().optional(),
  googleCx: z.string().optional(),
});

router.post("/", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { sessionId, message, useTools, searchEngine, googleApiKey, googleCx } = parsed.data;

  const dbStartFetch = Date.now();
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
  const dbTimeFetch = Date.now() - dbStartFetch;

  const messages = [
    ...session.messages.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  if (useTools) {
    streamReactChat(
      session.provider,
      session.model,
      messages,
      searchEngine,
      googleApiKey,
      googleCx,
      (event) => {
        // Inject db_time into trace events
        if (event.type === "trace") {
          try {
            const traceData = JSON.parse(event.content);
            traceData.db_time = dbTimeFetch;
            event = { type: "trace", content: JSON.stringify(traceData) };
          } catch { /* pass through */ }
        }
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
      async (fullText) => {
        const dbStartSave = Date.now();
        try {
          await sessionService.addMessage(sessionId, "assistant", fullText);
        } catch (err) {
          logger.error({ err }, "Database error saving assistant message");
        }
        const dbTimeSave = Date.now() - dbStartSave;
        res.write(`data: ${JSON.stringify({ type: "done", content: fullText })}\n\n`);
        res.end();
      },
      (err) => {
        logger.error({ err }, "ReAct stream error");
        res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`);
        res.end();
      }
    );
  } else {
    const startTime = Date.now();
    streamChat(
      session.provider,
      session.model,
      messages,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
      },
      async (fullText, usage) => {
        const dbStartSave = Date.now();
        try {
          await sessionService.addMessage(sessionId, "assistant", fullText);
        } catch (err) {
          logger.error({ err }, "Database error saving assistant message");
        }
        const dbTimeSave = Date.now() - dbStartSave;
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

        const trace = JSON.stringify({
          steps: [{ type: "direct", content: "Answered directly without tools", duration: parseFloat(totalTime) }],
          tool_calls: 0,
          total_time: parseFloat(totalTime),
          input_tokens: usage.prompt_tokens || 0,
          output_tokens: usage.completion_tokens || 0,
          total_tokens: usage.total_tokens || 0,
          db_time: dbTimeFetch + dbTimeSave,
        });
        res.write(`data: ${JSON.stringify({ type: "trace", content: trace })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: "done", content: fullText })}\n\n`);
        res.end();
      },
      (err) => {
        logger.error({ err }, "Chat stream error");
        res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`);
        res.end();
      }
    );
  }
});

export default router;
