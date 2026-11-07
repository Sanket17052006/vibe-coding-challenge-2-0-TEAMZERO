import type { Match } from "./types";
import type { SportConfig } from "./sport-config";

export type AnalyticsPlayer = {
  id: string;
  name: string;
  active: boolean;
  sports?: string[];
  sport: string;
  sportStats?: { sport: string; attendance: number; matches: number; score: number; averageRating?: number | null; ratingCount?: number; status: "Ready" | "Developing" }[];
};

export type AnalyticsSession = {
  id: string;
  date: string;
  sport: string;
  format?: string;
  status: "open" | "closed";
  playerIds: string[];
  attendance: { playerId: string; status: "Present" | "Absent" }[];
};

export type AnalyticsMatch = Pick<Match, "id" | "date" | "sport" | "format" | "opponent" | "status" | "scores" | "result">;

export function buildSportAnalytics(sport: string, players: AnalyticsPlayer[], sessions: AnalyticsSession[], matches: AnalyticsMatch[], config: SportConfig, format: string) {
  const matchesForSport = matches.filter((match) => match.sport === sport);
  const matchesForFormat = config.formats.includes(format)
    ? matchesForSport.filter((match) => match.format === format)
    : [];
  const unclassifiedMatches = matchesForSport.filter((match) => !match.format || !config.formats.includes(match.format)).length;
  const playedMatches = matchesForFormat.filter((match) => match.status === "played");
  const scheduledMatches = matchesForFormat.filter((match) => match.status === "scheduled").length;
  const results = { wins: 0, losses: 0, draws: 0, noContests: 0, unreported: 0 };
  for (const match of playedMatches) {
    const outcome = match.result?.outcome;
    if (outcome === "win") results.wins += 1;
    else if (outcome === "loss") results.losses += 1;
    else if (outcome === "draw") results.draws += 1;
    else if (outcome === "no-contest") results.noContests += 1;
    else results.unreported += 1;
  }

  const closedSessions = sessions.filter((session) => session.sport === sport && session.status === "closed");
  let presentMarks = 0;
  let possibleMarks = 0;
  for (const session of closedSessions) {
    for (const playerId of new Set(session.playerIds)) {
      possibleMarks += 1;
      if (session.attendance.some((row) => row.playerId === playerId && row.status === "Present")) presentMarks += 1;
    }
  }

  const activePlayers = players.filter((player) => player.active && (player.sports ?? [player.sport]).includes(sport));
  const playerRows = activePlayers.map((player) => {
    const stat = player.sportStats?.find((entry) => entry.sport === sport);
    const playerMatches = playedMatches.filter((match) => match.scores.some((score) => score.playerId === player.id));
    const ratings = playedMatches.flatMap((match) => match.scores
      .filter((score) => score.playerId === player.id && typeof score.rating === "number" && Number.isFinite(score.rating))
      .map((score) => score.rating as number));
    const playerValues = playerMatches.flatMap((match) => match.scores.filter((score) => score.playerId === player.id).map((score) => score.value));
    const scoreAggregate = aggregate(config, playerValues);
    const playerSessions = closedSessions.filter((session) => session.playerIds.includes(player.id));
    const playerPresent = playerSessions.filter((session) => session.attendance.some((entry) => entry.playerId === player.id && entry.status === "Present")).length;
    return {
      id: player.id,
      name: player.name,
      attendance: playerSessions.length ? Math.round((playerPresent / playerSessions.length) * 1000) / 10 : null,
      matches: playerMatches.length,
      scoreAggregate,
      scoreLabel: config.scoreLabel,
      averageRating: ratings.length ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10 : null,
      ratingCount: ratings.length,
      readiness: stat?.status ?? "Developing" as const,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const allRatings = playedMatches.flatMap((match) => match.scores
    .filter((score) => typeof score.rating === "number" && Number.isFinite(score.rating))
    .map((score) => score.rating as number));
  const recentRatings = playedMatches.map((match) => {
    const ratings = match.scores.filter((score) => typeof score.rating === "number" && Number.isFinite(score.rating));
    return {
      id: match.id,
      date: match.date,
      opponent: match.opponent,
      averageRating: ratings.length ? Math.round((ratings.reduce((sum, score) => sum + (score.rating as number), 0) / ratings.length) * 10) / 10 : null,
      ratingCount: ratings.length,
    };
  }).filter((entry) => entry.averageRating !== null).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).reverse();
  const recentPerformance = playedMatches.map((match) => ({
    id: match.id,
    date: match.date,
    opponent: match.opponent,
    value: aggregate(config, match.scores.map((score) => score.value)),
  })).filter((entry) => entry.value !== null).sort((a, b) => a.date.localeCompare(b.date)).slice(-8);

  return {
    sport,
    format,
    config,
    unclassifiedMatches,
    playedMatches: playedMatches.length,
    scheduledMatches,
    results,
    closedSessions: closedSessions.length,
    presentMarks,
    possibleMarks,
    attendanceRate: possibleMarks ? Math.round((presentMarks / possibleMarks) * 1000) / 10 : null,
    activePlayers: activePlayers.length,
    ratedScoreRows: allRatings.length,
    scoreEntryCount: playedMatches.reduce((total, match) => total + match.scores.length, 0),
    averageRating: allRatings.length ? Math.round((allRatings.reduce((sum, rating) => sum + rating, 0) / allRatings.length) * 10) / 10 : null,
    recentRatings,
    recentPerformance,
    players: playerRows,
  };
}

function aggregate(config: SportConfig, values: number[]): number | null {
  if (!values.length) return null;
  if (config.aggregation === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (config.aggregation === "average") return values.reduce((sum, value) => sum + value, 0) / values.length;
  return config.scoreDirection === "lower" ? Math.min(...values) : Math.max(...values);
}
