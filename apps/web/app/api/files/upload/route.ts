import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "@/shared/lib/session";
import { VaultApiClient } from "@/shared/lib/vault-client";
import type { UploadFileResponse } from "@ai-vault/types";

export async function POST(req: NextRequest) {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    return NextResponse.json({ error: "Unauthorized: Please unlock the vault." }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const chatId = formData.get("chatId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided in form data." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const customHeaders: Record<string, string> = {
      "x-file-name": encodeURIComponent(file.name),
      "x-mime-type": file.type || "application/octet-stream",
      "Content-Type": file.type || "application/octet-stream",
    };

    if (chatId) {
      customHeaders["x-chat-id"] = chatId;
    }

    const vaultRes = await VaultApiClient.requestBinary("POST", "/files/upload", buffer, {
      sessionToken,
      customHeaders,
    });

    if (vaultRes.error || !vaultRes.data) {
      console.error("Vault upload returned error:", vaultRes.statusCode, vaultRes.error);
      return NextResponse.json(
        { error: vaultRes.error || "Failed to upload file to Vault." },
        { status: vaultRes.statusCode || 500 }
      );
    }

    const result = JSON.parse(vaultRes.data.toString("utf-8")) as UploadFileResponse;
    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    console.error("Upload route error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process file upload." },
      { status: 500 }
    );
  }
}
