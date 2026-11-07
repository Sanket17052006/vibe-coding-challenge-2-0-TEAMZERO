import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../scripts/seed-demo.mjs', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace(/^#!.*\n/, ''), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true }, fileName: 'seed-demo.js' }).outputText;

async function runSeeder(env, existing = null) {
  const calls = { constructed: 0, connected: 0, writes: 0, closed: 0 };
  const messages = [];
  const fakeProcess = { env: { ...env }, exitCode: 0 };
  class MongoClient {
    constructor() { calls.constructed++; }
    async connect() { calls.connected++; }
    db(name) {
      assert.equal(name, 'khelgrid_demo_local');
      return { collection: () => ({
        findOne: async () => structuredClone(existing),
        insertOne: async () => { calls.writes++; },
        replaceOne: async () => { calls.writes++; return { matchedCount: 1 }; },
      }) };
    }
    async close() { calls.closed++; }
  }
  const requireMock = (id) => {
    if (id === 'node:crypto') return { randomUUID };
    if (id === 'mongodb') return { MongoClient };
    throw new Error('Unexpected seeder import: ' + id);
  };
  const execute = vm.runInNewContext('(async function(require,process,console,exports){' + compiled + '\n})', { URL, Date }, { filename: 'isolated-seed-demo.js' });
  await execute(requireMock, fakeProcess, { error: m => messages.push(m), log: m => messages.push(m) }, {});
  return { calls, exitCode: fakeProcess.exitCode, messages };
}

const valid = { NODE_ENV: 'development', KHELGRID_DEMO_MONGODB_URI: 'mongodb://127.0.0.1:27018/khelgrid_demo_local', ACADEMY_ID: 'fictional-test', ACADEMY_NAME: 'Test Academy', ACADEMY_LOCATION: 'Test only' };

test('demo seeder refuses production before constructing any Mongo client', async () => {
  const result = await runSeeder({ ...valid, NODE_ENV: 'production' });
  assert.equal(result.exitCode, 1);
  assert.equal(result.calls.constructed, 0);
  assert.equal(result.calls.writes, 0);
  assert.match(result.messages.join(' '), /Refusing to seed/);
});

test('demo seeder rejects remote, ambiguous, wrong-database and query-bearing URIs before connection', async () => {
  for (const uri of [undefined, 'mongodb+srv://example.invalid/khelgrid_demo_local', 'mongodb://example.invalid/khelgrid_demo_local', 'mongodb://127.0.0.1/real-data', 'mongodb://127.0.0.1/khelgrid_demo_local?replicaSet=test', 'mongodb://127.0.0.1/khelgrid_demo_local#fragment', 'mongodb://127.0.0.1,example.invalid/khelgrid_demo_local']) {
    const result = await runSeeder({ ...valid, KHELGRID_DEMO_MONGODB_URI: uri });
    assert.equal(result.exitCode, 1, String(uri));
    assert.equal(result.calls.constructed, 0);
    assert.equal(result.calls.writes, 0);
  }
});

test('demo seeder requires explicit identity and never falls back to application MONGODB_URI', async () => {
  for (const missing of ['ACADEMY_ID', 'ACADEMY_NAME', 'ACADEMY_LOCATION', 'KHELGRID_DEMO_MONGODB_URI']) {
    const env = { ...valid, MONGODB_URI: 'mongodb://remote.invalid/production' };
    delete env[missing];
    const result = await runSeeder(env);
    assert.equal(result.exitCode, 1, missing);
    assert.equal(result.calls.constructed, 0);
  }
});

test('demo seeder leaves populated unmarked data untouched and marked demo data idempotent', async () => {
  const existing = { _id: 'main', revision: 8, state: { players: [{ id: 'must-remain' }] } };
  const before = structuredClone(existing);
  const rejected = await runSeeder(valid, existing);
  assert.equal(rejected.exitCode, 1);
  assert.equal(rejected.calls.writes, 0);
  assert.equal(rejected.calls.closed, 1);
  assert.deepEqual(existing, before);
  const repeated = await runSeeder(valid, { _id: 'main', state: { demoSeedVersion: 'khelgrid-local-demo-v1' } });
  assert.equal(repeated.exitCode, 0);
  assert.equal(repeated.calls.writes, 0);
});
