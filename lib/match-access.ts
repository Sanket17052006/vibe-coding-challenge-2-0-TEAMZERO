import type { Match, User } from "./types";
type MatchViewer = Pick<User, "role" | "playerId" | "coachSports" | "scoutSports" | "isOwner">;
type VisiblePlayer = { id: string; sports?: string[]; sport: string };

export function scopeMatchesForViewer(viewer: MatchViewer, academyMatches: Match[], visiblePlayers: VisiblePlayer[] = []): Match[] {
  if (viewer.role === "coach") return academyMatches.filter(match => canViewerManageSport(viewer, match.sport));
  const own = visiblePlayers.find(player => player.id === viewer.playerId);
  return academyMatches.flatMap(match => {
    if (viewer.role === "player") {
      if (!viewer.playerId) return [];
      const scores = match.scores.filter(score => score.playerId === viewer.playerId);
      const selected = match.teamSheet?.map(entry => entry.playerId) ?? match.lineup;
      const upcoming = match.status === "scheduled" && !!own && (own.sports ?? [own.sport]).includes(match.sport) && (!selected?.length || selected.includes(viewer.playerId));
      if (!(match.status === "played" && scores.length) && !upcoming) return [];
      const { lineup: _lineup, teamSheet: _sheet, ...summary } = match;
      return [{ ...summary, scores: match.status === "played" ? scores : [] }];
    }
    if (match.status !== "played" || (viewer.scoutSports && !viewer.scoutSports.includes(match.sport))) return [];
    const scores = match.scores.filter(score => visiblePlayers.some(player => player.id === score.playerId && (player.sports ?? [player.sport]).includes(match.sport)));
    if (!scores.length) return [];
    const { lineup: _lineup, teamSheet: _sheet, ...summary } = match;
    return [{ ...summary, scores }];
  });
}

/** Explicit assignments also constrain owners; undefined preserves legacy Coach access. */
export function canViewerManageSport(viewer: Pick<User, "role" | "coachSports" | "isOwner">, sport: string): boolean {
  return viewer.role === "coach" && (!viewer.coachSports || viewer.coachSports.includes(sport));
}
