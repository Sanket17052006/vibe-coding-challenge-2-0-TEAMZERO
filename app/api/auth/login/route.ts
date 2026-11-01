import { NextRequest, NextResponse } from "next/server";
import { setLoginCookie, verifyPassword, publicUser } from "../../../../lib/auth";
import { getStore } from "../../../../lib/store";
import { badRequest, errorResponse, readJsonBody } from "../../../../lib/http";
import { rateLimit } from "../../../../lib/rate-limit";
export async function POST(request: NextRequest) {
  try {
  const body = await readJsonBody(request); if (!body) return badRequest("Send your login details as a same-origin JSON object under 32 KB.");
  const username = String(body.username || "").trim().toLowerCase();
  const ipLimit = await rateLimit(request, "login-ip", "", 80, 15 * 60 * 1000);
  if (ipLimit) return ipLimit;
  const accountLimit = await rateLimit(request, "login-account", username, 12, 15 * 60 * 1000);
  if (accountLimit) return accountLimit;
  const password = String(body.password || "");
  if (!username || !password) return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  const user = (await getStore()).users.find((entry) => entry.username.toLowerCase() === username);
  if (!user || user.status !== "active" || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
    return NextResponse.json({ error: "Username or password is incorrect. If your account is pending, ask the coach to approve it." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  await setLoginCookie(user);
  return NextResponse.json({ user: publicUser(user) });
  } catch (error) { return errorResponse(error); }
}
