import { NextRequest, NextResponse } from "next/server";
import { canManageSport, requireRole } from "../../../lib/auth";
import { badRequest, errorResponse, readJsonBody } from "../../../lib/http";
import { mutateStore, recordAudit } from "../../../lib/store";
import { randomUUID } from "node:crypto";
import { isISODate, isSupportedSport } from "../../../lib/sports";
export async function POST(request: NextRequest) {
  try { const actor = await requireRole("coach"); const body = await readJsonBody(request); if (!body) return badRequest("Send session details as a JSON object."); const date = String(body.date || ""); const sport = String(body.sport || "").trim();
    if (!isISODate(date) || !isSupportedSport(sport)) return NextResponse.json({ error: "Choose a valid date and sport from the catalogue." }, { status: 400 });
    if (!canManageSport(actor, sport)) return NextResponse.json({ error: "You can only manage sessions for sports assigned to you." }, { status: 403 });
    const result = await mutateStore((state) => {
      const academy = state.academies.find((entry) => entry.id === actor.academyId);
      if (!academy) return { error: "Your academy could not be found. Sign in again or contact the academy owner." };
      if (!(academy.sports ?? []).includes(sport)) return { error: "This sport is not currently offered by the academy." };
      if (state.sessions.some((s) => s.academyId === academy.id && s.date === date && s.sport === sport)) return { error: "A session already exists for this date and sport." };
      const roster = state.players.filter((p) => p.academyId === academy.id && p.active && (p.sports ?? [p.sport]).includes(sport));
      if (!roster.length) return { error: "Add at least one active player in this sport before opening a session." };
      const session = { id: randomUUID(), academyId: academy.id, date, sport, playerIds: roster.map((player) => player.id), status: "open" as const, attendance: [], createdAt: new Date().toISOString() }; state.sessions.push(session); recordAudit(state, actor.id, "session.opened", session.id, { date, sport, rosterCount: roster.length }); return { session };
    });
    return "error" in result ? NextResponse.json({ error: result.error }, { status: 400 }) : NextResponse.json(result, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
