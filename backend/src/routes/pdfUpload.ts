import { Router } from "express";
import multer from "multer";
import { getDecryptedKey } from "../services/apiKeyService.js";
import { logger } from "../utils/logger.js";

const AI_SERVICES_URL = process.env.AI_SERVICES_URL || "http://ai-services:8000";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const router = Router();

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const sessionId = req.body.sessionId;
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }

  // Try to get an embedding API key (optional — works without one)
  let embeddingKey = "";
  try {
    embeddingKey = await getDecryptedKey("openai") || await getDecryptedKey("openrouter") || "";
  } catch { /* fine, works without */ }

  try {
    const formData = new FormData();
    formData.append("file", new Blob([req.file.buffer as any], { type: "application/pdf" }), req.file.originalname);
    formData.append("session_id", sessionId);
    formData.append("embedding_api_key", embeddingKey);
    if (req.body.docId) formData.append("doc_id", req.body.docId);

    const response = await fetch(`${AI_SERVICES_URL}/api/pdf/process`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errBody = await response.text();
      logger.error({ status: response.status, body: errBody }, "PDF processing failed");
      res.status(response.status).json({ error: `Processing failed: ${errBody}` });
      return;
    }

    const result = await response.json();
    res.json(result);
  } catch (err) {
    logger.error({ err }, "PDF upload error");
    res.status(500).json({ error: "PDF processing failed" });
  }
});

export default router;
