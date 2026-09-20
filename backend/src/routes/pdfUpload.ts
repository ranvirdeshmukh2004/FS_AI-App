import { Router } from "express";
import multer from "multer";
import { resolveEmbeddingKey } from "../services/keyResolver.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

const AI_SERVICES_URL = config.aiServicesUrl;

/**
 * Uploads are buffered in memory before being forwarded, so the cap has to
 * fit the container. Free tiers give ~512MB total; the old 100MB limit
 * reliably OOM-killed the process. MAX_UPLOAD_MB tunes it per environment.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are supported"));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

const uploadSingle = upload.single("file");

// multer reports limit/type violations through the error path; translate
// them into a message the user can act on instead of a generic 500.
function handleUpload(req: import("express").Request, res: import("express").Response, next: () => void) {
  uploadSingle(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const code = (err as { code?: string }).code;
    if (code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: `PDF is too large. The limit is ${config.maxUploadMb}MB.` });
      return;
    }
    const message = err instanceof Error ? err.message : "Upload failed";
    res.status(400).json({ error: message });
  });
}

router.post("/upload", handleUpload, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const sessionId = req.body.sessionId;
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }

  // Optional — the pipeline falls back to local hash embeddings without it.
  const embeddingKey = (await resolveEmbeddingKey(req)) || "";

  try {
    const formData = new FormData();
    formData.append("file", new Blob([req.file.buffer as any], { type: "application/pdf" }), req.file.originalname);
    formData.append("session_id", sessionId);
    formData.append("embedding_api_key", embeddingKey);
    if (req.body.docId) formData.append("doc_id", req.body.docId);

    const response = await fetch(`${AI_SERVICES_URL}/api/pdf/process`, {
      method: "POST",
      body: formData,
      // Large PDFs take a while to chunk and embed, but an unbounded wait
      // ties up a worker on a single-instance free tier.
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errBody = await response.text();
      logger.error({ status: response.status, body: errBody }, "PDF processing failed");
      res.status(502).json({ error: "Could not process that PDF. It may be scanned, encrypted, or corrupt." });
      return;
    }

    const result = await response.json();
    res.json(result);
  } catch (err) {
    logger.error({ err }, "PDF upload error");
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    res.status(timedOut ? 504 : 500).json({
      error: timedOut
        ? "PDF processing timed out. Try a smaller document."
        : "PDF processing failed. The document service may be starting up — wait a moment and retry.",
    });
  }
});

export default router;
