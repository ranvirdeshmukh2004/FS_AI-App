import { Router } from "express";
import { z } from "zod";
import * as sessionService from "../services/sessionService.js";
import { streamChat } from "../services/chatService.js";
import { streamReactChat } from "../services/reactService.js";
import { resolveApiKey, resolveEmbeddingKey } from "../services/keyResolver.js";
import { logger } from "../utils/logger.js";

const router = Router();

const chatSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1),
  useTools: z.boolean().optional().default(false),
  useOrchestrator: z.boolean().optional().default(true),
  maxTokens: z.number().int().min(64).max(4096).optional().default(512),
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

  const { sessionId, message, useTools, useOrchestrator, maxTokens, searchEngine, googleApiKey, googleCx } = parsed.data;

  // Embeddings (doc_search) are optional — the PDF pipeline degrades to
  // local hash embeddings when no key is available.
  const embeddingApiKey = await resolveEmbeddingKey(req);

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

  // The caller's own key (BYOK) when supplied; a stored key otherwise.
  const providerKey = await resolveApiKey(req, session.provider);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // nginx (and Render's proxy) buffer responses by default, which holds
  // every token back until the stream ends. This opts that off.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // If the visitor closes the tab we abort the upstream request rather than
  // paying for tokens nobody will read.
  const abort = new AbortController();
  let clientGone = false;
  req.on("close", () => {
    if (res.writableEnded) return;
    clientGone = true;
    abort.abort();
    logger.info({ sessionId }, "Client disconnected, aborting stream");
  });

  const send = (payload: unknown) => {
    if (clientGone || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const finish = () => {
    if (!res.writableEnded) res.end();
  };

  if (useTools) {
    let traceData: Record<string, unknown> | null = null;

    streamReactChat(
      session.provider,
      session.model,
      messages,
      searchEngine,
      googleApiKey,
      googleCx,
      useOrchestrator,
      sessionId,
      embeddingApiKey,
      maxTokens,
      (event) => {
        if (event.type === "trace") {
          try {
            const parsed = JSON.parse(event.content);
            parsed.db_time = dbTimeFetch;
            traceData = parsed;
            event = { type: "trace", content: JSON.stringify(parsed) };
          } catch { /* pass through */ }
        }
        send(event);
      },
      async (fullText) => {
        // Still persist a partial answer when the client vanished mid-stream.
        try {
          if (fullText) {
            await sessionService.addMessage(sessionId, "assistant", fullText, undefined, traceData ?? undefined);
          }
        } catch (err) {
          logger.error({ err }, "Database error saving assistant message");
        }
        send({ type: "done", content: fullText });
        finish();
      },
      (err) => {
        logger.error({ err }, "ReAct stream error");
        send({ type: "error", content: err.message });
        finish();
      },
      providerKey,
      abort.signal
    );
  } else {
    const startTime = Date.now();
    streamChat(
      session.provider,
      session.model,
      messages,
      maxTokens,
      (chunk) => {
        send({ type: "chunk", content: chunk });
      },
      async (fullText, usage) => {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const traceObj = {
          steps: [{ type: "direct", content: "Answered directly without tools", duration: parseFloat(totalTime) }],
          tool_calls: 0,
          total_time: parseFloat(totalTime),
          input_tokens: usage.prompt_tokens || 0,
          output_tokens: usage.completion_tokens || 0,
          total_tokens: usage.total_tokens || 0,
          db_time: dbTimeFetch,
        };

        try {
          if (fullText) {
            await sessionService.addMessage(sessionId, "assistant", fullText, undefined, traceObj);
          }
        } catch (err) {
          logger.error({ err }, "Database error saving assistant message");
        }

        send({ type: "trace", content: JSON.stringify(traceObj) });
        send({ type: "done", content: fullText });
        finish();
      },
      (err) => {
        logger.error({ err }, "Chat stream error");
        send({ type: "error", content: err.message });
        finish();
      },
      providerKey,
      abort.signal
    );
  }
});

export default router;
