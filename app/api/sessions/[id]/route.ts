import { NextRequest, NextResponse } from "next/server";
import { canManageSport, requireRole } from "../../../../lib/auth";
import { badRequest, errorResponse, readJsonBody } from "../../../../lib/http";
import { mutateStore, recordAudit } from "../../../../lib/store";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requireRole("coach"); const { id } = await params; const body = await readJsonBody(request); if (!body) return badRequest("Send the session action as a JSON object.");
    const result = await mutateStore((state) => {
      const session = state.sessions.find((entry) => entry.academyId === actor.academyId && entry.id === id); if (!session) return { error: "Session not found.", status: 404 };
      if (!canManageSport(actor, session.sport)) return { error: "You can only manage sessions for sports assigned to you.", status: 403 };
      if (session.status === "closed") return { error: "This session is closed and locked.", status: 409 };
      const roster = state.players.filter((p) => p.academyId === actor.academyId && (session.playerIds || []).includes(p.id));
      if (body.action === "mark") {
        const { playerId, status } = body;
        if (!roster.some((p) => p.id === playerId) || !["Present", "Absent"].includes(status)) return { error: "Choose a roster player and Present or Absent.", status: 400 };
        const prior = session.attendance.find((a) => a.playerId === playerId);
        const previous = prior?.status ?? null;
        if (prior) prior.status = status; else session.attendance.push({ playerId, status });
        if (previous !== status) recordAudit(state, actor.id, "attendance.marked", session.id, { playerId: String(playerId), date: session.date, sport: session.sport, previous, status: String(status) });
        return { session };
      }
      if (body.action === "close") {
        const missing = roster.filter((p) => !session.attendance.some((a) => a.playerId === p.id));
        if (missing.length) return { error: `Mark all players before closing. ${missing.length} remain.`, status: 400 };
        session.status = "closed"; session.closedAt = new Date().toISOString(); recordAudit(state, actor.id, "session.closed", session.id, { date: session.date, sport: session.sport }); return { session };
      }
      return { error: "Unknown session action.", status: 400 };
    });
    return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
