import type { Session } from "./types";

export function canRecordParticipantScore(playerId: string, session: Pick<Session, "playerIds" | "attendance">): boolean {
  return session.playerIds.includes(playerId) &&
    session.attendance.some((entry) => entry.playerId === playerId && entry.status === "Present");
}
