import { prisma } from "../prisma/client.js";
import { encrypt, decrypt } from "../utils/crypto.js";

export async function listApiKeys() {
  const keys = await prisma.apiKey.findMany({
    orderBy: { provider: "asc" },
  });

  return keys.map((k) => {
    // A row can fail to decrypt if ENCRYPTION_KEY was rotated or the row was
    // written by another deployment. One bad row used to 500 the whole
    // settings page; flag it instead so the user can delete and re-add it.
    let keyPreview: string;
    let corrupt = false;
    try {
      keyPreview = maskKey(decrypt(k.key));
    } catch {
      keyPreview = "(unreadable)";
      corrupt = true;
    }

    return {
      id: k.id,
      provider: k.provider,
      label: k.label,
      keyPreview,
      corrupt,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
    };
  });
}

export async function getDecryptedKey(provider: string): Promise<string | null> {
  const record = await prisma.apiKey.findUnique({ where: { provider } });
  if (!record) return null;
  try {
    return decrypt(record.key);
  } catch {
    // Treated as "no key configured" — the caller surfaces a clear message.
    return null;
  }
}

export async function upsertApiKey(provider: string, key: string, label?: string) {
  const encrypted = encrypt(key);
  return prisma.apiKey.upsert({
    where: { provider },
    update: { key: encrypted, label },
    create: { provider, key: encrypted, label },
  });
}

/** Returns false when there was nothing to delete, so the route can 404. */
export async function deleteApiKey(provider: string): Promise<boolean> {
  const result = await prisma.apiKey.deleteMany({ where: { provider } });
  return result.count > 0;
}

function maskKey(key: string): string {
  // Short keys would otherwise be revealed almost in full by a 4+4 slice.
  if (key.length <= 12) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}
