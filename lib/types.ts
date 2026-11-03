export type Role = "coach" | "player" | "scout";
export type AttendanceStatus = "Present" | "Absent";

export type Academy = { id: string; name: string; location: string; code: string; sports?: string[]; createdAt: string };
export type User = { id: string; academyId: string; username: string; displayName: string; role: Role; status: "active" | "pending" | "declined" | "left"; playerId?: string; coachSports?: string[]; isOwner?: boolean; sessionVersion?: number; passwordHash: string; passwordSalt: string; createdAt: string };
export type SportRequest = { id: string; sport: string; status: "pending" | "approved" | "declined"; requestedAt: string; decidedAt?: string; decidedBy?: string };
export type Player = { id: string; academyId: string; name: string; age: number; sport: string; sports?: string[]; sportRequests?: SportRequest[]; active: boolean; userId?: string; createdAt: string };
export type Attendance = { playerId: string; status: AttendanceStatus };
export type Session = { id: string; academyId: string; date: string; sport: string; playerIds: string[]; status: "open" | "closed"; attendance: Attendance[]; createdAt: string; closedAt?: string };
export type Score = { playerId: string; value: number; rating?: number }; // rating is 1-10 in half-point steps
export type MatchResult = { academyScore: string; opponentScore: string; outcome: "win" | "loss" | "draw" | "no-contest"; detail?: string; finishMethod?: string; finishRound?: number };
export type Match = { id: string; academyId: string; date: string; sport: string; opponent: string; venue?: string; status: "scheduled" | "played"; scores: Score[]; result?: MatchResult; lineup?: string[]; createdAt: string };
export type AuditEvent = { id: string; academyId: string; actorId: string; action: string; targetId: string; details: Record<string, string | number | boolean | null>; createdAt: string };
export type Store = { academies: Academy[]; users: User[]; players: Player[]; sessions: Session[]; matches: Match[]; auditEvents: AuditEvent[] };
export type PublicUser = Pick<User, "id" | "username" | "displayName" | "role" | "status" | "playerId" | "coachSports" | "isOwner">;
