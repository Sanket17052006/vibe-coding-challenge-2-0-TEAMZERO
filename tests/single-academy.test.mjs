import test from "node:test";
import assert from "node:assert/strict";
import { assertSingleAcademyState, resolveAcademyIdentity } from "../lib/single-academy.ts";

function store() {
  return { academies: [], users: [], players: [], sessions: [], matches: [], trials: [], auditEvents: [] };
}

test("fresh installs require an explicit academy identity and reuse configured values", () => {
  const state = store();
  assert.throws(() => resolveAcademyIdentity(state, {}), /Configure ACADEMY_ID/);
  assert.deepEqual(resolveAcademyIdentity(state, {
    ACADEMY_ID: "academy-dumka", ACADEMY_NAME: "Configured Academy", ACADEMY_LOCATION: "Dumka, Jharkhand",
  }), { id: "academy-dumka", name: "Configured Academy", location: "Dumka, Jharkhand" });
});

test("existing academy identity is preserved and conflicting configuration fails closed", () => {
  const state = store();
  state.academies.push({ id: "existing", name: "Existing", location: "Dumka" });
  assert.deepEqual(resolveAcademyIdentity(state, { ACADEMY_NAME: "ignored" }), { id: "existing", name: "Existing", location: "Dumka" });
  assert.throws(() => resolveAcademyIdentity(state, { ACADEMY_ID: "other" }), /does not match/);
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

test('configured identity preserves matching legacy references and rejects mismatches', () => {
  const state = store();
  for (const collection of ['users', 'players', 'sessions', 'matches', 'trials', 'auditEvents']) state[collection].push({ id: collection + '-record', academyId: 'fixed' });
  const before = structuredClone(state);
  const config = { ACADEMY_ID: 'fixed', ACADEMY_NAME: 'Fixed', ACADEMY_LOCATION: 'Dumka' };
  assert.equal(resolveAcademyIdentity(state, config).id, 'fixed');
  assert.throws(() => resolveAcademyIdentity(state, { ...config, ACADEMY_ID: 'other' }), /does not match/);
  assert.deepEqual(state, before);
});
