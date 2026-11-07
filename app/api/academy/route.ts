import { NextRequest, NextResponse } from "next/server";
import { getStore, mutateStore, recordAudit } from "../../../lib/store";
import { requireRole } from "../../../lib/auth";
import { badRequest, errorResponse, readJsonBody } from "../../../lib/http";
import { SPORTS } from "../../../lib/sports";
import { rateLimit } from "../../../lib/rate-limit";
import { resolveAcademyIdentity } from "../../../lib/single-academy";
export async function GET(request: NextRequest) {
  try {
  const limited = await rateLimit(request, "academy-info", "", 60, 60 * 60 * 1000);
  if (limited) return limited;
  const state = await getStore();
  const identity = resolveAcademyIdentity(state);
  const academy = state.academies.find((entry) => entry.id === identity.id);
  return NextResponse.json({ academy: { name: identity.name, location: identity.location, sports: academy?.sports ?? [] } }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireRole("coach");
    if (!actor.isOwner) return NextResponse.json({ error: "Only the academy owner can change the sports offered by this academy." }, { status: 403 });
    const body = await readJsonBody(request);
    if (!body || !Array.isArray(body.sports)) return badRequest("Send the academy sports as a JSON array.");
    const sports = [...new Set(body.sports.map((value: unknown) => String(value).trim()))];
    if (sports.length > SPORTS.length || sports.some((sport) => !SPORTS.includes(sport as never))) return NextResponse.json({ error: "Choose sports from the academy catalogue." }, { status: 400 });
    const result = await mutateStore((state) => {
      const academy = state.academies.find((entry) => entry.id === actor.academyId);
      if (!academy) return { error: "Academy is not set up.", status: 404 };
      const removed = (academy.sports ?? []).filter((sport) => !sports.includes(sport));
      const occupied = removed.find((sport) => state.players.some((player) => player.academyId === academy.id && player.active && (player.sports ?? [player.sport]).includes(sport)));
      if (occupied) return { error: `Archive or move active ${occupied} players before removing that sport from the academy.`, status: 409 };
      academy.sports = sports;
      for (const player of state.players.filter((entry) => entry.academyId === academy.id)) for (const request of player.sportRequests ?? []) if (removed.includes(request.sport) && request.status === "pending") { request.status = "declined"; request.decidedAt = new Date().toISOString(); request.decidedBy = actor.id; }
      recordAudit(state, actor.id, "academy.sports.updated", academy.id, { sports: sports.join(", ") });
      return { sports };
    });
    return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
