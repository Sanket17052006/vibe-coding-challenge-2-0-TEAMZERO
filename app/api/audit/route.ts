import { NextResponse } from "next/server";
import { canManageSport, requireRole } from "../../../lib/auth";
import { errorResponse } from "../../../lib/http";
import { getStore } from "../../../lib/store";

export async function GET() {
  try {
    const actor = await requireRole("coach");
    const state = await getStore();
    const events = state.auditEvents.filter((event) => {
      if (event.academyId !== actor.academyId) return false;
      if (actor.isOwner || !actor.coachSports) return true;
      const sport = typeof event.details.sport === "string" ? event.details.sport : state.sessions.find((entry) => entry.academyId === actor.academyId && entry.id === event.targetId)?.sport ?? state.matches.find((entry) => entry.academyId === actor.academyId && entry.id === event.targetId)?.sport;
      if (sport) return canManageSport(actor, sport);
      const player = state.players.find((entry) => entry.academyId === actor.academyId && entry.id === event.targetId);
      return player ? (player.sports ?? [player.sport]).some((value) => canManageSport(actor, value)) : false;
    });
    return NextResponse.json({ events: events.slice(-200).reverse() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
