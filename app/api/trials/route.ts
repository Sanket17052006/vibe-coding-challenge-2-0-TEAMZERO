import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../../lib/auth";
import { badRequest, errorResponse, readJsonBody } from "../../../lib/http";
import { isReadyForSport } from "../../../lib/readiness";
import { mutateStore, recordAudit } from "../../../lib/store";
import { Trial } from "../../../lib/types";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRole("scout");
    const body = await readJsonBody(request);
    if (!body) return badRequest("Send the trial call as a JSON object.");
    const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";
    const sport = typeof body.sport === "string" ? body.sport.trim() : "";
    if (!playerId || !sport) return badRequest("Choose a player and sport for the trial call.");

    if (actor.scoutSports && !actor.scoutSports.includes(sport)) return NextResponse.json({ error: "Choose a sport within your Scout interests." }, { status: 403 });
    const result = await mutateStore((state) => {
      const player = state.players.find((entry) => entry.academyId === actor.academyId && entry.id === playerId);
      if (!player) return { error: "Player not found.", status: 404 };
      if (!player.active) return { error: "This player is archived and cannot be called for a trial.", status: 400 };
      const academy = state.academies.find((entry) => entry.id === actor.academyId);
      if (!academy || !(academy.sports ?? []).includes(sport)) return { error: "That sport is not offered by this academy.", status: 400 };
      if (!(player.sports ?? [player.sport]).includes(sport)) return { error: "This player is not registered for that sport.", status: 400 };
      const academySessions = state.sessions.filter((entry) => entry.academyId === actor.academyId);
      const academyMatches = state.matches.filter((entry) => entry.academyId === actor.academyId);
      if (!isReadyForSport(player, sport, academySessions, academyMatches)) return { error: "This player is not Ready for that sport yet.", status: 400 };

      const existing = state.trials.find((trial) => trial.academyId === actor.academyId && trial.playerId === playerId && trial.sport === sport && trial.scoutId === actor.id);
      if (existing?.status === "active") return { error: "You have already called this player for a trial in that sport.", status: 409 };
      const now = new Date().toISOString();
      if (existing) {
        existing.status = "active";
        existing.scoutName = actor.displayName;
        existing.createdAt = now;
        existing.updatedAt = now;
        delete existing.withdrawnAt;
        recordAudit(state, actor.id, "trial.called", existing.id, { playerId, sport, renewed: true });
        return { trial: existing };
      }

      const trial: Trial = {
        id: randomUUID(),
        academyId: actor.academyId,
        playerId,
        sport,
        scoutId: actor.id,
        scoutName: actor.displayName,
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
      state.trials.push(trial);
      recordAudit(state, actor.id, "trial.called", trial.id, { playerId, sport });
      return { trial };
    });

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
