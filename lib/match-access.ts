import type { Match, User } from "./types";

type MatchViewer = Pick<User, "role" | "playerId" | "coachSports" | "isOwner">;

/** Apply role and sport visibility to academy-scoped match records. */
export function scopeMatchesForViewer(viewer: MatchViewer, academyMatches: Match[]): Match[] {
  if (viewer.role === "coach") return academyMatches.filter((match) => viewer.isOwner || !viewer.coachSports || viewer.coachSports.includes(match.sport));
  if (viewer.role === "scout") return [];
  if (!viewer.playerId) return [];
  return academyMatches.filter((match) => match.status === "played" && match.scores.some((score) => score.playerId === viewer.playerId)).map((match) => {
    const { lineup: _lineup, teamSheet: _teamSheet, ...publicMatch } = match;
    return { ...publicMatch, scores: match.scores.filter((score) => score.playerId === viewer.playerId) };
  });
}

export function canViewerManageSport(viewer: Pick<User, "role" | "coachSports" | "isOwner">, sport: string): boolean {
  return viewer.role === "coach" && (viewer.isOwner === true || !viewer.coachSports || viewer.coachSports.includes(sport));
}
