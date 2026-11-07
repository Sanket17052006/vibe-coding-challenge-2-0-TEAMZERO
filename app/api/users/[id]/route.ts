import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireRole, canManageSport } from "../../../../lib/auth";
import { badRequest, errorResponse, readJsonBody } from "../../../../lib/http";
import { mutateStore, recordAudit } from "../../../../lib/store";
import { isSupportedSport } from "../../../../lib/sports";
import { canLinkPendingPlayer } from "../../../../lib/membership";

function normalizedName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole("coach");
    const { id } = await params;
    const body = await readJsonBody(request);
    if (!body) return badRequest("Send an account decision as a JSON object.");
    if (body.action === "coach-permissions" || body.action === "coach-access") {
      const result = await mutateStore(state => {
        const owner = state.users.find(user => user.id === actor.id && user.academyId === actor.academyId && user.role === "coach" && user.isOwner && user.status === "active");
        if (!owner) return { error: "Only the active academy owner can manage Coaches.", status: 403 };
        const coach = state.users.find(user => user.id === id && user.academyId === actor.academyId && user.role === "coach");
        if (!coach) return { error: "Coach not found.", status: 404 };
        if (body.action === "coach-permissions") {
          if (!Array.isArray(body.sports) || !body.sports.length || body.sports.some((sport: unknown) => typeof sport !== "string" || !isSupportedSport(sport))) return { error: "Select supported Coach sports.", status: 400 };
          coach.coachSports = [...new Set<string>(body.sports)];
          const academy = state.academies.find(entry => entry.id === actor.academyId);
          if (academy) academy.sports = [...new Set([...(academy.sports ?? []), ...coach.coachSports])];
        } else {
          if (coach.isOwner || coach.id === actor.id) return { error: "Transfer ownership before disabling the owner.", status: 409 };
          if (body.status !== "active" && body.status !== "declined") return { error: "Choose active or declined access.", status: 400 };
          if (body.status === "active" && coach.email && !coach.emailVerifiedAt) return { error: "The Coach must verify email first.", status: 409 };
          coach.status = body.status;
        }
        coach.sessionVersion = (coach.sessionVersion ?? 0) + 1;
        recordAudit(state, actor.id, String(body.action), coach.id, { sports: (coach.coachSports ?? []).join(", "), status: coach.status });
        return { ok: true };
      });
      return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result);
    }
    if (body.status !== "active" && body.status !== "declined") return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });

    const result = await mutateStore((state) => {
      const record = state.users.find((entry) => entry.id === id && entry.academyId === actor.academyId);
      if (!record) return { error: "Account not found.", httpStatus: 404 };
      if (record.status !== "pending") return { error: "This access request has already been decided.", httpStatus: 409 };
      if (record.role === "coach") return { error: "Coaches activate through email verification. Use Coach management to change their access.", httpStatus: 409 };

      if (body.status === "active" && !record.emailVerifiedAt) return { error: "The account must verify its email before approval.", httpStatus: 409 };
      if (record.role === "player" && body.status === "active") {
        if ((record.pendingPlayer?.sports ?? []).some((sport) => !canManageSport(actor, sport))) return { error: "You can only approve Player requests for sports assigned to you.", httpStatus: 403 };
        if (!record.pendingPlayer || typeof body.playerId !== "string" || !body.playerId.trim()) return { error: "Select the existing player record this registration belongs to.", httpStatus: 400 };
        const player = state.players.find((entry) => entry.academyId === actor.academyId && entry.id === body.playerId && entry.active);
        if (!player) return { error: "The selected active player record was not found.", httpStatus: 404 };
        if (!(player.sports ?? [player.sport]).every((sport) => canManageSport(actor, sport))) return { error: "Only the academy owner or a Coach responsible for every sport on this player record can link the account.", httpStatus: 403 };
        if (player.age !== record.pendingPlayer.age || normalizedName(player.name) !== normalizedName(record.displayName)) return { error: "The selected player record does not match the registered name and age.", httpStatus: 409 };
        if (!canLinkPendingPlayer(record, player, state.users)) return { error: "That player record is already linked to another account.", httpStatus: 409 };
        const academy = state.academies.find((entry) => entry.id === actor.academyId);
        if (!academy || record.pendingPlayer.sports.some((sport) => !isSupportedSport(sport) || !(academy.sports ?? []).includes(sport))) return { error: "The request includes a sport no longer offered by the academy.", httpStatus: 409 };

        player.userId = record.id;
        player.sports = player.sports ?? [player.sport];
        player.sportRequests = player.sportRequests ?? [];
        for (const sport of record.pendingPlayer.sports) {
          if (!player.sports.includes(sport) && !player.sportRequests.some((entry) => entry.sport === sport && entry.status === "pending")) {
            player.sportRequests.push({ id: randomUUID(), sport, status: "pending", requestedAt: new Date().toISOString() });
          }
        }
        record.playerId = player.id;
        delete record.pendingPlayer;
        recordAudit(state, actor.id, "player.account.linked", player.id, { userId: record.id });
      }

      record.status = body.status;
      record.sessionVersion = (record.sessionVersion ?? 0) + 1;
      recordAudit(state, actor.id, body.status === "active" ? "access.approved" : "access.declined", record.id, { role: record.role });
      return { id: record.id, username: record.username, displayName: record.displayName, role: record.role, status: record.status, playerId: record.playerId };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.httpStatus });
    return NextResponse.json({ user: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
