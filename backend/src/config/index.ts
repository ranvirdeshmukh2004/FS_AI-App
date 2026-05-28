import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  aiServicesUrl: process.env.AI_SERVICES_URL || "http://localhost:8000",
  encryptionKey: process.env.ENCRYPTION_KEY || "",
} as const;
