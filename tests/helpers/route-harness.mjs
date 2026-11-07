import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const requireNative = createRequire(import.meta.url);
const project = new URL('../../', import.meta.url);

// Exercise real route code with only framework/session/storage boundaries mocked.
// No application module is imported with its real database or environment.
export function routeHarness(relativePath, state, actor) {
  const cache = new Map();
  const json = (body, options) => Response.json(body, options);
  const mocks = {
    'next/server': { NextResponse: { json } },
    auth: {
      requireRole: async (...roles) => {
        if (!actor) throw new Error('UNAUTHENTICATED');
        if (!roles.includes(actor.role)) throw new Error('FORBIDDEN');
        return actor;
      },
      canManageSport: (user, sport) => user.role === 'coach' && (user.isOwner || !user.coachSports || user.coachSports.includes(sport)),
    },
    store: {
      mutateStore: async (mutator) => mutator(state),
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
      if (specifier === 'next/server') return mocks[specifier];
      for (const key of ['auth', 'store', 'http']) if (specifier.endsWith('/' + key)) return mocks[key];
      if (specifier.startsWith('.')) return load(new URL(specifier + '.ts', url));
      if (specifier.startsWith('node:')) return requireNative(specifier);
      throw new Error('Unmocked route dependency: ' + specifier);
    };
    vm.runInNewContext('(function(require,module,exports){' + source + '\n})', { Response, URL, console, Buffer }, { filename: url.pathname })(localRequire, module, module.exports);
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
