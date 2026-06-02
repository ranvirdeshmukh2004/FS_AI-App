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

app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`Backend running on port ${config.port}`);
});
