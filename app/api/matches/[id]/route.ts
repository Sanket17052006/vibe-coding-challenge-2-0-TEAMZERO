import { NextRequest, NextResponse } from "next/server";
import { canManageSport, requireRole } from "../../../../lib/auth";
import { badRequest, errorResponse, readJsonBody } from "../../../../lib/http";
import { mutateStore, recordAudit } from "../../../../lib/store";
import { isValidSportFormat, sportFormatConfig, sportTeamSheetLimit, validateParticipantEntries, validateSportScore, validateTeamSheetEntries } from "../../../../lib/sport-config";
import { canRecordParticipantScore } from "../../../../lib/match-validation";

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
      const matchConfig = sportFormatConfig(match.sport, match.format);
      if (!matchConfig || !match.format || !isValidSportFormat(match.sport, match.format)) return { error: "This fixture has no supported format and cannot be updated safely. Schedule a new fixture with an explicit format.", status: 400 };
      if (body.action === "team-sheet" || body.action === "lineup") {
        const config = matchConfig;
        if (!config || config.kind !== "team") return { error: "Individual sports use the participant score sheet, not a team lineup.", status: 400 };
        const rawItems: unknown[] = Array.isArray(body.teamSheet) ? body.teamSheet : Array.isArray(body.playerIds) ? body.playerIds.map((playerId: unknown) => ({ playerId })) : [];
        const teamSheet = rawItems.map((item) => {
          if (!isRecord(item)) return { playerId: "", role: "starter" as const };
          const row = item;
          const jerseyNumber = row.jerseyNumber === undefined || row.jerseyNumber === null || row.jerseyNumber === "" ? undefined : Number(row.jerseyNumber);
          return {
            playerId: typeof row.playerId === "string" ? row.playerId : "",
            role: row.role === "substitute" ? "substitute" as const : "starter" as const,
            position: typeof row.position === "string" && row.position.trim() ? row.position.trim() : undefined,
            captain: row.captain === true,
            ...(jerseyNumber === undefined ? {} : { jerseyNumber }),
          };
        });
        const invalidRole = rawItems.some((item) => isRecord(item) && item.role !== undefined && item.role !== null && item.role !== "starter" && item.role !== "substitute");
        const ids = teamSheet.map((item: { playerId: string }) => item.playerId);
        const maxPlayers = sportTeamSheetLimit(match.sport, match.format);
        if (invalidRole || !validateTeamSheetEntries(match.sport, teamSheet, match.format) || teamSheet.some((item: { playerId: string }) => !state.players.some((p) => p.academyId === actor.academyId && p.id === item.playerId && p.active && (p.sports ?? [p.sport]).includes(match.sport)))) return { error: `Choose active ${match.sport} starters (up to ${maxPlayers}) and substitutes, with unique jersey numbers and valid positions.`, status: 400 };
        match.teamSheet = teamSheet; match.lineup = ids; recordAudit(state, actor.id, "match.team-sheet.updated", match.id, { sport: match.sport, playerCount: teamSheet.length }); return { match };
      }
      const session = state.sessions.find((entry) => entry.academyId === actor.academyId && entry.date === match.date && entry.sport === match.sport && entry.status === "closed");
      if (!session) return { error: "Close the matching date and sport session before recording scores.", status: 400 };
      const entries = Array.isArray(body.scores) ? body.scores : [];
      if (!entries.length) return { error: "Add at least one participant score." , status: 400};
      const participantIds = entries.map((item: { playerId?: unknown }) => String(item?.playerId ?? ""));
      if (!validateParticipantEntries(match.sport, match.format, participantIds)) return { error: `This ${match.sport} format has a participant limit or duplicate participant entry.`, status: 400 };
      const result = body.result;
      const validOutcomes = ["win", "loss", "draw", "no-contest"];
      if (result != null && (matchConfig.resultMode === "none" || typeof result !== "object" || Array.isArray(result) || typeof result.academyScore !== "string" || !result.academyScore.trim() || result.academyScore.length > 30 || typeof result.opponentScore !== "string" || !result.opponentScore.trim() || result.opponentScore.length > 30 || !validOutcomes.includes(result.outcome) || (result.detail != null && (typeof result.detail !== "string" || result.detail.length > 100)) || (result.finishMethod != null && (typeof result.finishMethod !== "string" || result.finishMethod.length > 30)) || (result.finishRound != null && (!Number.isInteger(Number(result.finishRound)) || Number(result.finishRound) < 1 || Number(result.finishRound) > 99)))) return { error: "If this format supports an official match outcome, provide both result values and a valid outcome. Optional result details are limited to 100 characters.", status: 400 };
      const unique = new Set<string>();
      for (const item of entries) {
        const playerId = String(item?.playerId || ""); const score = finiteNumber(item?.value);
        const hasRating = item?.rating !== undefined && item?.rating !== null;
        if (unique.has(playerId)) return { error: "A player can only appear once on a match sheet.", status: 400 };
        unique.add(playerId);
        if (!canRecordParticipantScore(playerId, session)) return { error: "Only a participant on that day's session sheet and marked Present can be scored.", status: 400 };
        if (!state.players.some((player) => player.academyId === actor.academyId && player.id === playerId && (player.sports ?? [player.sport]).includes(match.sport))) return { error: "This player is not registered for the match sport.", status: 400 };
        if (score === null || !validateSportScore(match.sport, score, match.format)) return { error: `Enter a valid ${matchConfig.scoreLabel.toLowerCase()} using the step and range configured for this format.`, status: 400 };
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
