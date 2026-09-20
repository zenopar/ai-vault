import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "@/shared/lib/session";
import { VaultApiClient } from "@/shared/lib/vault-client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    return new NextResponse("Unauthorized: Please unlock the vault.", { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return new NextResponse("File ID is required.", { status: 400 });
  }

  try {
    const vaultRes = await VaultApiClient.requestBinary(
      "GET",
      `/files/${encodeURIComponent(id)}`,
      undefined,
      { sessionToken }
    );

    if (vaultRes.error || !vaultRes.data) {
      return new NextResponse(vaultRes.error || "File not found.", {
        status: vaultRes.statusCode || 404,
      });
    }

    const headers = new Headers();
    headers.set("Content-Type", vaultRes.contentType || "application/octet-stream");
    if (vaultRes.contentDisposition) {
      headers.set("Content-Disposition", vaultRes.contentDisposition);
    }
    headers.set("Cache-Control", "private, max-age=86400");

    return new NextResponse(new Uint8Array(vaultRes.data), {
      status: 200,
      headers,
    });
  } catch (err: any) {
    console.error("File download route error:", err);
    return new NextResponse(err.message || "Internal server error.", { status: 500 });
  }
}
