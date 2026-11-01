import { NextRequest, NextResponse } from "next/server";
import { hashPassword, getStore, mutateStore, recordAudit } from "../../../../lib/store";
import { setLoginCookie, publicUser, verifyPassword } from "../../../../lib/auth";
import { User } from "../../../../lib/types";
import { randomUUID } from "node:crypto";
import { badRequest, errorResponse, readJsonBody } from "../../../../lib/http";
import { rateLimit } from "../../../../lib/rate-limit";
import { isSupportedSport } from "../../../../lib/sports";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (!body) return badRequest("Send account details as a same-origin JSON object under 32 KB.");
    const limited = await rateLimit(request, "signup", "", 20, 60 * 60 * 1000);
    if (limited) return limited;

    const username = String(body.username || "").trim().toLowerCase();
    const displayName = String(body.displayName || "").trim();
    const password = String(body.password || "");
    const role = String(body.role || "");
    const academyMode = role === "coach" ? String(body.academyMode || "create") : "join";
    if (!/^[a-z0-9._-]{3,32}$/.test(username) || displayName.length < 2 || displayName.length > 60 || password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: "Use a name (2–60 characters), a username (3–32 letters, numbers, dot, underscore, or dash), and a password (8–128 characters)." }, { status: 400 });
    }
    if (!["coach", "player", "scout"].includes(role)) return NextResponse.json({ error: "Choose Coach, Player, or Scout." }, { status: 400 });
    if (role === "coach" && !["create", "join"].includes(academyMode)) return NextResponse.json({ error: "Choose whether to create an academy or join one." }, { status: 400 });

    const createsAcademy = role === "coach" && academyMode === "create";
    const academyCode = String(body.academyCode || "").trim().toUpperCase();
    const playerId = String(body.playerId || "").trim().toUpperCase();
    const age = Number(body.age);
    const requestedSports = Array.isArray(body.sports) ? [...new Set(body.sports.map((value: unknown) => String(value).trim()))] : [];
    const current = await getStore();
    const previousAccount = current.users.find((user) => user.username.toLowerCase() === username);
    const rejoining = previousAccount?.status === "left";
    if (previousAccount && !rejoining) return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    if (rejoining && (previousAccount.role !== role || !(await verifyPassword(password, previousAccount.passwordSalt, previousAccount.passwordHash)))) return NextResponse.json({ error: "That username is already taken or the account details are incorrect." }, { status: 409 });
    if (rejoining && createsAcademy) return NextResponse.json({ error: "To restore this account, join the same academy with its academy code." }, { status: 400 });

    const targetAcademy = createsAcademy ? null : current.academies.find((academy) => academy.code === academyCode) ?? null;
    if (!createsAcademy && !targetAcademy) return NextResponse.json({ error: "No academy found for that code. Check the code shared by the Coach." }, { status: 404 });
    if (rejoining && previousAccount.academyId !== targetAcademy?.id) return NextResponse.json({ error: "This account can only rejoin its previous academy." }, { status: 409 });
    const academySports = targetAcademy?.sports ?? [];
    if (role === "player" && (!Number.isInteger(age) || age < 5 || age > 50 || !requestedSports.length || requestedSports.some((sport) => !academySports.includes(sport) || !isSupportedSport(sport)))) return NextResponse.json({ error: "Enter an age from 5 to 50 and request at least one sport offered by this academy." }, { status: 400 });
    if (role === "coach" && !createsAcademy && (!requestedSports.length || requestedSports.some((sport) => !academySports.includes(sport) || !isSupportedSport(sport)))) return NextResponse.json({ error: "Select at least one sport offered by this academy to request Coach access." }, { status: 400 });
    if (role === "player" && playerId && !current.players.some((player) => player.academyId === targetAcademy?.id && player.id === playerId && (player.active || (rejoining && player.userId === previousAccount?.id)))) return NextResponse.json({ error: "That Player ID is not available in this academy." }, { status: 400 });

    const credentials = await hashPassword(password);
    const result = await mutateStore((state) => {
      const existing = state.users.find((user) => user.username.toLowerCase() === username);
      if (existing) {
        if (existing.status !== "left" || !rejoining || existing.role !== role || existing.academyId !== targetAcademy?.id || !(existing.passwordSalt === previousAccount?.passwordSalt && existing.passwordHash === previousAccount?.passwordHash) || (role === "player" && playerId && existing.playerId !== playerId)) return { error: "That username is already taken or the account details are incorrect.", status: 409 };
        const academy = state.academies.find((entry) => entry.id === existing.academyId && entry.code === academyCode);
        if (!academy) return { error: "Enter the code for the academy this account previously belonged to.", status: 400 };
        existing.status = "pending";
        existing.sessionVersion = (existing.sessionVersion ?? 0) + 1;
        if (role === "coach") existing.coachSports = requestedSports;
        const player = existing.playerId && state.players.find((entry) => entry.academyId === academy.id && entry.id === existing.playerId);
        if (player) {
          player.active = false;
          player.sportRequests = player.sportRequests ?? [];
          for (const sport of requestedSports) if (!(player.sports ?? []).includes(sport) && !player.sportRequests.some((entry) => entry.sport === sport && entry.status === "pending")) player.sportRequests.push({ id: randomUUID(), sport, status: "pending", requestedAt: new Date().toISOString() });
        }
        recordAudit(state, existing.id, "access.rejoin_requested", existing.id, { role: existing.role });
        return { user: existing };
      }

      let academy = createsAcademy ? null : state.academies.find((entry) => entry.code === academyCode) ?? null;
      if (!createsAcademy && !academy) return { error: "The academy code was not found. Refresh and try again.", status: 409 };
      if (createsAcademy) {
        const academyName = String(body.academyName || "").trim();
        const location = String(body.location || "").trim();
        if (academyName.length < 2 || academyName.length > 80 || location.length > 100) return { error: "Enter an academy name (2–80 characters) and a location under 100 characters.", status: 400 };
        const id = randomUUID();
        let code = `EXR-${id.slice(0, 4).toUpperCase()}-${id.slice(4, 8).toUpperCase()}`;
        while (state.academies.some((entry) => entry.code === code)) code = `EXR-${randomUUID().slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
        academy = { id: `academy-${id}`, name: academyName, location, code, sports: [], createdAt: new Date().toISOString() };
        state.academies.push(academy);
      }

      if (role === "player" && requestedSports.some((sport) => !(academy!.sports ?? []).includes(sport))) return { error: "One of those sports is no longer offered by the academy. Refresh and choose again.", status: 409 };
      if (role === "coach" && !createsAcademy && requestedSports.some((sport) => !(academy!.sports ?? []).includes(sport))) return { error: "One of those sports is no longer offered by the academy. Refresh and choose again.", status: 409 };
      const linkedPlayer = role === "player" ? (playerId ? state.players.find((entry) => entry.academyId === academy!.id && entry.id === playerId) : undefined) : undefined;
      if (role === "player" && playerId && (!linkedPlayer || linkedPlayer.userId)) return { error: "That Player ID is already linked to an account or unavailable.", status: 409 };
      let playerRecord = linkedPlayer;
      if (role === "player" && !playerRecord) {
        const next = Math.max(0, ...state.players.map((entry) => Number(entry.id.replace(/\D/g, "")) || 0)) + 1;
        playerRecord = { id: `EX-${String(next).padStart(3, "0")}`, academyId: academy!.id, name: displayName, age, sport: requestedSports[0], sports: [], sportRequests: [], active: true, createdAt: new Date().toISOString() };
        state.players.push(playerRecord);
      }
      if (role === "player" && playerRecord) {
        if (!playerId) { playerRecord.name = displayName; playerRecord.age = age; }
        playerRecord.active = true;
        playerRecord.sports = playerRecord.sports ?? [];
        playerRecord.sportRequests = playerRecord.sportRequests ?? [];
        for (const sport of requestedSports) if (!playerRecord.sports.includes(sport) && !playerRecord.sportRequests.some((entry) => entry.sport === sport && entry.status === "pending")) playerRecord.sportRequests.push({ id: randomUUID(), sport, status: "pending", requestedAt: new Date().toISOString() });
      }
      const isFirstCoach = role === "coach" && createsAcademy;
      const user: User = {
        id: randomUUID(), academyId: academy!.id, username, displayName, role: role as User["role"],
        status: isFirstCoach || role === "player" && !playerId ? "active" : "pending",
        playerId: role === "player" ? playerRecord?.id : undefined,
        coachSports: role === "coach" && !isFirstCoach ? requestedSports : undefined,
        isOwner: isFirstCoach,
        passwordHash: credentials.hash, passwordSalt: credentials.salt, createdAt: new Date().toISOString(),
      };
      state.users.push(user);
      recordAudit(state, user.id, isFirstCoach ? "academy.created" : role === "player" ? "player.profile.created" : "access.requested", user.id, { role, sports: role === "coach" ? requestedSports.join(", ") : null });
      if (role === "player" && playerRecord) {
        playerRecord.userId = user.id;
        for (const sport of requestedSports) if (!(playerRecord.sports ?? []).includes(sport)) recordAudit(state, user.id, "player.sport.requested", playerRecord.id, { sport });
      }
      return { user };
    });

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    if (result.user.status === "active") await setLoginCookie(result.user);
    return NextResponse.json({ user: publicUser(result.user), pending: result.user.status === "pending" }, { status: result.user.status === "pending" ? 202 : 201 });
  } catch (error) { return errorResponse(error); }
}
