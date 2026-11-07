import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody } from "../../../../lib/http";
import { hashPassword, mutateStore } from "../../../../lib/store";
import { consumePasswordReset } from "../../../../lib/email-auth";
import { rateLimit } from "../../../../lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request); if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const token = String(body.token ?? ""), password = String(body.password ?? ""), confirm = String(body.confirmPassword ?? "");
    const limited = await rateLimit(request, "reset-consume", "", 10, 15 * 60 * 1000); if (limited) return limited;
    if (password.length < 8 || password.length > 128 || password !== confirm) return NextResponse.json({ error: "Passwords must match and contain 8 to 128 characters." }, { status: 400 });
    const credentials = await hashPassword(password);
    const result = await mutateStore((state) => consumePasswordReset(state, token, credentials));
    return result ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "This reset link is invalid or expired. Request a new one." }, { status: 400 });
  } catch (error) { return errorResponse(error); }
}
