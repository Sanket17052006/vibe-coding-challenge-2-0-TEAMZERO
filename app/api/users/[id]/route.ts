import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth";
import { badRequest, errorResponse, readJsonBody } from "../../../../lib/http";
import { mutateStore, recordAudit } from "../../../../lib/store";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole("coach");
    const { id } = await params; const body = await readJsonBody(request); if (!body) return badRequest("Send an account decision as a JSON object.");
    if (!["active", "declined"].includes(body.status)) return NextResponse.json({ error: "Choose approve or decline." }, { status: 400 });
    const user = await mutateStore((state) => {
      const record = state.users.find((entry) => entry.id === id && entry.academyId === actor.academyId); if (!record) return null;
      if (record.role === "coach" && !actor.isOwner) return { forbidden: true as const };
      if (record.status !== "pending") return { conflict: true as const };
      const academy = state.academies.find((entry) => entry.id === actor.academyId);
      if (record.role === "coach" && body.status === "active" && (record.coachSports ?? []).some((sport) => !(academy?.sports ?? []).includes(sport))) return { conflict: true as const };
      record.status = body.status;
      if (body.status === "active" && record.role === "player" && record.playerId) { const player = state.players.find((entry) => entry.academyId === actor.academyId && entry.id === record.playerId); if (player) player.active = true; }
      recordAudit(state, actor.id, body.status === "active" ? "access.approved" : "access.declined", record.id, { role: record.role });
      if (body.status === "declined" && record.playerId) { const player = state.players.find((p) => p.academyId === actor.academyId && p.id === record.playerId); if (player?.userId === record.id) { delete player.userId; for (const req of player.sportRequests ?? []) if (req.status === "pending") { req.status = "declined"; req.decidedAt = new Date().toISOString(); req.decidedBy = actor.id; } } }
      return { id: record.id, username: record.username, displayName: record.displayName, role: record.role, status: record.status, playerId: record.playerId };
    });
    if (user && "forbidden" in user) return NextResponse.json({ error: "Only the academy owner can approve or decline Coach access." }, { status: 403 });
    if (user && "conflict" in user) return NextResponse.json({ error: "This access request has already been decided." }, { status: 409 });
    return user ? NextResponse.json({ user }) : NextResponse.json({ error: "Account not found." }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}
