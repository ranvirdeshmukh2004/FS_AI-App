import { config, isProduction } from "./index.js";
import { logger } from "../utils/logger.js";

/**
 * Fail fast on misconfiguration instead of throwing a cryptic error on the
 * first request. Previously an unset ENCRYPTION_KEY let the server boot
 * happily and then die with "Invalid key length" the first time someone
 * saved an API key.
 */
export function validateEnv(): void {
  const fatal: string[] = [];
  const warn: string[] = [];

  if (!process.env.DATABASE_URL) {
    fatal.push("DATABASE_URL is not set — the database cannot be reached.");
  }

  // Only needed when keys are stored server-side; BYOK never encrypts anything.
  if (!config.demoMode) {
    if (!config.encryptionKey) {
      fatal.push(
        "ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32"
      );
    } else if (!/^[0-9a-fA-F]{64}$/.test(config.encryptionKey)) {
      fatal.push(
        `ENCRYPTION_KEY must be exactly 64 hex characters (got ${config.encryptionKey.length}). Generate one with: openssl rand -hex 32`
      );
    }
  }

  if (isProduction && config.corsOrigins === "*") {
    warn.push(
      "CORS_ORIGINS is unset in production — the API accepts requests from any origin. Set it to your frontend URL."
    );
  }

  if (isProduction && !config.demoMode) {
    warn.push(
      "Running in production with DEMO_MODE=false. Server-stored API keys are exposed to anyone who can reach this URL. Set DEMO_MODE=true for a public deployment."
    );
  }

  if (config.enablePythonTool && isProduction) {
    warn.push(
      "ENABLE_PYTHON_TOOL=true in production. The Python tool executes model-authored code; leave it off on a public deployment."
    );
  }

  for (const w of warn) logger.warn(w);

  if (fatal.length > 0) {
    for (const f of fatal) logger.error(f);
    logger.error("Refusing to start. Fix the issues above and try again.");
    process.exit(1);
  }
}
