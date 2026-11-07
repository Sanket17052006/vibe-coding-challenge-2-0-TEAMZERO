import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('../scripts/check-test-mongodb.mjs', import.meta.url));

test('Mongo integration runner blocks absent, remote, credential-bearing and non-test database URIs', () => {
  for (const uri of ['', 'mongodb+srv://remote.invalid/khelgrid_test_example', 'mongodb://remote.invalid/khelgrid_test_example', 'mongodb://127.0.0.1/real-data', 'mongodb://user:fake-test-secret@127.0.0.1/khelgrid_test_example', 'mongodb://127.0.0.1/khelgrid_test_example?replicaSet=test']) {
    const child = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 10000, env: { SystemRoot: process.env.SystemRoot || '', TEMP: process.env.TEMP || '', KHELGRID_TEST_MONGODB_URI: uri } });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 2);
    assert.match(child.stderr, /BLOCKED/);
    assert.equal(child.stdout, '');
    assert.equal(child.stderr.includes('fake-test-secret'), false);
    if (uri) assert.equal(child.stderr.includes(uri), false);
  }
});
