import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { hashPassword, getStore, mutateStore, recordAudit } from "../../../../lib/store";
import { publicUser, verifyPassword } from "../../../../lib/auth";
import { type Role } from "../../../../lib/types";
import { badRequest, errorResponse, readJsonBody } from "../../../../lib/http";
import { rateLimit } from "../../../../lib/rate-limit";
import { isSupportedSport } from "../../../../lib/sports";
import { hasDuplicateEmail, issueToken, normalizeEmail, sendAuthEmail, validEmail } from "../../../../lib/email-auth";
import { configuredAcademyRecord, resolveAcademyIdentity } from "../../../../lib/single-academy";
import { buildPendingAccount } from "../../../../lib/membership";

const VERIFY_EXPIRY_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (!body) return badRequest("Send account details as a same-origin JSON object under 32 KB.");
    const limited = await rateLimit(request, "signup", "", 20, 60 * 60 * 1000);
    if (limited) return limited;

    const username = String(body.username ?? "").trim().toLowerCase();
    const displayName = String(body.displayName ?? "").normalize("NFKC").trim();
    const password = String(body.password ?? "");
    const email = normalizeEmail(body.email);
    const roleValue = String(body.role ?? "");
    if (roleValue !== "coach" && roleValue !== "player" && roleValue !== "scout") return NextResponse.json({ error: "Choose Coach, Player, or Scout." }, { status: 400 });
    const role: Role = roleValue;
    if (!validEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (!/^[a-z0-9._-]{3,32}$/.test(username) || displayName.length < 2 || displayName.length > 60 || password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: "Use a name (2–60 characters), a username (3–32 letters, numbers, dot, underscore, or dash), and a password (8–128 characters)." }, { status: 400 });
    }

    const age = Number(body.age);
    const requestedSports = Array.isArray(body.sports) ? [...new Set(body.sports.map((value: unknown) => String(value).trim()))] : [];
    if (role === "player" && (!Number.isInteger(age) || age < 5 || age > 50 || !requestedSports.length)) {
      return NextResponse.json({ error: "Enter an age from 5 to 50 and request at least one sport offered by KhelGrid." }, { status: 400 });
    }
    if (requestedSports.some((sport) => !isSupportedSport(sport))) return NextResponse.json({ error: "Choose sports from the KhelGrid catalogue." }, { status: 400 });

    const current = await getStore();
    const academyIdentity = resolveAcademyIdentity(current);
    const academySports = current.academies.find((academy) => academy.id === academyIdentity.id)?.sports ?? [];
    if (role === "player" && requestedSports.some((sport) => !academySports.includes(sport))) {
      return NextResponse.json({ error: "One or more requested sports are not currently offered. Ask the Coach about available sports." }, { status: 400 });
    }
    const previousAccount = current.users.find((user) => user.username === username);
    const rejoining = previousAccount?.status === "left";
    if (previousAccount && !rejoining) return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    if (rejoining && (previousAccount.role !== role || previousAccount.email !== email || !(await verifyPassword(password, previousAccount.passwordSalt, previousAccount.passwordHash)))) {
      return NextResponse.json({ error: "That username is already taken or the account details are incorrect." }, { status: 409 });
    }
    if (hasDuplicateEmail(current.users, email, rejoining ? previousAccount.id : undefined)) return NextResponse.json({ error: "That email address is already in use." }, { status: 409 });
    if (role === "coach" && current.academies.length && (!requestedSports.length && current.academies[0].sports?.length)) {
      return NextResponse.json({ error: "Select at least one sport you coach." }, { status: 400 });
    }
    if (role === "coach" && requestedSports.some((sport) => !academySports.includes(sport))) {
      return NextResponse.json({ error: "Select sports currently offered by KhelGrid." }, { status: 400 });
    }
    if (role === "player" && current.users.some((user) =>
      user.id !== previousAccount?.id && user.role === "player" && user.status === "pending" &&
      user.pendingPlayer?.age === age && user.displayName.normalize("NFKC").trim().toLocaleLowerCase("en-US") === displayName.toLocaleLowerCase("en-US"),
    )) {
      return NextResponse.json({ error: "A pending registration for these player details already exists. Contact the Coach if this is a different person." }, { status: 409 });
    }

    const credentials = await hashPassword(password);
    const result = await mutateStore((state) => {
      const identity = resolveAcademyIdentity(state);
      let academy = state.academies.find((entry) => entry.id === identity.id);
      if (hasDuplicateEmail(state.users, email, rejoining ? previousAccount?.id : undefined)) return { error: "That email address is already in use.", status: 409 };
      const currentUser = state.users.find((user) => user.username === username);
      if (currentUser && (!rejoining || currentUser.id !== previousAccount?.id || currentUser.status !== "left")) return { error: "That username is already taken.", status: 409 };
      if (role === "player" && state.users.some((user) =>
        user.id !== currentUser?.id && user.role === "player" && user.status === "pending" &&
        user.pendingPlayer?.age === age && user.displayName.normalize("NFKC").trim().toLocaleLowerCase("en-US") === displayName.toLocaleLowerCase("en-US"),
      )) return { error: "A pending registration for these player details already exists. Contact the Coach if this is a different person.", status: 409 };
      if (role === "player" && requestedSports.some((sport) => !(academy?.sports ?? []).includes(sport))) return { error: "One or more requested sports are no longer offered.", status: 409 };
      if (role === "coach" && requestedSports.some((sport) => !(academy?.sports ?? []).includes(sport))) return { error: "One or more selected sports are no longer offered.", status: 409 };
      if (!academy) {
        academy = configuredAcademyRecord(identity, []);
        state.academies.push(academy);
      }

      if (currentUser && rejoining) {
        currentUser.status = "pending";
        currentUser.email = email;
        currentUser.sessionVersion = (currentUser.sessionVersion ?? 0) + 1;
        if (currentUser.role === "coach") currentUser.coachSports = currentUser.isOwner ? undefined : requestedSports;
        recordAudit(state, currentUser.id, "access.rejoin_requested", currentUser.id, { role: currentUser.role });
        return { user: currentUser, needsVerification: !currentUser.emailVerifiedAt };
      }

      const isFirstCoach = role === "coach" && !state.users.some((user) => user.academyId === academy!.id && user.role === "coach" && user.isOwner && user.status !== "declined" && user.status !== "left");
      const user = buildPendingAccount({
        id: randomUUID(), academyId: academy.id, username, displayName, email, role,
        passwordHash: credentials.hash, passwordSalt: credentials.salt,
        createdAt: new Date().toISOString(), isFirstCoach, requestedSports,
        ...(role === "player" ? { age } : {}),
      });
      state.users.push(user);
      recordAudit(state, user.id, isFirstCoach ? "academy.owner.registered" : "access.requested", user.id, {
        role,
        sports: requestedSports.join(", "),
      });
      return { user, needsVerification: true };
    });

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    let emailSent = !result.needsVerification;
    let emailMessage = "";
    if (result.needsVerification) {
      const token = await issueToken(result.user.id, "verify", VERIFY_EXPIRY_MS);
      try {
        await sendAuthEmail("verify", email, token);
        emailSent = true;
      } catch {
        emailSent = false;
        emailMessage = "Your account request was saved, but verification email delivery failed. Correct the email configuration and request a new verification link.";
      }
    }
    return NextResponse.json({
      user: publicUser(result.user),
      pending: result.user.status === "pending",
      requiresApproval: !(result.user.role === "coach" && result.user.isOwner),
      emailSent,
      emailMessage,
    }, { status: result.user.status === "pending" ? 202 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
