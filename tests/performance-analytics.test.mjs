import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function importTypeScript(path, rewrite = (source) => source) {
  const source = rewrite(await readFile(new URL(path, import.meta.url), "utf8"));
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

const { SPORTS } = await importTypeScript("../lib/sports.ts");
const { isLocalTime } = await importTypeScript("../lib/sports.ts");
const sportConfigModule = await importTypeScript("../lib/sport-config.ts", (source) => source.replace('import { SPORTS } from "./sports";', `const SPORTS = ${JSON.stringify(SPORTS)};`));
const { SPORT_CONFIG, sportFormatConfig, validateSportScore, isValidSportFormat, sportTeamSheetLimit, sportParticipantLimit, validateTeamSheet, validateTeamSheetEntries, validateParticipantEntries, aggregateScores } = sportConfigModule;
const { buildSportAnalytics } = await importTypeScript("../lib/performance-analytics.ts");
const { scopeMatchesForViewer, canViewerManageSport } = await importTypeScript("../lib/match-access.ts");
const { canRecordParticipantScore } = await importTypeScript("../lib/match-validation.ts");

const players = [
  { id: "p1", name: "Asha Patel", sport: "Football", sports: ["Football", "Cricket"], active: true, sportStats: [{ sport: "Football", attendance: 75, matches: 2, score: 3, averageRating: 8, ratingCount: 1, status: "Ready" }] },
  { id: "p2", name: "Dev Shah", sport: "Football", sports: ["Football"], active: true, sportStats: [{ sport: "Football", attendance: 50, matches: 1, score: 0, averageRating: null, ratingCount: 0, status: "Developing" }] },
  { id: "p3", name: "Archived", sport: "Football", active: false },
];
const sessions = [
  { id: "s1", date: "2026-01-01", sport: "Football", status: "closed", playerIds: ["p1", "p2"], attendance: [{ playerId: "p1", status: "Present" }, { playerId: "p2", status: "Absent" }] },
  { id: "s2", date: "2026-01-02", sport: "Football", status: "closed", playerIds: ["p1"], attendance: [{ playerId: "p1", status: "Present" }] },
  { id: "s3", date: "2026-01-03", sport: "Cricket", status: "closed", playerIds: ["p1"], attendance: [{ playerId: "p1", status: "Absent" }] },
  { id: "s4", date: "2026-01-04", sport: "Football", status: "open", playerIds: ["p1"], attendance: [{ playerId: "p1", status: "Absent" }] },
];
const matches = [
  { id: "m1", date: "2026-01-05", sport: "Football", format: "11-a-side", opponent: "United", status: "played", scores: [{ playerId: "p1", value: 2, rating: 8 }, { playerId: "p2", value: 0 }], result: { outcome: "win" } },
  { id: "m2", date: "2026-01-08", sport: "Football", format: "11-a-side", opponent: "Rovers", status: "played", scores: [{ playerId: "p1", value: 1, rating: 6 }], result: { outcome: "draw" } },
  { id: "m3", date: "2026-01-09", sport: "Football", format: "7-a-side", opponent: "City", status: "played", scores: [{ playerId: "p1", value: 99 }] },
  { id: "m4", date: "2026-01-10", sport: "Cricket", format: "T20", opponent: "XI", status: "played", scores: [{ playerId: "p1", value: 20, rating: 10 }], result: { outcome: "loss" } },
  { id: "m5", date: "2026-01-12", sport: "Football", format: "11-a-side", opponent: "Town", status: "scheduled", scores: [] },
];

test("analytics scopes matches, sessions, and player rows to one sport and active roster", () => {
  const analytics = buildSportAnalytics("Football", players, sessions, matches, sportFormatConfig("Football", "11-a-side"), "11-a-side");
  assert.equal(analytics.playedMatches, 2);
  assert.equal(analytics.scheduledMatches, 1);
  assert.equal(analytics.closedSessions, 2);
  assert.equal(analytics.presentMarks, 2);
  assert.equal(analytics.possibleMarks, 3);
  assert.deepEqual(analytics.players.map((player) => player.id), ["p1", "p2"]);
  assert.equal(analytics.players[0].matches, 2);
  assert.equal(analytics.players[0].scoreAggregate, 3);
  assert.equal(analytics.recentPerformance.length, 2);
});

test("results and ratings use recorded values with explicit sample counts", () => {
  const analytics = buildSportAnalytics("Football", players, sessions, matches, sportFormatConfig("Football", "11-a-side"), "11-a-side");
  assert.deepEqual(analytics.results, { wins: 1, losses: 0, draws: 1, noContests: 0, unreported: 0 });
  assert.equal(analytics.averageRating, 7);
  assert.equal(analytics.ratedScoreRows, 2);
  assert.equal(analytics.players[0].averageRating, 7);
  assert.equal(analytics.players[0].ratingCount, 2);
  assert.equal(analytics.recentRatings.length, 2);
});

test("empty sport returns honest empty values without inferred results", () => {
  const analytics = buildSportAnalytics("Hockey", players, sessions, matches, sportFormatConfig("Hockey", "Field hockey"), "Field hockey");
  assert.equal(analytics.playedMatches, 0);
  assert.equal(analytics.attendanceRate, null);
  assert.equal(analytics.averageRating, null);
  assert.deepEqual(analytics.results, { wins: 0, losses: 0, draws: 0, noContests: 0, unreported: 0 });
  assert.equal(analytics.players.length, 0);
});

test("missing and unsupported legacy formats are excluded instead of assigned to the first format", () => {
  const config = sportFormatConfig("Football", "11-a-side");
  const records = [
    { id: "known", date: "2026-02-01", sport: "Football", format: "11-a-side", opponent: "Known", status: "played", scores: [{ playerId: "p1", value: 1 }] },
    { id: "missing", date: "2026-02-02", sport: "Football", opponent: "Legacy", status: "played", scores: [{ playerId: "p1", value: 99 }] },
    { id: "unknown", date: "2026-02-03", sport: "Football", format: "Unknown", opponent: "Unknown", status: "scheduled", scores: [] },
  ];
  const analytics = buildSportAnalytics("Football", players, sessions, records, config, "11-a-side");
  assert.equal(analytics.playedMatches, 1);
  assert.equal(analytics.players[0].scoreAggregate, 1);
  assert.equal(analytics.unclassifiedMatches, 2);
  const invalidSelection = buildSportAnalytics("Football", players, sessions, records, config, "Unknown");
  assert.equal(invalidSelection.playedMatches, 0);
  assert.equal(invalidSelection.scheduledMatches, 0);
});

test("team sheets support bounded starters, substitutes, one captain and unique jersey numbers", () => {
  const valid = [
    { playerId: "starter-1", role: "starter", captain: true, jerseyNumber: 10, position: "Forward" },
    { playerId: "starter-2", role: "starter", jerseyNumber: 9, position: "Forward" },
    { playerId: "sub-1", role: "substitute", jerseyNumber: 12, position: "Midfielder" },
  ];
  assert.equal(validateTeamSheetEntries("Football", valid, "11-a-side"), true);
  assert.equal(validateTeamSheetEntries("Football", [...valid, { playerId: "sub-2", role: "substitute", jerseyNumber: 12 }], "11-a-side"), false);
  assert.equal(validateTeamSheetEntries("Football", [...valid, { playerId: "sub-2", role: "substitute", captain: true }], "11-a-side"), false);
  assert.equal(validateTeamSheetEntries("Football", Array.from({ length: 6 }, (_, index) => ({ playerId: `starter-${index}`, role: "starter" })), "Futsal"), false);
  assert.equal(validateTeamSheetEntries("Badminton", valid, "Singles"), false);
});

test("substitutes remain subject to the same-day closed-session Present rule", () => {
  const session = { playerIds: ["starter", "substitute", "absent"], attendance: [{ playerId: "starter", status: "Present" }, { playerId: "substitute", status: "Present" }, { playerId: "absent", status: "Absent" }] };
  assert.equal(canRecordParticipantScore("starter", session), true);
  assert.equal(canRecordParticipantScore("substitute", session), true);
  assert.equal(canRecordParticipantScore("absent", session), false);
  assert.equal(canRecordParticipantScore("not-rostered", session), false);
});

test("optional match time accepts only local 24-hour HH:mm values", () => {
  assert.equal(isLocalTime("09:05"), true);
  assert.equal(isLocalTime("23:59"), true);
  assert.equal(isLocalTime("24:00"), false);
  assert.equal(isLocalTime("9:05"), false);
  assert.equal(isLocalTime("09:60"), false);
});

test(`every one of the ${SPORTS.length} supported sports has an explicit safe match configuration`, () => {
  assert.deepEqual(Object.keys(SPORT_CONFIG).sort(), [...SPORTS].sort());
  for (const sport of SPORTS) {
    const base = SPORT_CONFIG[sport];
    assert.ok(base.formats.length > 0, `${sport} must have at least one format`);
    for (const format of base.formats) {
      assert.equal(isValidSportFormat(sport, format), true, `${sport}: ${format} should schedule`);
      const config = sportFormatConfig(sport, format);
      assert.ok(config?.scoreLabel && config.scoreUnit, `${sport}: ${format} needs a relevant statistic and unit`);
      assert.equal(validateSportScore(sport, config.scoreStep, format), true, `${sport}: ${format} score step must validate`);
      assert.equal(validateSportScore(sport, -config.scoreStep, format), false, `${sport}: negative score must reject`);
      if (config.scoreKind === "decimal") assert.equal(validateSportScore(sport, config.scoreStep / 2, format), false, `${sport}: ${format} rejects values outside its precision`);
      assert.equal(isValidSportFormat(sport, "Unsupported format"), false);
      if (config.kind === "team") {
        assert.ok(config.positions.length > 0, `${sport}: ${format} team sheet must describe positions/roles`);
        const max = sportTeamSheetLimit(sport, format);
        const ids = Array.from({ length: max }, (_, index) => `player-${index}`);
        assert.equal(validateTeamSheet(sport, ids, format, ids.map(() => config.positions[0])), true);
        assert.equal(validateTeamSheet(sport, [...ids, "extra-player"], format), false);
        assert.equal(validateTeamSheet(sport, ["duplicate", "duplicate"], format), false);
        assert.equal(validateParticipantEntries(sport, format, ["participant-1"]), true);
      } else {
        assert.equal(validateTeamSheet(sport, ["player-1"], format), false);
        const max = sportParticipantLimit(sport, format);
        const ids = Array.from({ length: max }, (_, index) => `participant-${index}`);
        assert.equal(validateParticipantEntries(sport, format, ids), true);
        assert.equal(validateParticipantEntries(sport, format, [...ids, "extra-participant"]), false);
        assert.equal(validateParticipantEntries(sport, format, ["duplicate", "duplicate"]), false);
      }
      const validValue = config.scoreStep * 2;
      assert.equal(aggregateScores(sport, [validValue, validValue * 2], format) !== null, true);
    }
  }
});

test("every catalogue sport calculates isolated format history from actual completed records", () => {
  for (const sport of SPORTS) {
    const base = SPORT_CONFIG[sport];
    for (const format of base.formats) {
      const config = sportFormatConfig(sport, format);
      const value = config.scoreStep * 2;
      const player = { id: "p1", name: "Real fixture participant", sport, sports: [sport], active: true, sportStats: [{ sport, attendance: 100, matches: 2, score: value, averageRating: 8, ratingCount: 1, status: "Ready" }] };
      const sessions = [{ id: "s1", date: "2026-04-01", sport, status: "closed", playerIds: ["p1"], attendance: [{ playerId: "p1", status: "Present" }] }];
      const matches = [
        { id: "played", date: "2026-04-02", sport, format, opponent: "Recorded opponent", status: "played", scores: [{ playerId: "p1", value, rating: 8 }], result: config.resultMode === "none" ? undefined : { outcome: "win" } },
        { id: "scheduled", date: "2026-04-03", sport, format, opponent: "Future opponent", status: "scheduled", scores: [] },
      ];
      const analytics = buildSportAnalytics(sport, [player], sessions, matches, config, format);
      assert.equal(analytics.playedMatches, 1, `${sport}/${format} only counts completed matches`);
      assert.equal(analytics.scheduledMatches, 1, `${sport}/${format} separately reports scheduled fixtures`);
      assert.equal(analytics.players[0].matches, 1);
      assert.equal(analytics.players[0].scoreAggregate, value);
      assert.equal(analytics.recentPerformance[0].value, value);
      assert.equal(analytics.closedSessions, 1);
      assert.equal(analytics.attendanceRate, 100);
    }
  }
});

test("coach, player, and scout match scopes prevent role and sport leakage", () => {
  const records = [
    { id: "f1", sport: "Football", status: "played", scores: [{ playerId: "p1", value: 2, rating: 8 }, { playerId: "p2", value: 1 }], lineup: ["p1", "p2"], teamSheet: [{ playerId: "p1", position: "Forward" }] },
    { id: "c1", sport: "Cricket", status: "played", scores: [{ playerId: "p1", value: 50 }], lineup: ["p1"] },
    { id: "f2", sport: "Football", status: "scheduled", scores: [] },
  ];
  const coach = scopeMatchesForViewer({ role: "coach", coachSports: ["Football"] }, records);
  assert.deepEqual(coach.map((match) => match.id), ["f1", "f2"]);
  assert.equal(canViewerManageSport({ role: "coach", coachSports: ["Football"] }, "Football"), true);
  assert.equal(canViewerManageSport({ role: "coach", coachSports: ["Football"] }, "Cricket"), false);
  assert.equal(canViewerManageSport({ role: "player", playerId: "p1" }, "Football"), false);
  const player = scopeMatchesForViewer({ role: "player", playerId: "p1" }, records);
  assert.deepEqual(player.map((match) => match.id), ["f1", "c1"]);
  assert.deepEqual(player[0].scores.map((score) => score.playerId), ["p1"]);
  assert.equal("lineup" in player[0], false);
  assert.equal("teamSheet" in player[0], false);
  assert.deepEqual(scopeMatchesForViewer({ role: "scout" }, records), []);
});


import { routeHarness, fixture as routeFixture } from './helpers/route-harness.mjs';

for (const sport of SPORTS) {
  test(sport + ': actual scheduling and score handlers accept every configured format', async () => {
    for (const format of SPORT_CONFIG[sport].formats) {
      const state = routeFixture();
      state.academies[0].sports = [sport];
      const actor = { id: 'coach', academyId: 'academy-a', role: 'coach', isOwner: true };
      const config = sportFormatConfig(sport, format);
      state.players.push({ id: 'p1', academyId: 'academy-a', active: true, name: 'Fixture athlete', sport, sports: [sport] });
      state.sessions.push({ id: 's1', academyId: 'academy-a', date: '2026-01-01', sport, status: 'closed', playerIds: ['p1'], attendance: [{ playerId: 'p1', status: 'Present' }] });
      const schedule = routeHarness('app/api/matches/route.ts', state, actor);
      const scheduled = await schedule.invoke('POST', undefined, { date: '2026-01-01', time: '15:30', sport, format, opponent: 'Test opponent', venue: 'Test venue' });
      assert.equal(scheduled.status, 201, sport + '/' + format);
      const { match } = await scheduled.json();
      assert.equal(match.format, format);
      assert.equal(match.time, '15:30');
      const update = routeHarness('app/api/matches/[id]/route.ts', state, actor);
      const sheet = await update.invoke('PATCH', match.id, { action: 'team-sheet', teamSheet: [{ playerId: 'p1', role: 'starter', captain: true, jerseyNumber: 1, ...(config.positions.length ? { position: config.positions[0] } : {}) }] });
      assert.equal(sheet.status, config.kind === 'team' ? 200 : 400, sport + '/' + format + ' sheet kind');
      const beforeInvalidScore = structuredClone(state);
      assert.equal((await update.invoke('PATCH', match.id, { scores: [{ playerId: 'p1', value: -1 }] })).status, 400);
      assert.deepEqual(structuredClone(state), beforeInvalidScore);
      assert.equal((await update.invoke('PATCH', match.id, { scores: [{ playerId: 'p1', value: config.scoreStep * 2, rating: 7.5 }] })).status, 200, sport + '/' + format + ' performance');
      assert.equal(state.matches[0].status, 'played');
      const analytics = buildSportAnalytics(sport, state.players, state.sessions, state.matches, config, format);
      assert.equal(analytics.players[0].scoreAggregate, config.scoreStep * 2);
      assert.equal(analytics.recentPerformance.length, 1);
      assert.equal((await update.invoke('PATCH', match.id, { scores: [{ playerId: 'p1', value: 999 }] })).status, 409);
    }
  });
}
