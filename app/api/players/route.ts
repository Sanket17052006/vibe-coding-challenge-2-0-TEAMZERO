import { NextRequest, NextResponse } from "next/server";
import { canManageSport, requireRole } from "../../../lib/auth";
import { badRequest, errorResponse, readJsonBody } from "../../../lib/http";
import { mutateStore, recordAudit } from "../../../lib/store";
import { isSupportedSport } from "../../../lib/sports";
export async function POST(request: NextRequest) {
  try {
    const actor = await requireRole("coach");
    const body = await readJsonBody(request); if (!body) return badRequest("Send player details as a JSON object.");
    const name = String(body?.name || "").trim(); const age = Number(body?.age); const sports = Array.isArray(body?.sports) ? [...new Set(body.sports.map((value: unknown) => String(value).trim()))] : [String(body?.sport || "").trim()];
    if (!name || name.length > 60 || !Number.isInteger(age) || age < 5 || age > 50 || !sports.length || sports.length > 30 || sports.some((sport) => !isSupportedSport(sport))) return NextResponse.json({ error: "Enter a name, age from 5 to 50, and select at least one sport from the catalogue." }, { status: 400 });
    if (sports.some((sport) => !canManageSport(actor, sport))) return NextResponse.json({ error: "You can only manage players in sports assigned to you." }, { status: 403 });
    const player = await mutateStore((state) => {
      const academy = state.academies.find((entry) => entry.id === actor.academyId);
      if (!academy) return { error: "This account is not linked to an academy." };
      if (!actor.isOwner && sports.some((entry) => !(academy.sports ?? []).includes(entry))) return { error: "Add the selected sports to this academy before creating the player." };
      if (actor.isOwner) {
        const offered = academy.sports ?? [];
        const added = sports.filter((entry) => !offered.includes(entry));
        if (added.length) {
          academy.sports = [...offered, ...added];
          recordAudit(state, actor.id, "academy.sports.updated", academy.id, { added: added.join(", ") });
        }
      }
      const next = Math.max(0, ...state.players.map((p) => Number(p.id.replace(/\D/g, "")) || 0)) + 1;
      const record = { id: `EX-${String(next).padStart(3, "0")}`, academyId: academy.id, name, age, sport: sports[0], sports, active: true, createdAt: new Date().toISOString() };
      state.players.push(record);
      recordAudit(state, actor.id, "player.created", record.id, { sports: sports.join(", "), age });
      return { record };
    });
    return "error" in player ? NextResponse.json({ error: player.error }, { status: 400 }) : NextResponse.json({ player: player.record }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
