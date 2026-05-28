import { prisma } from "../prisma/client.js";

export async function listSessions() {
  return prisma.chatSession.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      provider: true,
      model: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
}

export async function getSession(id: string) {
  return prisma.chatSession.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function createSession(provider: string, model: string, title?: string) {
  return prisma.chatSession.create({
    data: {
      title: title || "New Chat",
      provider,
      model,
    },
  });
}

export async function updateSessionTitle(id: string, title: string) {
  return prisma.chatSession.update({
    where: { id },
    data: { title },
  });
}

export async function deleteSession(id: string) {
  return prisma.chatSession.delete({ where: { id } });
}

export async function addMessage(
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string,
  tokens?: number
) {
  const message = await prisma.message.create({
    data: { sessionId, role, content, tokens },
  });

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  });

  return message;
}
