import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const requireNative = createRequire(import.meta.url);
const project = new URL('../../', import.meta.url);

// Exercise real route code with only framework/session/storage boundaries mocked.
// No application module is imported with its real database or environment.
export function routeHarness(relativePath, state, actor, options = {}) {
  const cache = new Map();
  const json = (body, options) => Response.json(body, options);
  let mutationQueue = Promise.resolve();
  const mocks = {
    'next/server': { NextResponse: { json } },
    auth: {
      currentUser: async () => actor,
      publicUser: user => Object.fromEntries(["id", "username", "displayName", "role", "status", "playerId", "coachSports", "scoutSports", "isOwner"].map(key => [key, user[key]])),
      verifyPassword: async () => true,
      requireRole: async (...roles) => {
        if (!actor) throw new Error('UNAUTHENTICATED');
        if (!roles.includes(actor.role)) throw new Error('FORBIDDEN');
        return actor;
      },
      canManageSport: (user, sport) => user.role === 'coach' && (!user.coachSports || user.coachSports.includes(sport)),
    },
    store: {
      mutateStore: (mutator) => { const task = mutationQueue.then(() => mutator(state)); mutationQueue = task.then(() => undefined, () => undefined); return task; },
      hashPassword: async () => ({ salt: "isolated-test-salt", hash: "isolated-test-hash" }),
      getStore: async () => state,
      recordAudit: (...args) => state.auditEvents.push({ actorId: args[1], action: args[2], targetId: args[3] }),
    },
    http: {
      readJsonBody: async (request) => request.body,
      badRequest: (error) => json({ error }, { status: 400 }),
      errorResponse: (error) => json({ error: error.message }, { status: error.message === 'UNAUTHENTICATED' ? 401 : error.message === 'FORBIDDEN' ? 403 : 500 }),
    },
  };
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href).exports;
    const module = { exports: {} };
    cache.set(url.href, module);
    const source = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = (specifier) => {
      if (specifier.endsWith('/rate-limit')) return { rateLimit: async () => null, rateLimitByIdentity: async () => null };
      if (specifier.endsWith('/email-auth')) { const email = load(new URL(specifier + '.ts', url)); return { ...email, sendAuthEmail: async (kind, address, token) => { options.outbox?.push({ kind, address, token }); } }; }
      if (specifier === 'next/server') return mocks[specifier];
      for (const key of ['auth', 'store', 'http']) if (specifier.endsWith('/' + key)) return mocks[key];
      if (specifier.startsWith('.')) return load(new URL(specifier + '.ts', url));
      if (specifier.startsWith('node:')) return requireNative(specifier);
      throw new Error('Unmocked route dependency: ' + specifier);
    };
    vm.runInNewContext('(function(require,module,exports){' + source + '\n})', { Response, URL, console, Buffer, process: { env: {} }, setTimeout }, { filename: url.pathname })(localRequire, module, module.exports);
    return module.exports;
  }
  const route = load(new URL(relativePath, project));
  return { invoke: (method, id, body = {}) => route[method]({ body }, { params: Promise.resolve({ id }) }) };
}

export function fixture() {
  return {
    academies: [{ id: 'academy-a', name: 'Test A', location: 'Test', sports: ['Football'] }],
    users: [], players: [], sessions: [], matches: [], trials: [], auditEvents: [], authTokens: [],
  };
}
