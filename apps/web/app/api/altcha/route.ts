import { NextResponse } from "next/server";
import { createChallenge } from "altcha-lib/v1";
import { getAltchaSecret } from "@/shared/lib/altcha-secret";

export async function GET() {
  try {
    const challenge = await createChallenge({
      hmacKey: getAltchaSecret(),
      maxNumber: 100000,
    });
    
    return NextResponse.json(challenge);
  } catch (error) {
    console.error("Failed to generate Altcha challenge:", error);
    return NextResponse.json({ error: "Failed to generate challenge" }, { status: 500 });
  }
}
