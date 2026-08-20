import { redirect } from "next/navigation";
import { verifySession } from "@/shared/lib/session";
import { getVaultStatus } from "@/features/vault/services/vault-status.service";
import { listChatsService } from "@/features/chat/services/chat.service";
import { listApiKeysService } from "@/features/keys/services/keys.service";
import { ChatInterface } from "@/features/chat/components/chat-interface";
import { ChatMetadata, AiApiKeyMetadata } from "@ai-vault/types";

export const dynamic = "force-dynamic";

export default async function AppDashboard() {
  const isValidSession = await verifySession();

  if (!isValidSession) {
    redirect("/");
  }

  const status = await getVaultStatus();

  if (status.status !== "UNLOCKED") {
    redirect("/");
  }

  let chats: ChatMetadata[] = [];
  let keys: AiApiKeyMetadata[] = [];

  try {
    const [fetchedChats, fetchedKeys] = await Promise.all([
      listChatsService().catch(() => []),
      listApiKeysService().catch(() => []),
    ]);
    chats = fetchedChats;
    keys = fetchedKeys;
  } catch (error) {
    console.error("[AppDashboard] Failed to fetch initial data:", error);
  }

  return <ChatInterface initialChats={chats} initialKeys={keys} />;
}
