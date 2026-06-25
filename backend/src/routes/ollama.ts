import { Router } from "express";
import { logger } from "../utils/logger.js";

const router = Router();
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

router.get("/status", async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    res.json({ running: r.ok });
  } catch {
    res.json({ running: false });
  }
});

router.get("/models", async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      res.status(503).json({ error: "Ollama not reachable" });
      return;
    }
    const data = await r.json() as { models?: unknown[] };
    res.json(data.models || []);
  } catch (err) {
    logger.error({ err }, "Ollama models fetch failed");
    res.status(503).json({ error: "Ollama not running" });
  }
});

router.post("/pull", async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name) {
    res.status(400).json({ error: "Model name required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const r = await fetch(`${OLLAMA_BASE}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, stream: true }),
    });

    if (!r.ok || !r.body) {
      res.write(`data: ${JSON.stringify({ error: "Failed to start pull" })}\n\n`);
      res.end();
      return;
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const line of text.split("\n").filter(Boolean)) {
        try {
          const data = JSON.parse(line);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch { /* skip malformed */ }
      }
    }

    res.write(`data: ${JSON.stringify({ status: "success" })}\n\n`);
    res.end();
  } catch (err) {
    logger.error({ err }, "Ollama pull failed");
    res.write(`data: ${JSON.stringify({ error: "Pull failed" })}\n\n`);
    res.end();
  }
});

router.delete("/models/:name", async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      res.status(204).end();
    } else {
      res.status(r.status).json({ error: "Failed to delete model" });
    }
  } catch (err) {
    logger.error({ err }, "Ollama delete failed");
    res.status(503).json({ error: "Ollama not running" });
  }
});

export { OLLAMA_BASE };
export default router;
