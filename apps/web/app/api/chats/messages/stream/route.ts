import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "@/shared/lib/session";
import { VaultApiClient } from "@/shared/lib/vault-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    return NextResponse.json(
      { error: "Unauthorized: Please unlock the vault." },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
      return NextResponse.json(
        { error: "message is required and must be a non-empty string." },
        { status: 400 }
      );
    }

    const stream = await VaultApiClient.streamRequest(
      "POST",
      "/chats/messages/stream",
      {
        chatId: body.chatId,
        projectId: body.projectId,
        message: body.message,
        provider: body.provider,
        model: body.model,
        thinkingLevel: body.thinkingLevel,
        fileIds: body.fileIds,
      },
      { sessionToken }
    );

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: any) {
    console.error("Stream route error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to initiate chat stream." },
      { status: 500 }
    );
  }
}

