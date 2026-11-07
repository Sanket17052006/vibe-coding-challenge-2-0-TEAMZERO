import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody } from "../../../../lib/http";
import { mutateStore } from "../../../../lib/store";
import { consumeVerification } from "../../../../lib/email-auth";
import { rateLimit } from "../../../../lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const token = String(body?.token ?? "");
    if (!token || token.length > 200) return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
    const limited = await rateLimit(request, "verify-consume", "", 20, 15 * 60 * 1000); if (limited) return limited;
    const result = await mutateStore((state) => consumeVerification(state, token));
    return result ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
  } catch (error) { return errorResponse(error); }
}
