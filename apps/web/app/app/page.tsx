import { redirect } from "next/navigation";
import { verifySession } from "@/shared/lib/session";
import { getVaultStatus } from "@/features/vault/services/vault-status.service";
import { listChatsService, getChatMessagesService, listProjectsService } from "@/features/chat/services/chat.service";
import { listApiKeysService } from "@/features/keys/services/keys.service";
import { listModelsService } from "@/features/chat/services/models.service";
import { ChatView } from "@/features/chat/components/chat-view";
import { ChatMetadata, ChatMessageDto, AiApiKeyMetadata, AiModelMetadata, ProjectDto } from "@ai-vault/types";

export const dynamic = "force-dynamic";

interface AppPageProps {
  searchParams: Promise<{ c?: string; p?: string }>;
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
  let targetProjectId = resolvedSearchParams?.p || null;

  let chats: ChatMetadata[] = [];
  let projects: ProjectDto[] = [];
  let keys: AiApiKeyMetadata[] = [];
  let models: AiModelMetadata[] = [];
  let initialMessages: ChatMessageDto[] = [];
  let initialHasMore = false;
  let initialTotal = 0;

  try {
    const [chatsRes, projectsRes, keysRes, modelsRes] = await Promise.allSettled([
      listChatsService(100),
      listProjectsService(),
      listApiKeysService(),
      listModelsService(),
    ]);

    if (chatsRes.status === "fulfilled") {
      chats = chatsRes.value;
    }
    if (projectsRes.status === "fulfilled") {
      projects = projectsRes.value;
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
      if (messagesRes.chat?.projectId !== undefined) {
        targetProjectId = messagesRes.chat.projectId ?? null;
      }
    }
  } catch (err) {
    console.error("[AppPage] Error fetching initial data:", err);
  }

  return (
    <ChatView
      key={targetChatId || targetProjectId || "new-chat"}
      initialChats={chats}
      initialProjects={projects}
      initialKeys={keys}
      initialModels={models}
      initialChatId={targetChatId}
      initialProjectId={targetProjectId}
      initialMessages={initialMessages}
      initialHasMore={initialHasMore}
      initialTotal={initialTotal}
    />
  );
}
