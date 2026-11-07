import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody } from "../../../../lib/http";
import { getStore } from "../../../../lib/store";
import { normalizeEmail, issueToken, sendAuthEmail } from "../../../../lib/email-auth";
import { rateLimit, rateLimitByIdentity } from "../../../../lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request); if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const email = normalizeEmail(body.email);
    const ipLimit = await rateLimit(request, "verify-ip", "", 10, 15 * 60 * 1000); if (ipLimit) return ipLimit;
    const emailLimit = await rateLimitByIdentity(request, "verify-email", email, 5, 60 * 60 * 1000); if (emailLimit) return emailLimit;
    const user = (await getStore()).users.find((entry) => entry.email?.toLowerCase() === email && !entry.emailVerifiedAt);
    if (!user) return NextResponse.json({ message: "If this account needs verification, an email will be sent." });
    const token = await issueToken(user.id, "verify", 86400000);
    try { await sendAuthEmail("verify", email, token); } catch { /* Do not claim delivery; leave the user able to request a fresh link. */ }
    return NextResponse.json({ message: "If this account needs verification, a new email will be sent when delivery is available." });
  } catch (error) { return errorResponse(error); }
}
