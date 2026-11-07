import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody } from "../../../../lib/http";
import { getStore } from "../../../../lib/store";
import { normalizeEmail, issueToken, sendAuthEmail, genericForgotPasswordResult, waitForMinimumDuration } from "../../../../lib/email-auth";
import { rateLimit, rateLimitByIdentity } from "../../../../lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request); if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const startedAt = Date.now();
    const email = normalizeEmail(body.email);
    const ipLimit = await rateLimit(request, "reset-ip", "", 10, 15 * 60 * 1000); if (ipLimit) return ipLimit;
    const emailLimit = await rateLimitByIdentity(request, "reset-email", email, 5, 60 * 60 * 1000); if (emailLimit) return emailLimit;
    const user = (await getStore()).users.find((entry) => entry.email?.toLowerCase() === email && !!entry.emailVerifiedAt);
    if (user) { const token = await issueToken(user.id, "reset", 30 * 60 * 1000); try { await sendAuthEmail("reset", email, token); } catch { /* Keep the response indistinguishable to prevent email enumeration. */ } }
    // A minimum duration reduces the obvious fast/slow branch. Synchronous SMTP latency can still vary.
    await waitForMinimumDuration(startedAt, 1000);
    const result = genericForgotPasswordResult();
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
