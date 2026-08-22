import { redirect } from "next/navigation";
import { verifySession } from "@/shared/lib/session";
import { getVaultStatus } from "@/features/vault/services/vault-status.service";
import { listApiKeysService } from "@/features/keys/services/keys.service";
import { KeysManager } from "@/features/keys/components/keys-manager";
import { AiApiKeyMetadata } from "@ai-vault/types";

export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const isValidSession = await verifySession();
  if (!isValidSession) {
    redirect("/");
  }

  const status = await getVaultStatus();
  if (status.status !== "UNLOCKED") {
    redirect("/");
  }

  let keys: AiApiKeyMetadata[] = [];
  try {
    keys = await listApiKeysService();
  } catch (err) {
    console.error("[KeysPage] Error loading keys:", err);
  }

  return (
    <div className="min-h-screen bg-[#0e0f12] text-neutral-100 flex flex-col">
      <KeysManager initialKeys={keys} />
    </div>
  );
}


