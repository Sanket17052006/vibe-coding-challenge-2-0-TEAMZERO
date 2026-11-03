import { NextRequest, NextResponse } from "next/server";
import { canManageSport, requireRole } from "../../../../lib/auth";
import { badRequest, errorResponse, readJsonBody } from "../../../../lib/http";
import { mutateStore, recordAudit } from "../../../../lib/store";

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole("coach");
    const { id } = await params;
    const result = await mutateStore((state) => {
      const index = state.matches.findIndex((entry) => entry.academyId === actor.academyId && entry.id === id);
      if (index < 0) return { error: "Match not found.", status: 404 };
      const match = state.matches[index];
      if (!canManageSport(actor, match.sport)) return { error: "You can only delete match records for sports assigned to you.", status: 403 };
      recordAudit(state, actor.id, "match.deleted", match.id, { date: match.date, sport: match.sport, opponent: match.opponent, hadResult: match.status === "played" });
      state.matches.splice(index, 1);
      return { deleted: true };
    });
    return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requireRole("coach"); const { id } = await params; const body = await readJsonBody(request); if (!body) return badRequest("Send match updates as a JSON object.");
    const result = await mutateStore((state) => {
      const match = state.matches.find((entry) => entry.academyId === actor.academyId && entry.id === id); if (!match) return { error: "Match not found.", status: 404 };
      if (!canManageSport(actor, match.sport)) return { error: "You can only manage matches for sports assigned to you.", status: 403 };
      if (match.status === "played") return { error: "Scores for this match are already recorded.", status: 409 };
      if (body.action === "lineup") {
        const lineup = Array.isArray(body.playerIds) ? body.playerIds.map(String) : [];
        if (lineup.length > 11 || new Set(lineup).size !== lineup.length || lineup.some((playerId: string) => !state.players.some((p) => p.academyId === actor.academyId && p.id === playerId && p.active && (p.sports ?? [p.sport]).includes("Football")))) return { error: "Choose up to eleven different active Football players.", status: 400 };
        match.lineup = lineup; recordAudit(state, actor.id, "match.lineup.updated", match.id, { playerCount: lineup.length }); return { match };
      }
      const session = state.sessions.find((entry) => entry.academyId === actor.academyId && entry.date === match.date && entry.sport === match.sport && entry.status === "closed");
      if (!session) return { error: "Close the matching date and sport session before recording scores.", status: 400 };
      const entries = Array.isArray(body.scores) ? body.scores : [];
      if (!entries.length) return { error: "Add at least one player score." , status: 400};
      const result = body.result;
      const validOutcomes = ["win", "loss", "draw", "no-contest"];
      if (result != null && (typeof result !== "object" || Array.isArray(result) || typeof result.academyScore !== "string" || !result.academyScore.trim() || result.academyScore.length > 30 || typeof result.opponentScore !== "string" || !result.opponentScore.trim() || result.opponentScore.length > 30 || !validOutcomes.includes(result.outcome) || (result.detail != null && (typeof result.detail !== "string" || result.detail.length > 100)) || (result.finishMethod != null && (typeof result.finishMethod !== "string" || result.finishMethod.length > 30)) || (result.finishRound != null && (!Number.isInteger(Number(result.finishRound)) || Number(result.finishRound) < 1 || Number(result.finishRound) > 99)))) return { error: "If you enter a final result, provide both final scores and a valid outcome. Optional result details are limited to 100 characters.", status: 400 };
      const unique = new Set<string>();
      for (const item of entries) {
        const playerId = String(item?.playerId || ""); const score = finiteNumber(item?.value);
        const hasRating = item?.rating !== undefined && item?.rating !== null;
        if (unique.has(playerId)) return { error: "A player can only appear once on a match sheet.", status: 400 };
        unique.add(playerId);
        if (!session.attendance.some((entry) => entry.playerId === playerId && entry.status === "Present")) return { error: "A player absent from that day's closed session cannot be scored.", status: 400 };
        if (!state.players.some((player) => player.academyId === actor.academyId && player.id === playerId && (player.sports ?? [player.sport]).includes(match.sport))) return { error: "This player is not registered for the match sport.", status: 400 };
        if (score === null || !Number.isInteger(score) || score < 0 || score > 100000) return { error: "Scores must be whole non-negative numbers below 100,000.", status: 400 };
        if (hasRating) {
          const rating = finiteNumber(item.rating);
          if (rating === null || rating < 1 || rating > 10 || !Number.isInteger(rating * 2)) return { error: "Player ratings must be numbers from 1 to 10 in half-point steps." , status: 400};
        }
      }
      match.scores = entries.map((entry: { playerId: string; value: number; rating?: number | null }) => {
        const hasRating = entry.rating !== undefined && entry.rating !== null;
        return { playerId: String(entry.playerId), value: Number(entry.value), ...(hasRating ? { rating: Number(entry.rating) } : {}) };
      });
      if (result) match.result = { academyScore: result.academyScore.trim(), opponentScore: result.opponentScore.trim(), outcome: result.outcome, detail: typeof result.detail === "string" && result.detail.trim() ? result.detail.trim() : undefined, finishMethod: typeof result.finishMethod === "string" && result.finishMethod.trim() ? result.finishMethod.trim() : undefined, finishRound: result.finishRound == null || result.finishRound === "" ? undefined : Number(result.finishRound) };
      match.status = "played"; recordAudit(state, actor.id, result ? "match.result.recorded" : "match.scores.recorded", match.id, { playerCount: entries.length, outcome: result?.outcome ?? "not-recorded", date: match.date, sport: match.sport }); return { match };
    });
    return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
