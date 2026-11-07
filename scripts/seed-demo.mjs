#!/usr/bin/env node
/**
 * Local-only KhelGrid demo seed.
 *
 * Writes only to a local app instance. The script refuses to run against a
 * non-local host, so it cannot write demo data to Atlas or another remote app.
 *
 * Start a local MongoDB and an app instance pointed at it, then run:
 *   node scripts/seed-demo.mjs
 *
 * Defaults to http://localhost:3200. Override with SEED_BASE if needed.
 * Re-run against the same local database with a suffix:
 *   SEED_SUFFIX=2 node scripts/seed-demo.mjs
 */

const BASE = (process.env.SEED_BASE || "http://localhost:3200").replace(/\/$/, "");
const PASSWORD = process.env.SEED_PASSWORD || "";
const rawSuffix = String(process.env.SEED_SUFFIX || "").trim().toLowerCase();
const suffix = rawSuffix ? `_${rawSuffix.replace(/[^a-z0-9._-]/g, "")}` : "";
const academyName = `KhelGrid Demo Academy${suffix ? ` ${suffix.slice(1)}` : ""}`;

let parsed;
try {
  parsed = new URL(BASE);
} catch {
  console.error(`SEED_BASE is not a valid URL: ${BASE}`);
  process.exit(1);
}
if (!new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(parsed.hostname)) {
  console.error(`Refusing to seed ${BASE}. This script only writes to a local app instance.`);
  process.exit(1);
}

const healthResponse = await fetch(`${BASE}/api/health`, { cache: "no-store" }).catch(() => null);
const health = healthResponse?.ok ? await healthResponse.json().catch(() => null) : null;
if (health?.localOnly !== true) {
  console.error("Refusing to seed: the local app must use local JSON storage or a loopback MongoDB instance.");
  process.exit(1);
}
console.error("This legacy demo seeder predates required email verification and cannot complete signup safely. No demo records were written.");
process.exit(1);

const cookies = new Map();

async function api(role, method, path, body, expected) {
  const headers = { "content-type": "application/json" };
  const cookie = cookies.get(role);
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : response.headers.get("set-cookie")
      ? [response.headers.get("set-cookie")]
      : [];
  for (const raw of setCookies) {
    const pair = raw.split(";")[0];
    if (pair.startsWith("excelrs_session=")) cookies.set(role, pair);
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  const expectedList = expected === undefined ? null : Array.isArray(expected) ? expected : [expected];
  if (expectedList && !expectedList.includes(response.status)) {
    const detail = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    throw new Error(`${method} ${path} expected HTTP ${expectedList.join("/")} but got ${response.status}\n${detail}`);
  }
  return { status: response.status, data };
}

function section(title) {
  console.log(`\n== ${title} ==`);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function check(condition, message, detail) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    if (detail) console.error(detail);
    process.exit(1);
  }
  pass(message);
}

function eq(actual, expected, message) {
  check(Object.is(actual, expected), message, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function statOf(players, playerId, sport) {
  const player = players.find((entry) => entry.id === playerId);
  const stat = player?.sportStats.find((entry) => entry.sport === sport);
  return stat ? `${stat.attendance}|${stat.matches}|${stat.status}` : "missing";
}

const coachUser = `khel_demo_coach${suffix}`;
const scoutUser = `khel_demo_scout${suffix}`;
const pendingScoutUser = `khel_demo_scout_pending${suffix}`;
const pendingCoachUser = `khel_demo_coach_pending${suffix}`;
const aaravUser = `khel_demo_player_aarav${suffix}`;
const priyaUser = `khel_demo_player_priya${suffix}`;
const rohitUser = `khel_demo_player_rohit${suffix}`;
const sumanUser = `khel_demo_player_suman${suffix}`;
const pendingPlayerUser = `khel_demo_player_pending${suffix}`;

console.log(`Local seed target: ${BASE}`);
console.log("This script refuses non-local hosts and never writes to Atlas.");

section("Create the demo academy");
const coachSignup = await api("coach", "POST", "/api/auth/signup", {
  role: "coach",
  academyMode: "create",
  displayName: "Demo Coach",
  username: coachUser,
  password: PASSWORD,
  academyName,
  location: "Dumka",
}, [201, 409]);
if (coachSignup.status === 409) {
  console.error(`\nThe demo coach "${coachUser}" already exists in this local database.`);
  console.error("Reset the local demo database, or re-run with a suffix such as SEED_SUFFIX=2.");
  process.exit(1);
}
pass(`coach ${coachUser} created`);
const coachBootstrap = await api("coach", "GET", "/api/bootstrap", undefined, 200);
const academyCode = coachBootstrap.data.academy.code;
check(typeof academyCode === "string" && academyCode.startsWith("EXR-"), "academy code captured", academyCode);
console.log(`Academy: ${academyName} (${academyCode})`);

section("Coach adds players");
async function addPlayer(name, age, sports) {
  const response = await api("coach", "POST", "/api/players", { name, age, sports }, 201);
  pass(`added ${name} (${response.data.player.id})`);
  return response.data.player;
}

const aarav = await addPlayer("Aarav Singh", 16, ["Football"]);
const vikram = await addPlayer("Vikram Oraon", 15, ["Football"]);
const rohit = await addPlayer("Rohit Murmu", 17, ["Football"]);
const suman = await addPlayer("Suman Hansda", 14, ["Football"]);
const arjun = await addPlayer("Arjun Das", 16, ["Football", "Athletics"]);
const rahul = await addPlayer("Rahul Munda", 18, ["Football"]);
const imran = await addPlayer("Imran Khan", 17, ["Cricket"]);
const deepak = await addPlayer("Deepak Mahto", 16, ["Cricket"]);
const sameer = await addPlayer("Sameer Alam", 15, ["Cricket"]);
const ananya = await addPlayer("Ananya Sen", 15, ["Badminton"]);
const priya = await addPlayer("Priya Kumari", 14, ["Badminton"]);
const kiran = await addPlayer("Kiran Bediya", 15, ["Athletics"]);
const neha = await addPlayer("Neha Tirkey", 16, ["Basketball"]);

await api("coach", "PATCH", "/api/academy", {
  sports: ["Football", "Cricket", "Badminton", "Athletics", "Basketball"],
}, 200);
pass("academy sports configured");

const archived = await api("coach", "PATCH", `/api/players/${rahul.id}`, { active: false }, 200);
eq(archived.data.player.active, false, "Rahul archived for the restore flow");

section("Closed attendance sessions");
const sessionPresent = new Map();

async function runSession(date, sport, presentIds) {
  const opened = await api("coach", "POST", "/api/sessions", { date, sport }, 201);
  const session = opened.data.session;
  const unexpected = presentIds.filter((id) => !session.playerIds.includes(id));
  if (unexpected.length) throw new Error(`Present player is not on the ${sport} roster for ${date}: ${unexpected.join(", ")}`);
  const present = new Set(presentIds);
  for (const playerId of session.playerIds) {
    await api("coach", "PATCH", `/api/sessions/${session.id}`, {
      action: "mark",
      playerId,
      status: present.has(playerId) ? "Present" : "Absent",
    }, 200);
  }
  const closed = await api("coach", "PATCH", `/api/sessions/${session.id}`, { action: "close" }, 200);
  eq(closed.data.session.status, "closed", `${sport} ${date} closed`);
  sessionPresent.set(`${date}|${sport}`, present);
  return session;
}

await runSession("2026-10-20", "Football", [aarav.id, vikram.id, rohit.id, suman.id, arjun.id]);
await runSession("2026-10-22", "Football", [aarav.id, vikram.id, suman.id, arjun.id]);
await runSession("2026-10-24", "Football", [aarav.id, rohit.id, suman.id, arjun.id]);
await runSession("2026-10-26", "Football", [aarav.id, vikram.id, arjun.id]);

await runSession("2026-10-21", "Cricket", [imran.id, deepak.id, sameer.id]);
await runSession("2026-10-23", "Cricket", [imran.id, deepak.id]);
await runSession("2026-10-25", "Cricket", [imran.id]);

await runSession("2026-10-20", "Badminton", [ananya.id, priya.id]);
await runSession("2026-10-22", "Badminton", [ananya.id]);
await runSession("2026-10-24", "Badminton", [ananya.id]);

await runSession("2026-10-21", "Athletics", [kiran.id, arjun.id]);
await runSession("2026-10-23", "Athletics", [kiran.id]);
await runSession("2026-10-25", "Athletics", [kiran.id, arjun.id]);

await runSession("2026-10-20", "Basketball", [neha.id]);
await runSession("2026-10-22", "Basketball", [neha.id]);
await runSession("2026-10-24", "Basketball", [neha.id]);

section("Played matches, including score-only results");
async function createMatch(date, sport, opponent, venue) {
  const response = await api("coach", "POST", "/api/matches", { date, sport, opponent, venue }, 201);
  pass(`scheduled ${sport} ${date} vs ${opponent}`);
  return response.data.match;
}

async function recordMatch(match, scores, result) {
  const present = sessionPresent.get(`${match.date}|${match.sport}`);
  if (!present) throw new Error(`No closed session for ${match.date} ${match.sport}`);
  for (const score of scores) {
    if (!present.has(score.playerId)) throw new Error(`Player ${score.playerId} was not present on ${match.date} ${match.sport}`);
  }
  const body = { scores };
  if (result) body.result = result;
  const response = await api("coach", "PATCH", `/api/matches/${match.id}`, body, 200);
  eq(response.data.match.status, "played", `${match.sport} ${match.date} recorded`);
  if (result) {
    check(Boolean(response.data.match.result), `${match.sport} ${match.date} has a final result`);
  } else {
    eq(response.data.match.result, undefined, `${match.sport} ${match.date} is score-only`);
  }
}

const f1 = await createMatch("2026-10-20", "Football", "Dumka United", "Dumka Ground");
await recordMatch(f1, [
  { playerId: aarav.id, value: 1, rating: 8.5 },
  { playerId: vikram.id, value: 1, rating: 7.5 },
  { playerId: rohit.id, value: 1, rating: 7 },
  { playerId: suman.id, value: 0, rating: 7.5 },
  { playerId: arjun.id, value: 0, rating: 7 },
], { academyScore: "3", opponentScore: "1", outcome: "win", detail: "Won by 2 goals" });

const f2 = await createMatch("2026-10-22", "Football", "Santhal XI", "Dumka Ground");
await recordMatch(f2, [
  { playerId: aarav.id, value: 1, rating: 8 },
  { playerId: suman.id, value: 1, rating: 8.5 },
  { playerId: arjun.id, value: 0, rating: 7.5 },
]);

const f3 = await createMatch("2026-10-24", "Football", "Ranchi Rovers", "Dumka Ground");
await recordMatch(f3, [
  { playerId: aarav.id, value: 1, rating: 8.5 },
  { playerId: rohit.id, value: 1, rating: 7.5 },
  { playerId: arjun.id, value: 0, rating: 7 },
], { academyScore: "2", opponentScore: "2", outcome: "draw", detail: "Honours even" });

const c1 = await createMatch("2026-10-21", "Cricket", "Dumka Cricket Club", "Dumka Cricket Ground");
await recordMatch(c1, [
  { playerId: imran.id, value: 45, rating: 9 },
  { playerId: deepak.id, value: 32, rating: 7.5 },
  { playerId: sameer.id, value: 10, rating: 6.5 },
], { academyScore: "167/8", opponentScore: "162/10", outcome: "win", detail: "Won by 5 runs" });

const c2 = await createMatch("2026-10-23", "Cricket", "Santhal Cricket XI", "Dumka Cricket Ground");
await recordMatch(c2, [
  { playerId: imran.id, value: 38, rating: 8.5 },
  { playerId: deepak.id, value: 21, rating: 7 },
]);

const b1 = await createMatch("2026-10-20", "Badminton", "Dumka Shuttlers", "Dumka Indoor Hall");
await recordMatch(b1, [
  { playerId: ananya.id, value: 21, rating: 8.5 },
  { playerId: priya.id, value: 15, rating: 7 },
], { academyScore: "2", opponentScore: "1", outcome: "win", detail: "Won the tie 2-1" });

const b2 = await createMatch("2026-10-22", "Badminton", "Ranchi Smashers", "Dumka Indoor Hall");
await recordMatch(b2, [
  { playerId: ananya.id, value: 21, rating: 9 },
]);

const a1 = await createMatch("2026-10-21", "Athletics", "Dumka Athletics Meet", "Dumka Stadium");
await recordMatch(a1, [
  { playerId: kiran.id, value: 12, rating: 8.5 },
  { playerId: arjun.id, value: 13, rating: 7.5 },
], { academyScore: "1", opponentScore: "0", outcome: "win", detail: "Won the 100m final" });

const a2 = await createMatch("2026-10-23", "Athletics", "Santhal Meet", "Dumka Stadium");
await recordMatch(a2, [
  { playerId: kiran.id, value: 11, rating: 9 },
]);

const a3 = await createMatch("2026-10-25", "Athletics", "Ranchi Relays", "Dumka Stadium");
await recordMatch(a3, [
  { playerId: arjun.id, value: 12, rating: 8 },
]);

const bb1 = await createMatch("2026-10-20", "Basketball", "Dumka Hoopers", "Dumka Indoor Court");
await recordMatch(bb1, [
  { playerId: neha.id, value: 22, rating: 9 },
], { academyScore: "78", opponentScore: "71", outcome: "win", detail: "Won by 7 points" });

const bb2 = await createMatch("2026-10-22", "Basketball", "Ranchi Ballers", "Dumka Indoor Court");
await recordMatch(bb2, [
  { playerId: neha.id, value: 18, rating: 8.5 },
]);

section("Leave an open session and scheduled fixtures for live testing");
const openFootball = await api("coach", "POST", "/api/sessions", { date: "2026-11-03", sport: "Football" }, 201);
pass(`open Football session on 2026-11-03 (${openFootball.data.session.playerIds.length} players)`);
await createMatch("2026-11-03", "Football", "Deoghar Dynamos", "Dumka Ground");
await createMatch("2026-11-04", "Cricket", "Ranchi Royals", "Dumka Cricket Ground");

section("Player accounts and the coach approval flow");
async function signupPlayer(role, player, username) {
  const response = await api(role, "POST", "/api/auth/signup", {
    role: "player",
    displayName: player.name,
    username,
    password: PASSWORD,
    academyCode,
    playerId: player.id,
    age: player.age,
    sports: player.sports,
  }, 202);
  pass(`${player.name} signup is pending (${username})`);
  return response.data.user;
}

async function approveUser(userId, label) {
  await api("coach", "PATCH", `/api/users/${userId}`, { status: "active" }, 200);
  pass(`${label} approved`);
}

async function login(role, username, label) {
  await api(role, "POST", "/api/auth/login", { username, password: PASSWORD }, 200);
  pass(`${label} signed in`);
}

const aaravUserRecord = await signupPlayer("playerAarav", aarav, aaravUser);
await approveUser(aaravUserRecord.id, "Aarav's player account");
await login("playerAarav", aaravUser, "Aarav");
const sportRequest = await api("playerAarav", "POST", `/api/players/${aarav.id}/sports`, { sports: ["Badminton"] }, 201);
eq(sportRequest.data.requested.includes("Badminton"), true, "Aarav requested Badminton");

const priyaUserRecord = await signupPlayer("playerPriya", priya, priyaUser);
await approveUser(priyaUserRecord.id, "Priya's player account");
await login("playerPriya", priyaUser, "Priya");

const rohitUserRecord = await signupPlayer("playerRohit", rohit, rohitUser);
await approveUser(rohitUserRecord.id, "Rohit's player account");
await login("playerRohit", rohitUser, "Rohit");

const sumanUserRecord = await signupPlayer("playerSuman", suman, sumanUser);
await approveUser(sumanUserRecord.id, "Suman's player account");
await login("playerSuman", sumanUser, "Suman");

await signupPlayer("pendingPlayer", vikram, pendingPlayerUser);
const pendingPlayerLogin = await api("pendingPlayer", "POST", "/api/auth/login", { username: pendingPlayerUser, password: PASSWORD }, 401);
check(/pending/i.test(pendingPlayerLogin.data?.error || ""), "pending player cannot sign in yet");

section("Scout accounts and the coach approval flow");
const activeScoutSignup = await api("scout", "POST", "/api/auth/signup", {
  role: "scout",
  displayName: "Demo Scout",
  username: scoutUser,
  password: PASSWORD,
  academyCode,
}, 202);
await approveUser(activeScoutSignup.data.user.id, "active scout account");
await login("scout", scoutUser, "active scout");

await api("pendingScout", "POST", "/api/auth/signup", {
  role: "scout",
  displayName: "Pending Scout",
  username: pendingScoutUser,
  password: PASSWORD,
  academyCode,
}, 202);
const pendingScoutLogin = await api("pendingScout", "POST", "/api/auth/login", { username: pendingScoutUser, password: PASSWORD }, 401);
check(/pending/i.test(pendingScoutLogin.data?.error || ""), "pending scout cannot sign in yet");

section("Pending coach account for owner approval");
await api("pendingCoach", "POST", "/api/auth/signup", {
  role: "coach",
  academyMode: "join",
  displayName: "Pending Coach",
  username: pendingCoachUser,
  password: PASSWORD,
  academyCode,
  sports: ["Cricket"],
}, 202);
const pendingCoachLogin = await api("pendingCoach", "POST", "/api/auth/login", { username: pendingCoachUser, password: PASSWORD }, 401);
check(/pending/i.test(pendingCoachLogin.data?.error || ""), "pending coach cannot sign in yet");

section("Verify readiness and scoped views");
const coachData = (await api("coach", "GET", "/api/bootstrap", undefined, 200)).data;
eq(coachData.players.length, 13, "coach sees all 13 player records");
eq(coachData.players.filter((player) => player.active).length, 12, "12 players are active");
eq(coachData.players.find((player) => player.id === rahul.id)?.active, false, "archived player remains visible to the coach");

console.log("\nReadiness (coach view):");
console.log("Player                  Sport        Attendance  Matches  Status");
for (const player of coachData.players) {
  for (const stat of player.sportStats) {
    console.log(`${player.name.padEnd(22)} ${stat.sport.padEnd(12)} ${String(`${stat.attendance}%`).padEnd(11)} ${String(stat.matches).padEnd(8)} ${stat.status}`);
  }
}

eq(statOf(coachData.players, aarav.id, "Football"), "100|3|Ready", "Aarav is 100% with 3 matches -> Ready");
eq(statOf(coachData.players, vikram.id, "Football"), "75|1|Developing", "Vikram is 75% with 1 match -> Developing");
eq(statOf(coachData.players, rohit.id, "Football"), "50|2|Developing", "Rohit is 50% with 2 matches -> Developing");
eq(statOf(coachData.players, suman.id, "Football"), "75|2|Ready", "Suman is 75% with 2 matches -> Ready");
eq(statOf(coachData.players, arjun.id, "Football"), "100|3|Ready", "Arjun is Ready in Football");
eq(statOf(coachData.players, arjun.id, "Athletics"), "66.6|2|Developing", "Arjun is Developing in Athletics");
eq(statOf(coachData.players, imran.id, "Cricket"), "100|2|Ready", "Imran is Ready in Cricket");
eq(statOf(coachData.players, deepak.id, "Cricket"), "66.6|2|Developing", "Deepak is under 75%");
eq(statOf(coachData.players, ananya.id, "Badminton"), "100|2|Ready", "Ananya is Ready in Badminton");
eq(statOf(coachData.players, priya.id, "Badminton"), "33.3|1|Developing", "Priya is under 75%");
eq(statOf(coachData.players, kiran.id, "Athletics"), "100|2|Ready", "Kiran is Ready in Athletics");
eq(statOf(coachData.players, neha.id, "Basketball"), "100|2|Ready", "Neha is Ready in Basketball");

const scoutData = (await api("scout", "GET", "/api/bootstrap", undefined, 200)).data;
eq(scoutData.players.length, 7, "scout sees exactly the 7 Ready players");
const expectedScoutNames = ["Aarav Singh", "Arjun Das", "Suman Hansda", "Imran Khan", "Ananya Sen", "Kiran Bediya", "Neha Tirkey"].sort();
eq(JSON.stringify(scoutData.players.map((player) => player.name).sort()), JSON.stringify(expectedScoutNames), "scout sees only Ready players");
for (const player of scoutData.players) {
  for (const stat of player.sportStats) {
    eq(stat.status, "Ready", `${player.name} ${stat.sport} is Ready for the scout`);
  }
}
eq(scoutData.sessions.length, 0, "scout sees no attendance sheets");
eq(scoutData.matches.length, 0, "scout sees no match records");

section("Trial calls and the player shortlist");
const aaravTrial = await api("scout", "POST", "/api/trials", { playerId: aarav.id, sport: "Football" }, 201);
pass(`active scout called Aarav for a Football trial (${aaravTrial.data.trial.id})`);
const duplicateTrial = await api("scout", "POST", "/api/trials", { playerId: aarav.id, sport: "Football" }, 409);
check(/already/i.test(duplicateTrial.data?.error || ""), "duplicate trial call is blocked");
const notReadyTrial = await api("scout", "POST", "/api/trials", { playerId: priya.id, sport: "Badminton" }, 400);
check(/not Ready/i.test(notReadyTrial.data?.error || ""), "a Developing player cannot be called for a trial");
const wrongSportTrial = await api("scout", "POST", "/api/trials", { playerId: aarav.id, sport: "Cricket" }, 400);
check(/not registered/i.test(wrongSportTrial.data?.error || ""), "a trial call needs a sport the player is registered for");
const imranTrial = await api("scout", "POST", "/api/trials", { playerId: imran.id, sport: "Cricket" }, 201);
pass("active scout called Imran for a Cricket trial");
const sumanTrial = await api("scout", "POST", "/api/trials", { playerId: suman.id, sport: "Football" }, 201);
pass("active scout called Suman for a Football trial");
await api("scout", "DELETE", `/api/trials/${sumanTrial.data.trial.id}`, undefined, 200);
pass("active scout withdrew Suman's trial call");
const withdrawnAgain = await api("scout", "DELETE", `/api/trials/${sumanTrial.data.trial.id}`, undefined, 409);
check(/already withdrawn/i.test(withdrawnAgain.data?.error || ""), "a withdrawn trial call cannot be withdrawn twice");
const playerCannotCall = await api("playerAarav", "POST", "/api/trials", { playerId: imran.id, sport: "Cricket" }, 403);
check(/permission/i.test(playerCannotCall.data?.error || ""), "a player cannot call a trial");
const coachCannotCall = await api("coach", "POST", "/api/trials", { playerId: imran.id, sport: "Cricket" }, 403);
check(/permission/i.test(coachCannotCall.data?.error || ""), "a coach cannot call a trial");
const coachTrialCheck = (await api("coach", "GET", "/api/bootstrap", undefined, 200)).data;
eq(coachTrialCheck.trials.length, 3, "coach sees the academy's three trial calls");
eq(coachTrialCheck.trials.filter((trial) => trial.status === "active").length, 2, "coach sees two active trial calls");
const scoutTrialCheck = (await api("scout", "GET", "/api/bootstrap", undefined, 200)).data;
eq(scoutTrialCheck.trials.length, 3, "scout sees her own three trial calls");
eq(scoutTrialCheck.trials.find((trial) => trial.playerId === aarav.id && trial.sport === "Football")?.status, "active", "Aarav's Football trial is active");
eq(scoutTrialCheck.trials.find((trial) => trial.playerId === imran.id && trial.sport === "Cricket")?.status, "active", "Imran's Cricket trial is active");
eq(scoutTrialCheck.trials.find((trial) => trial.playerId === suman.id && trial.sport === "Football")?.status, "withdrawn", "Suman's Football trial is withdrawn");

const aaravView = (await api("playerAarav", "GET", "/api/bootstrap", undefined, 200)).data;
eq(aaravView.players.length, 1, "Aarav sees exactly one player row");
eq(aaravView.players[0].id, aarav.id, "Aarav sees his own Player ID");
eq(aaravView.players[0].status, "Ready", "Aarav's own row is Ready");
eq(aaravView.players[0].sportRequests.some((request) => request.sport === "Badminton" && request.status === "pending"), true, "Aarav sees his pending Badminton request");
eq(aaravView.academy.code, "", "Aarav cannot see the academy code");
eq(aaravView.trials.length, 1, "Aarav sees his one trial call");
eq(aaravView.trials[0].sport, "Football", "Aarav's trial call is for Football");
eq(aaravView.trials[0].status, "active", "Aarav is shortlisted for the Football trial");
eq(aaravView.trials[0].scoutName, "Demo Scout", "Aarav sees the calling scout");
eq(aaravView.trials.some((trial) => trial.playerId === imran.id), false, "Aarav cannot see another player's trial");

const priyaView = (await api("playerPriya", "GET", "/api/bootstrap", undefined, 200)).data;
eq(priyaView.players.length, 1, "Priya sees exactly one player row");
eq(priyaView.players[0].id, priya.id, "Priya sees her own Player ID");
eq(statOf(priyaView.players, priya.id, "Badminton"), "33.3|1|Developing", "Priya sees her Developing Badminton record");
eq(priyaView.trials.length, 0, "Priya is not shortlisted for any trial");

const rohitView = (await api("playerRohit", "GET", "/api/bootstrap", undefined, 200)).data;
eq(rohitView.players.length, 1, "Rohit sees exactly one player row");
eq(rohitView.players[0].id, rohit.id, "Rohit sees his own Player ID");
eq(rohitView.sessions.find((session) => session.date === "2026-10-22")?.attendance[0].status, "Absent", "Rohit sees his 2026-10-22 absence");
eq(rohitView.sessions.find((session) => session.date === "2026-10-26")?.attendance[0].status, "Absent", "Rohit sees his 2026-10-26 absence");
eq(rohitView.matches.length, 2, "Rohit sees only his two match rows");
eq(rohitView.trials.length, 0, "Rohit is not shortlisted for any trial");

const sumanView = (await api("playerSuman", "GET", "/api/bootstrap", undefined, 200)).data;
eq(sumanView.players.length, 1, "Suman sees exactly one player row");
eq(sumanView.trials.length, 1, "Suman sees his one trial call");
eq(sumanView.trials[0].sport, "Football", "Suman's trial call is for Football");
eq(sumanView.trials[0].status, "withdrawn", "Suman sees his trial call was withdrawn");
eq(sumanView.trials[0].scoutName, "Demo Scout", "Suman sees the calling scout");

section("Pending items waiting in Coach -> Access");
console.log("Pending account requests:");
for (const user of coachData.pendingUsers) console.log(`- ${user.displayName} (@${user.username}) · ${user.role}`);
console.log("Pending sport requests:");
for (const request of coachData.pendingSportRequests) console.log(`- ${request.playerName} · ${request.sport}`);
eq(coachData.pendingUsers.length, 3, "three pending account requests are waiting");
eq(coachData.pendingSportRequests.length, 1, "Aarav's Badminton request is waiting");
eq(coachData.pendingSportRequests[0].playerId, aarav.id, "the pending sport request belongs to Aarav");

section("Demo seed complete");
console.log(`Local app: ${BASE}`);
console.log(`Academy: ${academyName} (${academyCode})`);
console.log(`Archived player: Rahul Munda (${rahul.id}) — restore from Players`);
console.log("Open session: Football 2026-11-03 — mark everyone and close it to score the scheduled fixture.");
console.log("Scheduled fixtures: Football 2026-11-03 vs Deoghar Dynamos; Cricket 2026-11-04 vs Ranchi Royals.");
console.log("Trial calls: Aarav Football active; Imran Cricket active; Suman Football withdrawn.");
console.log("Player Trials tab: Aarav shortlisted; Suman withdrawn; Priya not shortlisted.");
console.log("Approve the pending accounts and Aarav's Badminton request from Coach -> Access.");
console.log(`\nThis seed wrote only to ${BASE} (local). Atlas was not touched.`);
