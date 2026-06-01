import { prisma } from "../prisma/client.js";

export async function listEndpoints() {
  return prisma.customEndpoint.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function getEndpoint(id: string) {
  return prisma.customEndpoint.findUnique({ where: { id } });
}

export async function createEndpoint(data: {
  name: string;
  baseUrl: string;
  apiKey?: string;
  modelId: string;
  modelName: string;
}) {
  return prisma.customEndpoint.create({ data });
}

export async function updateEndpoint(
  id: string,
  data: {
    name?: string;
    baseUrl?: string;
    apiKey?: string;
    modelId?: string;
    modelName?: string;
    active?: boolean;
  }
) {
  return prisma.customEndpoint.update({ where: { id }, data });
}

export async function deleteEndpoint(id: string) {
  return prisma.customEndpoint.delete({ where: { id } });
}
