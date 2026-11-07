import test from 'node:test';
import assert from 'node:assert/strict';
import { routeHarness, fixture } from './helpers/route-harness.mjs';

const coach = { id: 'coach-a', academyId: 'academy-a', role: 'coach', status: 'active', isOwner: true };
const verifiedPlayer = (id = 'applicant') => ({ id, academyId: 'academy-a', role: 'player', status: 'pending', displayName: 'Test Athlete', emailVerifiedAt: '2026-01-01', pendingPlayer: { age: 16, sports: ['Football'] } });
const player = () => ({ id: 'player-a', academyId: 'academy-a', name: 'Test Athlete', age: 16, sport: 'Football', sports: ['Football'], active: true });

for (const [route, method, collection, body] of [
  ['players', 'PATCH', 'players', { active: false }],
  ['sessions', 'PATCH', 'sessions', { action: 'close' }],
  ['matches', 'PATCH', 'matches', { action: 'team-sheet', teamSheet: [{ playerId: 'x' }] }],
  ['matches', 'DELETE', 'matches', {}],
  ['users', 'PATCH', 'users', { status: 'active', playerId: 'player-a' }],
  ['trials', 'DELETE', 'trials', {}],
]) {
  test(method + ' ' + route + ' rejects a foreign-academy record without mutation', async () => {
    const state = fixture();
    // Deliberately bypass store identity guards to test the route's own boundary.
    state[collection].push({ id: 'foreign', academyId: 'academy-b', role: 'player', status: 'pending', active: true });
    const before = structuredClone(state);
    const actor = route === 'trials' ? { ...coach, role: 'scout' } : coach;
    const harness = routeHarness('app/api/' + route + '/[id]/route.ts', state, actor);
    const response = await harness.invoke(method, 'foreign', body);
    assert.equal(response.status, 404);
    assert.deepEqual(structuredClone(state), before);
  });
}

test('approval links one matching account and never overwrites its roster ownership', async () => {
  const state = fixture();
  state.players.push(player());
  state.users.push(coach, verifiedPlayer('first'), verifiedPlayer('second'));
  const route = routeHarness('app/api/users/[id]/route.ts', state, coach);
  assert.equal((await route.invoke('PATCH', 'first', { status: 'active', playerId: 'player-a' })).status, 200);
  assert.equal(state.players[0].userId, 'first');
  assert.equal(state.users.find(u => u.id === 'first').playerId, 'player-a');
  const afterFirst = structuredClone(state);
  assert.equal((await route.invoke('PATCH', 'second', { status: 'active', playerId: 'player-a' })).status, 409);
  assert.deepEqual(structuredClone(state), afterFirst);
  assert.equal((await route.invoke('PATCH', 'first', { status: 'active', playerId: 'player-a' })).status, 409);
  assert.deepEqual(structuredClone(state), afterFirst);
});

test('roster userId alone protects ownership even without a reverse active account link', async () => {
  const state = fixture();
  state.players.push({ ...player(), userId: 'original-owner' });
  state.users.push(verifiedPlayer());
  const before = structuredClone(state);
  const route = routeHarness('app/api/users/[id]/route.ts', state, coach);
  assert.equal((await route.invoke('PATCH', 'applicant', { status: 'active', playerId: 'player-a' })).status, 409);
  assert.deepEqual(structuredClone(state), before);
});

test('approval rejects foreign roster, unverified applicant, and unauthorized actors', async () => {
  for (const scenario of ['foreign-player', 'unverified', 'player-actor', 'scout-actor', 'no-session']) {
    const state = fixture();
    state.players.push({ ...player(), ...(scenario === 'foreign-player' ? { academyId: 'academy-b' } : {}) });
    state.users.push({ ...verifiedPlayer(), ...(scenario === 'unverified' ? { emailVerifiedAt: undefined } : {}) });
    const before = structuredClone(state);
    const actor = scenario === 'no-session' ? null : scenario.endsWith('-actor') ? { ...coach, role: scenario.split('-')[0] } : coach;
    const route = routeHarness('app/api/users/[id]/route.ts', state, actor);
    const response = await route.invoke('PATCH', 'applicant', { status: 'active', playerId: 'player-a' });
    assert.equal(response.status, scenario === 'foreign-player' ? 404 : scenario === 'unverified' ? 409 : scenario === 'no-session' ? 401 : 403, scenario);
    assert.deepEqual(structuredClone(state), before);
  }
});

test('academy ownership cannot transfer to a foreign Coach or by a non-owner', async () => {
  for (const nonOwner of [false, true]) {
    const state = fixture();
    const actor = { ...coach, isOwner: !nonOwner };
    state.users.push(actor, { id: 'foreign-coach', academyId: 'academy-b', role: 'coach', status: 'active', isOwner: false });
    const before = structuredClone(state);
    const route = routeHarness('app/api/academy/owner/route.ts', state, actor);
    assert.equal((await route.invoke('PATCH', undefined, { userId: 'foreign-coach' })).status, 409);
    assert.deepEqual(structuredClone(state), before);
  }
});

test('Scout cannot withdraw another Scout account trial', async () => {
  const state = fixture();
  state.trials.push({ id: 'trial-a', academyId: 'academy-a', scoutId: 'other-scout', status: 'active' });
  const before = structuredClone(state);
  const route = routeHarness('app/api/trials/[id]/route.ts', state, { id: 'scout-a', role: 'scout', academyId: 'academy-a' });
  assert.equal((await route.invoke('DELETE', 'trial-a')).status, 403);
  assert.deepEqual(structuredClone(state), before);
});
