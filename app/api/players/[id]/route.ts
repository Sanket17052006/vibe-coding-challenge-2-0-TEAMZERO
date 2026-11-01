import { NextRequest, NextResponse } from "next/server";
import { canManageSport, requireRole } from "../../../../lib/auth";
import { badRequest, errorResponse, readJsonBody } from "../../../../lib/http";
import { mutateStore, recordAudit } from "../../../../lib/store";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requireRole("coach"); const { id } = await params; const body = await readJsonBody(request); if (!body || typeof body.active !== "boolean") return badRequest("Set active to true or false.");
    const player = await mutateStore((state) => { const item = state.players.find((p) => p.academyId === actor.academyId && p.id === id); if (!item) return null; if (!(item.sports ?? [item.sport]).every((sport) => canManageSport(actor, sport))) return { forbidden: true as const }; const academy = state.academies.find((entry) => entry.id === actor.academyId); if (body.active && !(item.sports ?? [item.sport]).some((sport) => (academy?.sports ?? []).includes(sport))) return { unavailable: true as const }; const previous = item.active; item.active = body.active; if (previous !== body.active) recordAudit(state, actor.id, body.active ? "player.restored" : "player.archived", id, {}); return { item }; });
    if (player && "forbidden" in player) return NextResponse.json({ error: "Only a Coach assigned to every sport on this player can archive or restore the whole player profile." }, { status: 403 });
    if (player && "unavailable" in player) return NextResponse.json({ error: "This player has no sport that the academy currently offers. Re-enable a sport before restoring the player." }, { status: 409 });
    return player ? NextResponse.json({ player: player.item }) : NextResponse.json({ error: "Player not found." }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}
