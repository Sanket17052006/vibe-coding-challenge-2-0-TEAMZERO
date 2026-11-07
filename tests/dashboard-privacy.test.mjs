import test from "node:test";
import assert from "node:assert/strict";
import { routeHarness, fixture } from "./helpers/route-harness.mjs";
function records() {
  const state = fixture(); state.academies[0].sports = ["Football", "Cricket"];
  state.players = [
    { id: "ready", academyId: "academy-a", name: "Ready Athlete", age: 16, sport: "Football", sports: ["Football"], active: true, userId: "private-account", sportRequests: [{ sport: "Cricket", status: "pending" }] },
    { id: "developing", academyId: "academy-a", name: "Developing Athlete", age: 17, sport: "Football", sports: ["Football"], active: true },
    { id: "cricket", academyId: "academy-a", name: "Other Sport", age: 18, sport: "Cricket", sports: ["Cricket"], active: true },
    { id: "foreign", academyId: "academy-b", name: "Private Other Academy", age: 18, sport: "Football", active: true },
  ];
  for (const sport of ["Football", "Cricket"]) {
    const ids = sport === "Football" ? ["ready", "developing"] : ["cricket"];
    for (let i = 0; i < 4; i++) state.sessions.push({ id: sport + i, academyId: "academy-a", date: "2026-01-0" + (i + 1), sport, status: "closed", playerIds: ids, attendance: ids.map(playerId => ({ playerId, status: playerId === "developing" ? "Absent" : i < 3 ? "Present" : "Absent" })) });
    for (let i = 0; i < 2; i++) state.matches.push({ id: sport + i, academyId: "academy-a", date: "2026-01-01", sport, format: sport === "Football" ? "11-a-side" : "T20", opponent: "Recorded opponent", status: "played", scores: ids.map(playerId => ({ playerId, value: 1 })) });
  }
  state.matches.push({ id: "upcoming", academyId: "academy-a", date: "2026-02-01", sport: "Football", format: "11-a-side", opponent: "Upcoming opponent", status: "scheduled", scores: [] });
  state.matches.push({ id: "not-selected", academyId: "academy-a", date: "2026-02-01", sport: "Football", format: "11-a-side", opponent: "Private lineup", status: "scheduled", scores: [], teamSheet: [{ playerId: "developing" }] });
  return state;
}

test("Scout bootstrap exposes only Ready interested-sport profiles and filtered history without private fields", async () => {
  const response = await routeHarness("app/api/bootstrap/route.ts", records(), { id: "scout", academyId: "academy-a", role: "scout", scoutSports: ["Football"] }).invoke("GET");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.players.map(player => player.id), ["ready"]);
  for (const key of ["age", "userId", "academyId", "sportRequests", "email"]) assert.equal(Object.hasOwn(body.players[0], key), false, key);
  assert.equal(body.matches.length, 2);
  assert.ok(body.matches.every(match => match.sport === "Football" && match.scores.length === 1 && match.scores[0].playerId === "ready" && !match.teamSheet && !match.lineup));
  assert.deepEqual(body.sessions, []);
  assert.deepEqual(body.coaches, []);
  assert.deepEqual(body.pendingUsers, []);
});

test("Player bootstrap limits history, attendance, analytics inputs and upcoming sheets to their own profile", async () => {
  const response = await routeHarness("app/api/bootstrap/route.ts", records(), { id: "player", academyId: "academy-a", role: "player", playerId: "ready" }).invoke("GET");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.players.map(player => player.id), ["ready"]);
  assert.equal(body.matches.filter(match => match.status === "played").length, 2);
  assert.deepEqual(body.matches.filter(match => match.status === "scheduled").map(match => match.id), ["upcoming"]);
  assert.ok(body.matches.every(match => match.scores.every(score => score.playerId === "ready")));
  assert.ok(body.sessions.every(session => session.attendance.every(row => row.playerId === "ready")));
});

test("explicit sport assignments constrain owner-Coach dashboard data as well as ordinary Coaches", async () => {
  const response = await routeHarness("app/api/bootstrap/route.ts", records(), { id: "owner", academyId: "academy-a", role: "coach", isOwner: true, coachSports: ["Football"] }).invoke("GET");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.players.every(player => player.sports.every(sport => sport === "Football")));
  assert.ok(body.matches.every(match => match.sport === "Football"));
  assert.ok(body.sessions.every(session => session.sport === "Football"));
});
