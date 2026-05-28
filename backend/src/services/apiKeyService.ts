import { prisma } from "../prisma/client.js";
import { encrypt, decrypt } from "../utils/crypto.js";

export async function listApiKeys() {
  const keys = await prisma.apiKey.findMany({
    orderBy: { provider: "asc" },
  });
  return keys.map((k) => ({
    id: k.id,
    provider: k.provider,
    label: k.label,
    keyPreview: maskKey(decrypt(k.key)),
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  }));
}

export async function getDecryptedKey(provider: string): Promise<string | null> {
  const record = await prisma.apiKey.findUnique({ where: { provider } });
  if (!record) return null;
  return decrypt(record.key);
}

export async function upsertApiKey(provider: string, key: string, label?: string) {
  const encrypted = encrypt(key);
  return prisma.apiKey.upsert({
    where: { provider },
    update: { key: encrypted, label },
    create: { provider, key: encrypted, label },
  });
}

export async function deleteApiKey(provider: string) {
  return prisma.apiKey.delete({ where: { provider } });
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}
