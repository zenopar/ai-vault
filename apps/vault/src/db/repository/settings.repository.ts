import { getPrismaClient } from "../client.js";
import { randomUUID } from "node:crypto";

import { getPrismaClient } from "../client.js";
import { Prisma, settings } from "@prisma/client";
import { randomUUID } from "node:crypto";

export async function getSettingsRecord(): Promise<settings | null> {
  const prisma = getPrismaClient();
  const settingsRecord = await prisma.settings.findFirst();
  return settingsRecord;
}

export async function upsertSettingsRecord(data: Prisma.settingsUpdateInput | Prisma.settingsCreateInput): Promise<settings> {
  const prisma = getPrismaClient();
  const existing = await prisma.settings.findFirst();

  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([_, v]) => v !== undefined)
  );

  if (existing) {
    return prisma.settings.update({
      where: { id: existing.id },
      data: {
        ...cleanData,
        updated_at: new Date(),
      },
    });
  } else {
    return prisma.settings.create({
      data: {
        ...(cleanData as Prisma.settingsCreateInput),
        id: randomUUID(),
        encryption_version: 1,
      },
    });
  }
}

