import { redirect } from "next/navigation";
import { verifySession } from "@/shared/lib/session";
import { getVaultStatus } from "@/features/vault/services/vault-status.service";
import { listChatsService, getChatMessagesService } from "@/features/chat/services/chat.service";
import { listApiKeysService } from "@/features/keys/services/keys.service";
import { listModelsService } from "@/features/chat/services/models.service";
import { ChatView } from "@/features/chat/components/chat-view";
import { ChatMetadata, ChatMessageDto, AiApiKeyMetadata, AiModelMetadata } from "@ai-vault/types";

export const dynamic = "force-dynamic";

interface AppPageProps {
  searchParams: Promise<{ c?: string }>;
}

export default async function AppPage({ searchParams }: AppPageProps) {
  const isValidSession = await verifySession();
  if (!isValidSession) {
    redirect("/");
  }

  const status = await getVaultStatus();
  if (status.status !== "UNLOCKED") {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const targetChatId = resolvedSearchParams?.c || null;

  let chats: ChatMetadata[] = [];
  let keys: AiApiKeyMetadata[] = [];
  let models: AiModelMetadata[] = [];
  let initialMessages: ChatMessageDto[] = [];
  let initialHasMore = false;
  let initialTotal = 0;

  try {
    const [chatsRes, keysRes, modelsRes] = await Promise.allSettled([
      listChatsService(),
      listApiKeysService(),
      listModelsService(),
    ]);

    if (chatsRes.status === "fulfilled") {
      chats = chatsRes.value;
    }
    if (keysRes.status === "fulfilled") {
      keys = keysRes.value;
    }
    if (modelsRes.status === "fulfilled") {
      models = modelsRes.value;
    }

    if (targetChatId) {
      const messagesRes = await getChatMessagesService(targetChatId, 30, 0, "desc");
      // Since messages are retrieved newest-first (desc), reverse for top-to-bottom reading order
      initialMessages = (messagesRes.messages || []).slice().reverse();
      initialHasMore = messagesRes.hasMore;
      initialTotal = messagesRes.total;
    }
  } catch (err) {
    console.error("[AppPage] Error fetching initial data:", err);
  }

  return (
    <ChatView
      key={targetChatId || "new-chat"}
      initialChats={chats}
      initialKeys={keys}
      initialModels={models}
      initialChatId={targetChatId}
      initialMessages={initialMessages}
      initialHasMore={initialHasMore}
      initialTotal={initialTotal}
    />
  );
}
