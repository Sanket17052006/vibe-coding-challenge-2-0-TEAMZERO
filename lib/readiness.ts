import { Match, Player, Session } from "./types";

export type SportStat = {
  sport: string;
  attendance: number;
  matches: number;
  score: number;
  averageRating: number | null;
  ratingCount: number;
  status: "Ready" | "Developing";
};

export function sportStatsForPlayer(player: Player, sessions: Session[], matches: Match[]): SportStat[] {
  const playerSports = player.sports ?? [player.sport];
  return playerSports.map((sport) => {
    // A session is part of this player's attendance denominator only when
    // they were on its roster. Players added after a session opened must not
    // be marked absent from a session they could not attend.
    const held = sessions.filter((session) =>
      session.status === "closed" &&
      session.sport === sport &&
      (session.playerIds ?? session.attendance.map((row) => row.playerId)).includes(player.id),
    );
    const present = held.filter((session) => session.attendance.some((row) => row.playerId === player.id && row.status === "Present")).length;
    const played = matches.filter((match) => match.status === "played" && match.sport === sport && match.scores.some((score) => score.playerId === player.id));
    const attendance = held.length ? (present / held.length) * 100 : 0;
    const ratings = played.flatMap((match) => match.scores
      .filter((score) => score.playerId === player.id && typeof score.rating === "number" && Number.isFinite(score.rating))
      .map((score) => score.rating as number));
    const averageRating = ratings.length ? Math.round((ratings.reduce((total, rating) => total + rating, 0) / ratings.length) * 10) / 10 : null;
    const ready = attendance >= 75 && played.length >= 2;
    return {
      sport,
      attendance: Math.floor(attendance * 10) / 10,
      matches: played.length,
      score: played.reduce((total, match) => total + (match.scores.find((score) => score.playerId === player.id)?.value || 0), 0),
      averageRating,
      ratingCount: ratings.length,
      status: ready ? "Ready" as const : "Developing" as const,
    };
  });
}

export function isReadyForSport(player: Player, sport: string, sessions: Session[], matches: Match[]) {
  return sportStatsForPlayer(player, sessions, matches).some((stat) => stat.sport === sport && stat.status === "Ready");
}
