import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { hashPassword, mutateStore, recordAudit } from "../../../../lib/store";
import { publicUser, verifyPassword } from "../../../../lib/auth";
import type { Role } from "../../../../lib/types";
import { badRequest, errorResponse, readJsonBody } from "../../../../lib/http";
import { rateLimit } from "../../../../lib/rate-limit";
import { SPORTS, isSupportedSport } from "../../../../lib/sports";
import { hasDuplicateEmail, issueToken, normalizeEmail, sendAuthEmail, validEmail } from "../../../../lib/email-auth";
import { reserveAcademyIdentity } from "../../../../lib/single-academy";
import { buildPendingAccount } from "../../../../lib/membership";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (!body) return badRequest("Send account details as a same-origin JSON object under 32 KB.");
    const limited = await rateLimit(request, "signup", "", 20, 60 * 60 * 1000);
    if (limited) return limited;
    const username = String(body.username ?? "").trim().toLowerCase();
    const displayName = String(body.displayName ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
    const password = String(body.password ?? "");
    const email = normalizeEmail(body.email);
    const roleValue = String(body.role ?? "");
    if (roleValue !== "coach" && roleValue !== "player" && roleValue !== "scout") return badRequest("Choose Coach, Player, or Scout.");
    const role: Role = roleValue;
    if (!validEmail(email)) return badRequest("Enter a valid email address.");
    if (!/^[a-z0-9._-]{3,32}$/.test(username) || displayName.length < 2 || displayName.length > 60 || password.length < 8 || password.length > 128) return badRequest("Use a name (2–60 characters), username (3–32 letters, numbers, dot, underscore, or dash), and password (8–128 characters).");
    const requestedSports = Array.isArray(body.sports) ? [...new Set(body.sports.map((value: unknown) => String(value).trim()))] : [];
    if (!requestedSports.length || requestedSports.length > SPORTS.length || requestedSports.some(sport => !isSupportedSport(sport))) return badRequest("Select at least one sport from the KhelGrid catalogue.");
    const age = Number(body.age);
    if (role === "player" && (!Number.isInteger(age) || age < 5 || age > 50 || requestedSports.length !== 1)) return badRequest("Enter an age from 5 to 50 and select one primary sport.");
    const credentials = await hashPassword(password);
    const result = await mutateStore(async state => {
      const previous = state.users.find(user => user.username.toLowerCase() === username);
      const rejoining = previous?.status === "left";
      if (previous && !rejoining) return { error: "That username is already taken.", status: 409 };
      if (previous && (previous.role !== role || normalizeEmail(previous.email) !== email || !(await verifyPassword(password, previous.passwordSalt, previous.passwordHash)))) return { error: "That username is taken or the account details are incorrect.", status: 409 };
      if (hasDuplicateEmail(state.users, email, previous?.id)) return { error: "That email address is already in use.", status: 409 };
      if (role === "player" && state.users.some(user => user.id !== previous?.id && user.role === "player" && user.status === "pending" && user.pendingPlayer?.age === age && user.displayName.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() === displayName.toLowerCase())) return { error: "A pending registration for these player details already exists. Contact the Coach if this is a different person.", status: 409 };
      const academyId = reserveAcademyIdentity(state);
      const user = buildPendingAccount({ id: previous?.id ?? randomUUID(), academyId, username, displayName, email, role, passwordHash: credentials.hash, passwordSalt: credentials.salt, createdAt: new Date().toISOString(), requestedSports, ...(role === "player" ? { age } : {}) });
      if (previous) {
        // Keep the existing roster identity/history; require a fresh verification for rejoining.
        Object.assign(previous, { status: "pending", displayName, pendingPlayer: user.pendingPlayer, coachSports: user.coachSports, scoutSports: user.scoutSports, isOwner: false, sessionVersion: (previous.sessionVersion ?? 0) + 1 });
        delete previous.emailVerifiedAt;
        recordAudit(state, previous.id, "access.rejoin_requested", previous.id, { role });
        return { user: previous };
      }
      state.users.push(user);
      recordAudit(state, user.id, "access.requested", user.id, { role, sports: requestedSports.join(", ") });
      return { user };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    const token = await issueToken(result.user.id, "verify", 24 * 60 * 60 * 1000);
    let emailSent = false;
    try { await sendAuthEmail("verify", email, token); emailSent = true; } catch { /* Account stays pending; the user can resend after SMTP is restored. */ }
    return NextResponse.json({ user: publicUser(result.user), pending: true, requiresApproval: role !== "coach", emailSent, emailMessage: emailSent ? "" : "Your registration was saved, but the verification email could not be submitted. Request a new link after email delivery is restored." }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
