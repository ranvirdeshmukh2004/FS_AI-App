import express from "express";
import cors from "cors";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import sessionRoutes from "./routes/sessions.js";
import chatRoutes from "./routes/chat.js";
import apiKeyRoutes from "./routes/apiKeys.js";
import providerRoutes from "./routes/providers.js";
import customEndpointRoutes from "./routes/customEndpoints.js";
import pdfUploadRoutes from "./routes/pdfUpload.js";
import ollamaRoutes from "./routes/ollama.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/sessions", sessionRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/keys", apiKeyRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/custom-endpoints", customEndpointRoutes);
app.use("/api/pdf", pdfUploadRoutes);
app.use("/api/ollama", ollamaRoutes);

app.use(errorHandler);

app.listen(config.port, () => {
  const aiUrl = process.env.AI_SERVICES_URL || "http://127.0.0.1:8000";
  const dbUrl = process.env.DATABASE_URL || "(not set)";
  logger.info(`Backend running on port ${config.port}`);
  logger.info(`AI Services URL: ${aiUrl}`);
  logger.info(`Database: ${dbUrl.startsWith("file:") ? dbUrl : dbUrl.replace(/:\/\/[^@]+@/, "://<credentials>@")}`);
});
