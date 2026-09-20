import "dotenv/config";

function parseOrigins(raw: string | undefined): string[] | "*" {
  if (!raw || raw.trim() === "*") return "*";
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

/**
 * DEMO_MODE is what makes a public deployment safe.
 *
 * On  — visitors supply their own provider key with each request (BYOK).
 *       Nothing is ever persisted server-side, so a public URL cannot leak
 *       or spend anybody's credits.
 * Off — keys live encrypted in the database. Intended for running this
 *       locally or on your own hardware, where you are the only user.
 */
export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  aiServicesUrl: process.env.AI_SERVICES_URL || "http://localhost:8000",
  encryptionKey: process.env.ENCRYPTION_KEY || "",
  demoMode: process.env.DEMO_MODE === "true",
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || "10", 10),
  enablePythonTool: process.env.ENABLE_PYTHON_TOOL === "true",
} as const;

export const isProduction = config.nodeEnv === "production";
