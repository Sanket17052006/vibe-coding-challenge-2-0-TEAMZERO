#!/usr/bin/env node
/** Real Next.js HTTP integration in an isolated temporary copy. No dotenv, real SMTP or MongoDB. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, cp, symlink, writeFile, readFile, appendFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { importTypeScript } from "../tests/helpers/import-typescript.mjs";
const { SPORTS } = await importTypeScript(new URL("../lib/sports.ts", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const workspace = await mkdtemp(path.join(os.tmpdir(), "khelgrid-http-"));
const outboxPath = path.join(workspace, "test-recipient-outbox.jsonl");
const statePath = path.join(workspace, "data/excelrs.json");
let server;
let passed = 0;
const pass = message => { passed++; console.log("PASS: " + message); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  for (const entry of ["app", "components", "lib", "public", "package.json", "package-lock.json", "tsconfig.json", "next.config.ts", "next-env.d.ts"]) await cp(path.join(sourceRoot, entry), path.join(workspace, entry), { recursive: true });
  await symlink(path.join(sourceRoot, "node_modules"), path.join(workspace, "node_modules"), "junction");
  await writeFile(outboxPath, "", { mode: 0o600 });
  // Only this temporary copy substitutes delivery with a recipient outbox. The real application is untouched.
  await writeFile(path.join(workspace, "lib/smtp-email.ts"), [
    'import { appendFile } from "node:fs/promises";',
    'export type OutgoingEmail = { to: string; subject: string; html: string };',
    'export async function sendSmtpEmail(email: OutgoingEmail) {',
    ' if (process.env.NODE_ENV !== "development" || !process.env.KHELGRID_TEST_OUTBOX_PATH) throw new Error("Isolated outbox is unavailable");',
    ' const href = email.html.match(/href="([^"]+)"/)?.[1]; if (!href) throw new Error("Missing test email link");',
    ' const link = new URL(href); const token = new URLSearchParams(link.hash.slice(1)).get("token");',
    ' await appendFile(process.env.KHELGRID_TEST_OUTBOX_PATH, JSON.stringify({ to: email.to, kind: link.pathname.includes("verify") ? "verify" : "reset", token }) + "\\n");',
    '}',
  ].join("\n"));
  const port = await new Promise((resolve, reject) => { const listener = net.createServer(); listener.once("error", reject); listener.listen(0, "127.0.0.1", () => { const address = listener.address(); const selected = address.port; listener.close(() => resolve(selected)); }); });
  const base = "http://127.0.0.1:" + port;
  const environment = Object.fromEntries(["SystemRoot", "SystemDrive", "PATH", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(environment, { NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", SESSION_SECRET: randomBytes(48).toString("hex"), APP_URL: base, MONGODB_URI: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", EMAIL_FROM: "", KHELGRID_TEST_OUTBOX_PATH: outboxPath });
  server = spawn(process.execPath, [path.join(sourceRoot, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: workspace, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", () => {}); server.stderr.on("data", () => {});
  let startupError;
  server.once("error", error => { startupError = error; });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (startupError || server.exitCode !== null) throw new Error("Isolated Next server could not start");
    try { if ((await fetch(base + "/api/health")).ok) { ready = true; break; } } catch { /* wait for startup */ }
    await pause(500);
  }
  assert.ok(ready, "Isolated server startup timed out");
  async function api(url, method = "GET", body, cookie, expected = 200) {
    const response = await fetch(base + url, { method, headers: { ...(body ? { "Content-Type": "application/json", Origin: base } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (expected !== null) assert.equal(response.status, expected, method + " " + url + ": " + (data.error ?? "Unexpected status"));
    return { response, data, status: response.status, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  const loadState = async () => JSON.parse(await readFile(statePath, "utf8"));
  const password = "Test-" + randomBytes(18).toString("hex");
  const signup = async (username, role, sports, name = "Test " + username) => api("/api/auth/signup", "POST", { username, displayName: name, email: username + "@example.invalid", password, role, sports, ...(role === "player" ? { age: 16 } : {}) }, undefined, 202);
  const emailToken = async (username, kind = "verify") => (await readFile(outboxPath, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line)).filter(row => row.to === username + "@example.invalid" && row.kind === kind).at(-1)?.token;
  const verify = async username => api("/api/auth/verify-email", "POST", { token: await emailToken(username) });
  const login = async (username, secret = password) => api("/api/auth/login", "POST", { username, password: secret });
  const metadata = await api("/api/academy"); assert.equal(metadata.data.academy, null); assert.equal(metadata.data.sports.length, 28);
  const first = await signup("httpcoachone", "coach", [...SPORTS]);
  const second = await signup("httpcoachtwo", "coach", ["Cricket"]);
  let persisted = await loadState();
  assert.equal(persisted.academies.length, 0); assert.ok(persisted.users.every(user => !user.isOwner && user.status === "pending"));
  assert.equal(new Set(persisted.users.map(user => user.academyId)).size, 1);
  await api("/api/auth/login", "POST", { username: "httpcoachone", password }, undefined, 403);
  await Promise.all([verify("httpcoachone"), verify("httpcoachtwo")]);
  persisted = await loadState();
  assert.equal(persisted.academies.length, 1); assert.equal(persisted.users.filter(user => user.isOwner).length, 1); assert.equal(persisted.users.filter(user => user.status === "active").length, 2);
  const academyId = persisted.academies[0].id;
  let coach = await login("httpcoachone"); let secondCoach = await login("httpcoachtwo");
  let owner = persisted.users.find(user => user.isOwner).username === "httpcoachone" ? coach : secondCoach;
  pass("first and simultaneous Coach verification initialize one academy/owner without configuration");
  await api("/api/auth/verify-email", "POST", { token: await emailToken("httpcoachone") }, undefined, 400);
  await api("/api/auth/verify-email", "POST", { token: "invalid-test-token" }, undefined, 400);
  const third = await signup("httpcoachthree", "coach", ["Swimming"]); await verify("httpcoachthree"); await login("httpcoachthree");
  assert.equal((await loadState()).academies.length, 1); pass("additional verified Coaches activate without approval; reused/invalid tokens reject");
  await api("/api/sessions", "POST", { date: "2026-01-01", sport: "Football" }, secondCoach.cookie, 403);
  const target = owner.data.user.id === coach.data.user.id ? secondCoach : coach;
  const originalSports = target.data.user.coachSports;
  await api("/api/users/" + target.data.user.id, "PATCH", { action: "coach-permissions", sports: ["Football"] }, owner.cookie);
  await api("/api/auth/me", "GET", undefined, target.cookie, 401);
  await api("/api/users/" + target.data.user.id, "PATCH", { action: "coach-permissions", sports: originalSports }, owner.cookie);
  coach = await login("httpcoachone"); secondCoach = await login("httpcoachtwo");
  owner = owner.data.user.id === coach.data.user.id ? coach : secondCoach;
  await api("/api/users/" + owner.data.user.id, "PATCH", { action: "coach-access", status: "declined" }, owner.cookie, 409);
  pass("sport restrictions, owner-only Coach management and permission-change session invalidation");
  const roster = (await api("/api/players", "POST", { name: "HTTP Test Athlete", age: 16, sports: ["Football"] }, coach.cookie, 201)).data.player;
  const playerSignup = await signup("httpplayer", "player", ["Football"], "HTTP Test Athlete");
  await verify("httpplayer"); await api("/api/auth/login", "POST", { username: "httpplayer", password }, undefined, 401);
  await api("/api/users/" + playerSignup.data.user.id, "PATCH", { status: "active", playerId: roster.id }, coach.cookie);
  let player = await login("httpplayer");
  const duplicate = await signup("httpduplicate", "player", ["Football"], "HTTP Test Athlete"); await verify("httpduplicate");
  await api("/api/users/" + duplicate.data.user.id, "PATCH", { status: "active", playerId: roster.id }, coach.cookie, 409);
  persisted = await loadState(); assert.equal(persisted.players.find(p => p.id === roster.id).userId, playerSignup.data.user.id);
  pass("Player verification, approval and matching roster link preserve ownership on collision");
  const scoutSignup = await signup("httpscout", "scout", ["Football"]); await verify("httpscout");
  await api("/api/auth/login", "POST", { username: "httpscout", password }, undefined, 401);
  await api("/api/users/" + scoutSignup.data.user.id, "PATCH", { status: "active" }, coach.cookie);
  const scout = await login("httpscout");
  for (const [index, date] of ["2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"].entries()) {
    const session = (await api("/api/sessions", "POST", { date, sport: "Football" }, coach.cookie, 201)).data.session;
    await api("/api/sessions/" + session.id, "PATCH", { action: "mark", playerId: roster.id, status: index < 3 ? "Present" : "Absent" }, coach.cookie);
    await api("/api/sessions/" + session.id, "PATCH", { action: "close" }, coach.cookie);
    await api("/api/sessions/" + session.id, "PATCH", { action: "mark", playerId: roster.id, status: "Present" }, coach.cookie, 409);
  }
  for (let index = 0; index < 2; index++) {
    const match = (await api("/api/matches", "POST", { date: "2026-01-0" + (index + 2), sport: "Football", opponent: "HTTP Opponent " + index }, coach.cookie, 201)).data.match;
    await api("/api/matches/" + match.id, "PATCH", { scores: [{ playerId: roster.id, value: 1, rating: 8 }] }, coach.cookie);
    const stats = (await api("/api/bootstrap", "GET", undefined, player.cookie)).data.players[0].sportStats[0];
    assert.equal(stats.attendance, 75); assert.equal(stats.status, index === 0 ? "Developing" : "Ready");
  }
  const absent = (await api("/api/matches", "POST", { date: "2026-01-05", sport: "Football", opponent: "Absent Restriction" }, coach.cookie, 201)).data.match;
  await api("/api/matches/" + absent.id, "PATCH", { scores: [{ playerId: roster.id, value: 1 }] }, coach.cookie, 400);
  const scoutData = (await api("/api/bootstrap", "GET", undefined, scout.cookie)).data;
  assert.deepEqual(scoutData.players.map(p => p.id), [roster.id]);
  assert.ok(!Object.hasOwn(scoutData.players[0], "age") && !Object.hasOwn(scoutData.players[0], "userId"));
  assert.equal(scoutData.matches.length, 2); assert.equal(scoutData.sessions.length, 0);
  const playerData = (await api("/api/bootstrap", "GET", undefined, player.cookie)).data;
  assert.deepEqual(playerData.players.map(p => p.id), [roster.id]);
  for (const role of [player, scout]) { await api("/api/audit", "GET", undefined, role.cookie, 403); await api("/api/players", "POST", { name: "Denied", age: 16, sports: ["Football"] }, role.cookie, 403); }
  await api("/api/players/EX-NOT-OWN/sports", "POST", { sports: ["Cricket"] }, player.cookie, 403);
  pass("Scout approval/privacy and Player isolation, match history, closed sheets, absent restriction, exact readiness");
  const trial = (await api("/api/trials", "POST", { playerId: roster.id, sport: "Football" }, scout.cookie, 201)).data.trial;
  await api("/api/trials/" + trial.id, "DELETE", undefined, scout.cookie);
  pass("Scout trial creation and withdrawal remain functional");
  for (const sport of SPORTS) {
    const athlete = (await api("/api/players", "POST", { name: "HTTP " + sport + " Athlete", age: 18, sports: [sport] }, coach.cookie, 201)).data.player;
    const session = (await api("/api/sessions", "POST", { date: "2026-03-01", sport }, coach.cookie, 201)).data.session;
    for (const id of session.playerIds) await api("/api/sessions/" + session.id, "PATCH", { action: "mark", playerId: id, status: "Present" }, coach.cookie);
    await api("/api/sessions/" + session.id, "PATCH", { action: "close" }, coach.cookie);
    const match = (await api("/api/matches", "POST", { date: "2026-03-01", time: "16:00", venue: "Isolated test venue", sport, opponent: "HTTP Test Opponent" }, coach.cookie, 201)).data.match;
    await api("/api/matches/" + match.id, "PATCH", { scores: [{ playerId: athlete.id, value: 10 }] }, coach.cookie);
  }
  pass("all 28 sports persist attendance, scheduling and valid default-format performances through actual APIs");
  const unknown = await api("/api/auth/forgot-password", "POST", { email: "unknown@example.invalid" });
  const known = await api("/api/auth/forgot-password", "POST", { email: "httpplayer@example.invalid" }); assert.deepEqual(known.data, unknown.data);
  const resetToken = await emailToken("httpplayer", "reset"); const newPassword = "Reset-" + randomBytes(18).toString("hex");
  const resetBody = { token: resetToken, password: newPassword, confirmPassword: newPassword };
  const resetResults = await Promise.all([api("/api/auth/reset-password", "POST", resetBody, undefined, null), api("/api/auth/reset-password", "POST", resetBody, undefined, null)]);
  assert.deepEqual(resetResults.map(r => r.status).sort(), [200, 400]); assert.ok(resetResults.every(r => !r.cookie));
  await api("/api/auth/me", "GET", undefined, player.cookie, 401);
  await api("/api/auth/login", "POST", { username: "httpplayer", password }, undefined, 401); player = await login("httpplayer", newPassword);
  persisted = await loadState(); const account = persisted.users.find(user => user.id === playerSignup.data.user.id);
  assert.equal(account.passwordHash, scryptSync(newPassword, account.passwordSalt, 64).toString("hex"));
  assert.equal(persisted.academies[0].id, academyId); assert.equal(persisted.academies.length, 1);
  pass("generic recovery, simulated inbox link, real scrypt reset, concurrent single-use token and session invalidation");
  await signup("httpexpired", "scout", ["Football"]);
  persisted = await loadState(); const expiredUser = persisted.users.find(user => user.username === "httpexpired");
  persisted.authTokens.filter(row => row.userId === expiredUser.id).forEach(row => { row.expiresAt = "2000-01-01T00:00:00.000Z"; });
  await writeFile(statePath, JSON.stringify(persisted)); await appendFile(path.join(workspace, "lib/store.ts"), "\n// Reload isolated expiry fixture\n"); await pause(2000);
  await api("/api/auth/verify-email", "POST", { token: await emailToken("httpexpired") }, undefined, 400);
  pass("expired verification rejected through actual API after isolated fixture reload");
  for (const account of [coach, player, scout]) { await api("/api/auth/logout", "POST", {}, account.cookie); await api("/api/auth/me", "GET", undefined, undefined, 401); }
  for (const route of ["/", "/verify-email", "/forgot-password", "/reset-password"]) assert.equal((await fetch(base + route)).status, 200);
  pass("logout and authentication pages serve successfully; visual browser testing is separate");
  console.log("Completed " + passed + " integration groups. No real email, MongoDB, .env.local or production data was used.");
} catch (error) {
  console.error("FAIL: " + String(error?.message ?? "Isolated API integration failed").replace(/(?:#|[?&])token=[^\\s]+/g, "token=[REDACTED]"));
  process.exitCode = 1;
} finally {
  if (server?.pid && server.exitCode === null) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    else server.kill("SIGTERM");
  }
  console.log("Isolated test data retained at " + workspace + ". Recipient outbox contains test links; do not publish it.");
}
