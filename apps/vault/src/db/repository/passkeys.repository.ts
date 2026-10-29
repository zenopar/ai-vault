import { getPrismaClient } from "../client.js";
import { Prisma, passkeys } from "@prisma/client";
import { randomUUID } from "node:crypto";

export async function createPasskeyRecord(data: Prisma.passkeysCreateInput): Promise<passkeys> {
  const prisma = getPrismaClient();
  return prisma.passkeys.create({
    data: {
      ...data,
      id: data.id || randomUUID(),
    },
  });
}

export async function listPasskeyRecords(): Promise<passkeys[]> {
  const prisma = getPrismaClient();
  return prisma.passkeys.findMany({
    orderBy: { created_at: "desc" },
  });
}

export async function countPasskeyRecords(): Promise<number> {
  const prisma = getPrismaClient();
  return prisma.passkeys.count();
}

export async function findPasskeyByCredentialId(credentialId: string): Promise<passkeys | null> {
  const prisma = getPrismaClient();
  return prisma.passkeys.findUnique({
    where: { credential_id: credentialId },
  });
}

export async function updatePasskeyLastUsed(id: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.passkeys.update({
    where: { id },
    data: { last_used_at: new Date() },
  });
}

export async function deletePasskeyById(id: string): Promise<boolean> {
  const prisma = getPrismaClient();
  const res = await prisma.passkeys.deleteMany({
    where: { id },
  });
  return res.count > 0;
}
