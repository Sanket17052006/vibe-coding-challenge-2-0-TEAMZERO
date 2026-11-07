#!/usr/bin/env node
// Opt-in real Mongo integration. Never loads dotenv or reads MONGODB_URI.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import vm from 'node:vm';
import ts from 'typescript';
import { MongoClient } from 'mongodb';

const uri = process.env.KHELGRID_TEST_MONGODB_URI;
let parsed;
try { parsed = new URL(uri || ''); } catch { /* handled without printing URI */ }
const dbName = parsed?.pathname.slice(1);
if (!parsed || parsed.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !/^khelgrid_test_[a-z0-9_]+$/.test(dbName || '') || parsed.username || parsed.password || parsed.search || parsed.hash) {
  console.error('BLOCKED: explicitly set KHELGRID_TEST_MONGODB_URI to a direct loopback URI with a fresh database named khelgrid_test_<unique_suffix>. Credentials, query strings and remote hosts are refused.');
  process.exitCode = 2;
} else {
  const clients = [];
  const requireNative = createRequire(import.meta.url);
  const env = { NODE_ENV: 'production', MONGODB_URI: uri, MONGODB_DB: dbName, SESSION_SECRET: randomBytes(48).toString('hex') };
  class TrackedClient extends MongoClient { constructor(...args) { super(...args); clients.push(this); } }
  function modules() {
    const cache = new Map();
    function load(url) {
      if (cache.has(url.href)) return cache.get(url.href).exports;
      const module = { exports: {} };
      cache.set(url.href, module);
      const code = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      const requireIsolated = (id) => {
        if (id === 'mongodb') return { MongoClient: TrackedClient };
        if (id.startsWith('.')) return load(new URL(id + '.ts', url));
        if (id.startsWith('node:')) return requireNative(id);
        throw new Error('Unexpected integration module dependency');
      };
      vm.runInNewContext('(function(require,module,exports){' + code + '\n})', { process: { env, cwd: () => os.tmpdir() }, Buffer, console, Response, Date, setTimeout }, { filename: url.pathname })(requireIsolated, module, module.exports);
      return module.exports;
    }
    return { store: () => load(new URL('../lib/store.ts', import.meta.url)), rate: () => load(new URL('../lib/rate-limit.ts', import.meta.url)) };
  }
  try {
    const inspector = new TrackedClient(uri, { serverSelectionTimeoutMS: 2000 });
    await inspector.connect();
    const database = inspector.db(dbName);
    if (process.argv.includes('--verify')) {
      const store = modules().store();
      const state = await store.getStore();
      assert.equal(state.academies[0]?.id, 'integration-test-fixed');
      assert.deepEqual([...state.players.map(p => p.id)].sort(), ['concurrent-a', 'concurrent-b']);
      assert.equal(state.users.length, 0);
      console.log('PASS: a new process read both concurrent writes and the fixed identity from persisted MongoDB.');
    } else {
      assert.equal((await database.listCollections({}, { nameOnly: true }).toArray()).length, 0, 'Refusing to test against an existing database. Use a fresh unique test name.');
      const a = modules();
      const b = modules();
      const storeA = a.store();
      const storeB = b.store();
      await storeA.mutateStore(state => state.academies.push({ id: 'integration-test-fixed', name: 'Isolated Test', location: 'Test only', sports: ['Football'], createdAt: new Date().toISOString() }));
      await Promise.all([
        storeA.mutateStore(async state => { await new Promise(r => setTimeout(r, 40)); state.players.push({ id: 'concurrent-a', academyId: 'integration-test-fixed', name: 'Test A', age: 16, sport: 'Football', active: true, createdAt: new Date().toISOString() }); }),
        storeB.mutateStore(async state => { await new Promise(r => setTimeout(r, 40)); state.players.push({ id: 'concurrent-b', academyId: 'integration-test-fixed', name: 'Test B', age: 17, sport: 'Football', active: true, createdAt: new Date().toISOString() }); }),
      ]);
      const document = await database.collection('appState').findOne({ _id: 'main' });
      assert.ok(document.revision >= 3);
      assert.deepEqual(document.state.players.map(p => p.id).sort(), ['concurrent-a', 'concurrent-b']);
      assert.equal(document.state.academies.length, 1);
      assert.ok(document.state.players.every(p => p.academyId === 'integration-test-fixed'));
      const rateA = a.rate();
      const rateB = b.rate();
      const request = { headers: new Headers() };
      const responses = await Promise.all([rateA, rateB, rateA, rateB].map(rate => rate.rateLimitByIdentity(request, 'isolated-test-limit', 'test@example.invalid', 2, 60000)));
      assert.equal(responses.filter(r => r === null).length, 2);
      assert.equal(responses.filter(r => r?.status === 429).length, 2);
      assert.ok((await database.collection('rateLimits').find().toArray()).every(row => !row._id.includes('@')));
      assert.ok((await database.collection('rateLimits').indexes()).some(index => index.expireAfterSeconds === 0));
      console.log('PASS: revision-checked concurrent updates, fixed identity and shared production rate limiting. Test records retained. Run again with --verify using the same test URI to verify process-restart persistence.');
    }
  } catch (error) {
    console.error('Mongo integration did not pass. Error type: ' + (error?.name || 'Error') + '. Check local service availability and test assertions; no URI or credentials were logged.');
    process.exitCode = 1;
  } finally {
    await Promise.all(clients.map(client => client.close().catch(() => undefined)));
  }
}
