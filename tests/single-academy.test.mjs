import test from "node:test";
import assert from "node:assert/strict";
import { assertSingleAcademyState, resolveAcademyIdentity, reserveAcademyIdentity, activateVerifiedCoach } from "../lib/single-academy.ts";

function store() {
  return { academies: [], users: [], players: [], sessions: [], matches: [], trials: [], auditEvents: [] };
}

test("fresh registrations reserve a stable generated identity without creating academy or owner", () => {
  const state = store();
  const id = reserveAcademyIdentity(state);
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(reserveAcademyIdentity(state), id);
  assert.equal(state.academies.length, 0);
  assert.deepEqual(resolveAcademyIdentity(state, {}), { id, name: "KhelGrid Academy", location: "" });
});

test("existing academy identity and display details survive configuration changes", () => {
  const state = store();
  state.academies.push({ id: "existing", name: "Existing", location: "Dumka" });
  assert.equal(reserveAcademyIdentity(state), "existing");
  assert.deepEqual(resolveAcademyIdentity(state, { ACADEMY_ID: "other", ACADEMY_NAME: "ignored" }), { id: "existing", name: "Existing", location: "Dumka" });
});

test("multiple academy records or scoped legacy identities are rejected without rewriting records", () => {
  const state = store();
  state.academies.push({ id: "a1", name: "A1", location: "Dumka" }, { id: "a2", name: "A2", location: "Dumka" });
  assert.throws(() => assertSingleAcademyState(state), /Multiple academy records/);
  state.academies = [];
  state.users.push({ id: "u1", academyId: "a1" }, { id: "u2", academyId: "a2" });
  assert.throws(() => resolveAcademyIdentity(state, { ACADEMY_ID: "a1", ACADEMY_NAME: "A1", ACADEMY_LOCATION: "Dumka" }), /multiple academy identities/);
  assert.deepEqual(state.users.map((user) => user.academyId), ["a1", "a2"]);
});

test("unscoped legacy accounts require a reviewed identity migration", () => {
  const state = store();
  state.users.push({ id: "legacy", academyId: "" });
  assert.throws(() => resolveAcademyIdentity(state, {
    ACADEMY_ID: "academy-dumka", ACADEMY_NAME: "Configured Academy", ACADEMY_LOCATION: "Dumka",
  }), /without an academy identity/);
});


test('every academy-scoped collection rejects conflicting identities without changing records', () => {
  for (const collection of ['users', 'players', 'sessions', 'matches', 'trials', 'auditEvents']) {
    const state = store();
    state.academies.push({ id: 'fixed', name: 'Fixed', location: 'Dumka' });
    state[collection].push({ id: 'foreign-record', academyId: 'other' });
    const before = structuredClone(state);
    assert.throws(() => assertSingleAcademyState(state), /multiple academy identities/, collection);
    assert.deepEqual(state, before);
  }
});

test('matching legacy references are preserved without allowing environment identity overrides', () => {
  const state = store();
  for (const collection of ['users', 'players', 'sessions', 'matches', 'trials', 'auditEvents']) state[collection].push({ id: collection + '-record', academyId: 'fixed' });
  const before = structuredClone(state);
  const config = { ACADEMY_ID: 'fixed', ACADEMY_NAME: 'Fixed', ACADEMY_LOCATION: 'Dumka' };
  assert.equal(resolveAcademyIdentity(state, config).id, 'fixed');
  assert.equal(resolveAcademyIdentity(state, { ...config, ACADEMY_ID: "other" }).id, "fixed");
  assert.deepEqual(state, before);
});


test("two verified Coaches initialize exactly one academy and one owner in either verification order", () => {
  for (const order of [[0, 1], [1, 0]]) {
    const state = store();
    const id = reserveAcademyIdentity(state);
    state.users.push(...["Football", "Cricket"].map((sport, i) => ({ id: "coach-" + i, academyId: id, role: "coach", status: "pending", coachSports: [sport], emailVerifiedAt: "2026-01-01", createdAt: "2026-01-01" })));
    for (const index of order) activateVerifiedCoach(state, state.users[index], {});
    assert.equal(state.academies.length, 1);
    assert.equal(state.users.filter(user => user.isOwner).length, 1);
    assert.equal(state.users[order[0]].isOwner, true);
    assert.ok(state.users.every(user => user.status === "active" && user.academyId === id));
    assert.deepEqual(state.academies[0].sports.sort(), ["Cricket", "Football"]);
  }
});

test("unverified, declined, left and non-Coach accounts cannot initialize an academy", () => {
  for (const override of [{ emailVerifiedAt: undefined }, { status: "declined" }, { status: "left" }, { role: "player" }, { role: "scout" }]) {
    const state = store();
    const id = reserveAcademyIdentity(state);
    const user = { id: "user", academyId: id, role: "coach", status: "pending", emailVerifiedAt: "2026-01-01", ...override };
    state.users.push(user);
    activateVerifiedCoach(state, user, {});
    assert.equal(state.academies.length, 0);
  }
});
