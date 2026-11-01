import { NextRequest, NextResponse } from "next/server";
import { canManageSport, requireRole } from "../../../lib/auth";
import { badRequest, errorResponse, readJsonBody } from "../../../lib/http";
import { mutateStore, recordAudit } from "../../../lib/store";
import { randomUUID } from "node:crypto";
import { isISODate, isSupportedSport } from "../../../lib/sports";
export async function POST(request: NextRequest) {
  try { const actor = await requireRole("coach"); const body = await readJsonBody(request); if (!body) return badRequest("Send match details as a JSON object."); const date = String(body.date || ""); const sport = String(body.sport || "").trim(); const opponent = String(body.opponent || "").trim(); const venue = String(body.venue || "").trim();
    if (!isISODate(date) || !isSupportedSport(sport) || !opponent || opponent.length > 80 || venue.length > 100) return NextResponse.json({ error: "Enter a valid date, choose a sport, and enter an opponent and optional venue (under 100 characters)." }, { status: 400 });
    if (!canManageSport(actor, sport)) return NextResponse.json({ error: "You can only schedule matches for sports assigned to you." }, { status: 403 });
    const result = await mutateStore((state) => {
      const academy = state.academies.find((entry) => entry.id === actor.academyId);
      if (!academy) return { error: "Your academy could not be found. Sign in again or contact the academy owner." };
      if (!(academy.sports ?? []).includes(sport)) return { error: "This sport is not currently offered by the academy." };
      if (state.matches.some((entry) => entry.academyId === academy.id && entry.date === date && entry.sport === sport && entry.opponent.toLowerCase() === opponent.toLowerCase())) return { error: "That fixture is already scheduled for this date." };
      const match = { id: randomUUID(), academyId: academy.id, date, sport, opponent, venue: venue || undefined, status: "scheduled" as const, scores: [], createdAt: new Date().toISOString() }; state.matches.push(match); recordAudit(state, actor.id, "match.scheduled", match.id, { date, sport, opponent, venue: venue || null }); return { match };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
    const match = result.match;
    return NextResponse.json({ match }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
