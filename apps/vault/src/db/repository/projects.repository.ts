import { getPrismaClient } from "../client.js";
import { Prisma, projects } from "@prisma/client";
import { randomUUID } from "node:crypto";

export async function createProjectRecord(data: Prisma.projectsCreateInput): Promise<projects> {
  const prisma = getPrismaClient();
  return prisma.projects.create({
    data: {
      ...data,
      id: data.id || randomUUID(),
      encryption_version: data.encryption_version ?? 1,
      status: data.status ?? "ACTIVE",
    },
  });
}

export async function getProjectRecordById(id: string): Promise<projects | null> {
  const prisma = getPrismaClient();
  return prisma.projects.findUnique({
    where: { id },
  });
}

export async function getAllProjectsRecords(): Promise<projects[]> {
  const prisma = getPrismaClient();
  return prisma.projects.findMany({
    where: { status: "ACTIVE" },
    orderBy: { created_at: "asc" },
  });
}

export async function updateProjectRecord(
  id: string,
  data: Partial<Prisma.projectsCreateInput>
): Promise<projects> {
  const prisma = getPrismaClient();
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([_, v]) => v !== undefined)
  );
  return prisma.projects.update({
    where: { id },
    data: {
      ...cleanData,
      updated_at: new Date(),
    },
  });
}

export async function deleteProjectRecord(id: string): Promise<projects> {
  const prisma = getPrismaClient();
  return prisma.projects.delete({
    where: { id },
  });
}
