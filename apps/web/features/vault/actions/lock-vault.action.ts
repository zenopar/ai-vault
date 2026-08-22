"use server";

import { redirect } from "next/navigation";
import { destroySession } from "@/shared/lib/session";

export async function lockVaultAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
