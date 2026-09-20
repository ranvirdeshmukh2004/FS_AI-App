import express from "express";
import cors from "cors";
import { config, isProduction } from "./config/index.js";
import { validateEnv } from "./config/validate.js";
import { logger } from "./utils/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { prisma } from "./prisma/client.js";
import sessionRoutes from "./routes/sessions.js";
import chatRoutes from "./routes/chat.js";
import apiKeyRoutes from "./routes/apiKeys.js";
import providerRoutes from "./routes/providers.js";
import customEndpointRoutes from "./routes/customEndpoints.js";
import pdfUploadRoutes from "./routes/pdfUpload.js";
import ollamaRoutes from "./routes/ollama.js";

validateEnv();

const app = express();

// Render/Vercel terminate TLS upstream; trust one hop so client IPs and
// protocol detection are accurate for rate limiting.
app.set("trust proxy", 1);

app.use(
  cors({
    origin: config.corsOrigins === "*" ? true : config.corsOrigins,
    credentials: false,
    // BYOK keys ride in this header, so it must survive preflight.
    allowedHeaders: ["Content-Type", "x-provider-key"],
  })
);

// 50mb was sized for base64 PDF payloads that no longer go through JSON.
app.use(express.json({ limit: "1mb" }));

app.use("/api", rateLimit({ windowMs: 60_000, max: 120 }));
// Chat and uploads are the expensive paths, so they get a tighter budget.
app.use("/api/chat", rateLimit({ windowMs: 60_000, max: 20 }));
app.use("/api/pdf", rateLimit({ windowMs: 60_000, max: 10 }));

app.get("/api/health", async (_req, res) => {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch (err) {
    logger.error({ err }, "Health check: database unreachable");
  }

  res.status(database ? 200 : 503).json({
    status: database ? "ok" : "degraded",
    database,
    demoMode: config.demoMode,
    timestamp: new Date().toISOString(),
  });
});

// Lets the frontend adapt its UI (e.g. show the BYOK key field) without
// needing a matching build-time flag.
app.get("/api/config", (_req, res) => {
  res.json({
    demoMode: config.demoMode,
    pythonToolEnabled: config.enablePythonTool,
    maxUploadMb: config.maxUploadMb,
  });
});

app.use("/api/sessions", sessionRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/keys", apiKeyRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/custom-endpoints", customEndpointRoutes);
app.use("/api/pdf", pdfUploadRoutes);
app.use("/api/ollama", ollamaRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

const server = app.listen(config.port, () => {
  const dbUrl = process.env.DATABASE_URL || "(not set)";
  logger.info(`Backend running on port ${config.port} [${config.nodeEnv}]`);
  logger.info(`AI Services URL: ${config.aiServicesUrl}`);
  logger.info(
    `Database: ${dbUrl.startsWith("file:") ? dbUrl : dbUrl.replace(/:\/\/[^@]+@/, "://<credentials>@")}`
  );
  logger.info(
    config.demoMode
      ? "DEMO_MODE on — visitors supply their own API keys; nothing is stored server-side."
      : "DEMO_MODE off — API keys are stored encrypted in the database."
  );
  if (!isProduction) logger.info("Development mode: private-network endpoints allowed.");
});

// Free tiers stop and restart containers constantly; draining cleanly keeps
// in-flight SSE streams from being cut mid-token.
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down.`);
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
