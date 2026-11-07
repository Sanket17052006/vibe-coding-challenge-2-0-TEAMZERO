import type { Store } from "./types";

/**
 * Canonical demo dataset used by the "Continue as Coach / Player / Scout"
 * buttons on the sign-in screen. It is bundled with the app (not read from
 * disk) so it works on serverless deployments where the data/ folder is absent.
 *
 * All demo accounts share the password: demo123
 */
export const DEMO_STORE: Store = {
  academies: [
    {
      id: "academy-demo",
      name: "KhelGrid Premier Academy",
      location: "Mumbai, India",
      code: "EXR-2024",
      sports: ["Football", "Cricket", "Badminton"],
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  users: [
    {
      id: "demo-coach-1",
      academyId: "academy-demo",
      username: "coach.jan",
      displayName: "Coach Jan",
      role: "coach",
      status: "active",
      isOwner: true,
      coachSports: ["Football", "Cricket"],
      passwordSalt: "coachdemosalt0000000000000000000000",
      passwordHash: "93a6de6dd501599e6d5062b0b532720a0d01ba66aa9597de0f3a2387b789e5ab0a3637d1caa290a4b0f2447c4043f19329abe7ae0ba4746ca99d56b9b99d6158",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "demo-player-1",
      academyId: "academy-demo",
      username: "player.aarav",
      displayName: "Aarav",
      role: "player",
      status: "active",
      playerId: "DEMO-001",
      email: "aarav@khelgrid.example",
      emailVerifiedAt: "2026-01-15T00:00:00.000Z",
      passwordSalt: "playerdemosalt0000000000000000000000",
      passwordHash: "697b9588b673f9703f18bf18e6a80b729ac80998cb08ad29a8079554c64f89ba8489b5da32ae78fedd0e495523c3734c752697ac1b83084f1502d3dfbd533229",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "demo-player-2",
      academyId: "academy-demo",
      username: "player.priya",
      displayName: "Priya",
      role: "player",
      status: "active",
      playerId: "DEMO-002",
      email: "priya@khelgrid.example",
      emailVerifiedAt: "2026-01-15T00:00:00.000Z",
      passwordSalt: "playerdemosalt0000000000000000000000",
      passwordHash: "697b9588b673f9703f18bf18e6a80b729ac80998cb08ad29a8079554c64f89ba8489b5da32ae78fedd0e495523c3734c752697ac1b83084f1502d3dfbd533229",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "demo-scout-1",
      academyId: "academy-demo",
      username: "scout.rohan",
      displayName: "Rohan",
      role: "scout",
      status: "active",
      passwordSalt: "scoutdemosalt0000000000000000000000",
      passwordHash: "973605e17da0392e9e5d456b8bef170f9a2e0ef206896bdb5f64126c10ed54f30af7f16b5eaef8837d0253a180740364a29efa413a7eba0d474d584974901a68",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  players: [
    {
      id: "DEMO-001",
      academyId: "academy-demo",
      name: "Aarav",
      age: 18,
      sport: "Football",
      sports: ["Football"],
      sportRequests: [],
      active: true,
      userId: "demo-player-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "DEMO-002",
      academyId: "academy-demo",
      name: "Priya",
      age: 22,
      sport: "Cricket",
      sports: ["Cricket"],
      sportRequests: [],
      active: true,
      userId: "demo-player-2",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  sessions: [
    { id: "demo-session-1", academyId: "academy-demo", date: "2026-01-10", sport: "Football", playerIds: ["DEMO-001"], status: "closed", attendance: [{ playerId: "DEMO-001", status: "Present" }], createdAt: "2026-01-10T08:00:00.000Z", closedAt: "2026-01-10T10:00:00.000Z" },
    { id: "demo-session-2", academyId: "academy-demo", date: "2026-01-17", sport: "Football", playerIds: ["DEMO-001"], status: "closed", attendance: [{ playerId: "DEMO-001", status: "Present" }], createdAt: "2026-01-17T08:00:00.000Z", closedAt: "2026-01-17T10:00:00.000Z" },
    { id: "demo-session-3", academyId: "academy-demo", date: "2026-01-11", sport: "Cricket", playerIds: ["DEMO-002"], status: "closed", attendance: [{ playerId: "DEMO-002", status: "Present" }], createdAt: "2026-01-11T08:00:00.000Z", closedAt: "2026-01-11T10:00:00.000Z" },
    { id: "demo-session-4", academyId: "academy-demo", date: "2026-01-18", sport: "Cricket", playerIds: ["DEMO-002"], status: "closed", attendance: [{ playerId: "DEMO-002", status: "Present" }], createdAt: "2026-01-18T08:00:00.000Z", closedAt: "2026-01-18T10:00:00.000Z" },
    { id: "demo-session-5", academyId: "academy-demo", date: "2026-02-07", sport: "Football", playerIds: ["DEMO-001"], status: "open", attendance: [], createdAt: "2026-02-07T08:00:00.000Z" },
  ],
  matches: [
    { id: "demo-match-1", academyId: "academy-demo", date: "2026-01-10", sport: "Football", opponent: "Deoghar Dynamos", venue: "Home Ground", status: "played", scores: [{ playerId: "DEMO-001", value: 2, rating: 8 }], result: { academyScore: "3", opponentScore: "1", outcome: "win" }, lineup: ["DEMO-001"], createdAt: "2026-01-10T12:00:00.000Z" },
    { id: "demo-match-2", academyId: "academy-demo", date: "2026-01-17", sport: "Football", opponent: "Ranchi Royals", venue: "Away Ground", status: "played", scores: [{ playerId: "DEMO-001", value: 1, rating: 7 }], result: { academyScore: "2", opponentScore: "2", outcome: "draw" }, lineup: ["DEMO-001"], createdAt: "2026-01-17T12:00:00.000Z" },
    { id: "demo-match-3", academyId: "academy-demo", date: "2026-01-11", sport: "Cricket", opponent: "Patna Panthers", venue: "Home Ground", status: "played", scores: [{ playerId: "DEMO-002", value: 45, rating: 9 }], result: { academyScore: "160", opponentScore: "140", outcome: "win" }, createdAt: "2026-01-11T12:00:00.000Z" },
    { id: "demo-match-4", academyId: "academy-demo", date: "2026-01-18", sport: "Cricket", opponent: "Delhi Daredevils", venue: "Away Ground", status: "played", scores: [{ playerId: "DEMO-002", value: 30, rating: 8 }], result: { academyScore: "120", opponentScore: "130", outcome: "loss" }, createdAt: "2026-01-18T12:00:00.000Z" },
    { id: "demo-match-5", academyId: "academy-demo", date: "2026-02-01", sport: "Football", opponent: "Mumbai Strikers", venue: "Home Ground", status: "scheduled", scores: [], createdAt: "2026-01-20T12:00:00.000Z" },
  ],
  trials: [
    { id: "demo-trial-1", academyId: "academy-demo", playerId: "DEMO-001", sport: "Football", scoutId: "demo-scout-1", scoutName: "Rohan", status: "active", createdAt: "2026-01-20T12:00:00.000Z" },
  ],
  auditEvents: [
    { id: "demo-audit-1", academyId: "academy-demo", actorId: "demo-coach-1", action: "academy.created", targetId: "demo-coach-1", details: { role: "coach" }, createdAt: "2026-01-01T00:00:00.000Z" },
  ],
  authTokens: [],
};

const COLLECTIONS = ["academies", "users", "players", "sessions", "matches", "trials", "auditEvents"] as const;

/** Deep clone so callers can mutate freely without touching the shared constant. */
export function cloneDemoStore(): Store {
  return JSON.parse(JSON.stringify(DEMO_STORE)) as Store;
}

/** True when the demo academy is already present in the store. */
export function hasDemoData(state: Store): boolean {
  return state.academies.some((academy) => academy.id === "academy-demo")
    && state.users.some((user) => user.id === "demo-coach-1");
}

/**
 * Merge the demo dataset into an existing store without removing real records.
 * Demo entities are matched by id and replaced so a re-run repairs the demo
 * academy; records created by judges (new ids) are always preserved.
 */
export function mergeDemoStore(state: Store): Store {
  const demo = cloneDemoStore();
  for (const key of COLLECTIONS) {
    const target = state[key] as Array<{ id: string }>;
    for (const record of demo[key] as Array<{ id: string }>) {
      const index = target.findIndex((entry) => entry.id === record.id);
      if (index === -1) target.push(record);
      else target[index] = record;
    }
  }
  return state;
}
