import { NextRequest, NextResponse } from "next/server";
import { canManageSport, requireRole } from "../../../../../lib/auth";
import { badRequest, errorResponse, readJsonBody } from "../../../../../lib/http";
import { mutateStore, recordAudit } from "../../../../../lib/store";
import { randomUUID } from "node:crypto";
import { isSupportedSport } from "../../../../../lib/sports";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole("player");
    const { id } = await params;
    if (actor.playerId !== id) return NextResponse.json({ error: "You can only request sports for your own player profile." }, { status: 403 });
    const body = await readJsonBody(request);
    if (!body || !Array.isArray(body.sports)) return badRequest("Choose one or more academy sports to request.");
    const sports = [...new Set(body.sports.map((value: unknown) => String(value).trim()))];
    if (!sports.length || sports.some((sport) => !isSupportedSport(sport))) return NextResponse.json({ error: "Choose at least one supported sport." }, { status: 400 });
    const result = await mutateStore((state) => {
      const player = state.players.find((entry) => entry.academyId === actor.academyId && entry.id === id && entry.userId === actor.id && entry.active);
      const academy = state.academies.find((entry) => entry.id === actor.academyId);
      if (!player || !academy) return { error: "Player profile or academy not found.", status: 404 };
      if (sports.some((sport) => !(academy.sports ?? []).includes(sport))) return { error: "Choose only sports currently offered by the academy.", status: 400 };
      player.sports = player.sports ?? [];
      player.sportRequests = player.sportRequests ?? [];
      const added: string[] = [];
      for (const sport of sports) {
        if (player.sports.includes(sport)) continue;
        const oldRequest = player.sportRequests.find((entry) => entry.sport === sport);
        if (oldRequest?.status === "pending") continue;
        if (oldRequest) { oldRequest.id = randomUUID(); oldRequest.status = "pending"; oldRequest.requestedAt = new Date().toISOString(); delete oldRequest.decidedAt; delete oldRequest.decidedBy; }
        else player.sportRequests.push({ id: randomUUID(), sport, status: "pending", requestedAt: new Date().toISOString() });
        added.push(sport);
      }
      recordAudit(state, actor.id, "player.sports.requested", player.id, { sports: added.join(", ") });
      return { requested: added };
    });
    return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole("coach");
    const { id } = await params;
    const body = await readJsonBody(request);
    if (!body || typeof body.requestId !== "string" || !["approved", "declined"].includes(body.status)) return badRequest("Choose approve or decline for this sport request.");
    const result = await mutateStore((state) => {
      const player = state.players.find((entry) => entry.academyId === actor.academyId && entry.id === id);
      const req = player?.sportRequests?.find((entry) => entry.id === body.requestId);
      if (!player || !req) return { error: "Sport request not found.", status: 404 };
      if (req.status !== "pending") return { error: "This sport request has already been decided.", status: 409 };
      const member = state.users.find((entry) => entry.id === player.userId && entry.academyId === actor.academyId && entry.role === "player" && entry.status === "active");
      if (!member || !player.active) return { error: "The Player account is no longer active. Ask them to rejoin before approving this sport request.", status: 409 };
      const academy = state.academies.find((entry) => entry.id === actor.academyId);
      if (!(academy?.sports ?? []).includes(req.sport)) return { error: "The academy no longer offers this sport.", status: 409 };
      if (!canManageSport(actor, req.sport)) return { error: "You can only decide requests for sports assigned to you.", status: 403 };
      req.status = body.status;
      req.decidedAt = new Date().toISOString();
      req.decidedBy = actor.id;
      if (body.status === "approved") {
        player.sports = player.sports ?? [];
        if (!player.sports.includes(req.sport)) player.sports.push(req.sport);
        player.sport = player.sports[0] ?? req.sport;
        player.active = true;
      }
      recordAudit(state, actor.id, `player.sport.${body.status}`, player.id, { sport: req.sport, requestId: req.id });
      return { playerId: player.id, sport: req.sport, decision: req.status };
    });
    return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
