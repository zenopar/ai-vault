import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "@/shared/lib/session";
import { VaultApiClient } from "@/shared/lib/vault-client";
import type { ListChatFilesResponse } from "@ai-vault/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    return NextResponse.json({ error: "Unauthorized: Please unlock the vault." }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Chat ID is required." }, { status: 400 });
  }

  try {
    const response = await VaultApiClient.sendGetRequest<ListChatFilesResponse>(
      `/chats/${encodeURIComponent(id)}/files`,
      { sessionToken }
    );

    if (response.error || !response.data?.success) {
      return NextResponse.json(
        { error: response.error || response.data?.error || "Failed to list chat files." },
        { status: 500 }
      );
    }

    return NextResponse.json(response.data);
  } catch (err: any) {
    console.error("List chat files route error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to list chat files." },
      { status: 500 }
    );
  }
}
