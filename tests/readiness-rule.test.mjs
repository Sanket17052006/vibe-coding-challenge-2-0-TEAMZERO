import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../lib/readiness.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { sportStatsForPlayer } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const player = { id: 'p1', sport: 'Football', sports: ['Football'], active: true };
const sessions = Array.from({ length: 4 }, (_, i) => ({ id: 's' + i, sport: 'Football', status: 'closed', playerIds: ['p1'], attendance: [{ playerId: 'p1', status: i < 3 ? 'Present' : 'Absent' }] }));
const played = Array.from({ length: 2 }, (_, i) => ({ id: 'm' + i, sport: 'Football', status: 'played', scores: [{ playerId: 'p1', value: 1 }] }));

test('exactly 75 percent attendance requires two scored played matches for readiness', () => {
  assert.equal(sportStatsForPlayer(player, sessions, played.slice(0, 1))[0].status, 'Developing');
  const ready = sportStatsForPlayer(player, sessions, played)[0];
  assert.equal(ready.attendance, 75);
  assert.equal(ready.matches, 2);
  assert.equal(ready.status, 'Ready');
  const below = structuredClone(sessions);
  below[2].attendance[0].status = 'Absent';
  assert.equal(sportStatsForPlayer(player, below, played)[0].status, 'Developing');
});

test('open sessions, other sports and sessions before roster inclusion cannot alter readiness', () => {
  const extra = [
    { id: 'open', sport: 'Football', status: 'open', playerIds: ['p1'], attendance: [{ playerId: 'p1', status: 'Absent' }] },
    { id: 'other', sport: 'Cricket', status: 'closed', playerIds: ['p1'], attendance: [{ playerId: 'p1', status: 'Absent' }] },
    { id: 'before', sport: 'Football', status: 'closed', playerIds: ['someone-else'], attendance: [] },
  ];
  assert.deepEqual(sportStatsForPlayer(player, [...sessions, ...extra], played), sportStatsForPlayer(player, sessions, played));
});

test('scheduled, unscored, foreign-sport and another-player matches cannot satisfy readiness', () => {
  const incomplete = [
    { id: 'scheduled', sport: 'Football', status: 'scheduled', scores: [{ playerId: 'p1', value: 10 }] },
    { id: 'unscored', sport: 'Football', status: 'played', scores: [] },
    { id: 'other-sport', sport: 'Cricket', status: 'played', scores: [{ playerId: 'p1', value: 10 }] },
    { id: 'other-player', sport: 'Football', status: 'played', scores: [{ playerId: 'p2', value: 10 }] },
  ];
  const stats = sportStatsForPlayer(player, sessions, [played[0], ...incomplete])[0];
  assert.equal(stats.matches, 1);
  assert.equal(stats.status, 'Developing');
});
