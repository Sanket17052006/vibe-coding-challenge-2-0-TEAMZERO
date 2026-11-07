# KhelGrid offline validation and release gates

Prepared 2026-11-07 on feature/multisport-performance-analytics. This is a test plan and evidence record, not deployment approval. Preserve the current worktree. Never read or modify .env.local, use an unknown database URI, or send real mail as part of automated tests.

## Evidence levels

The latest offline suite executes the actual scheduling/score and authorization route-handler functions with framework/session/storage boundaries mocked. It does not start Next.js, use real sessions, or connect MongoDB. Existing sport configuration tests cover all catalogue formats. New handler tests schedule every configured format, exercise team versus individual sheets, reject negative scores, record valid performances, inspect analytics and reject overwrites of played matches.

Cross-academy tests deliberately provide foreign records to mocked storage to exercise route filtering independently of the single-academy store guard. They cover roster updates, session closure, match update/delete, account approvals and trials. Ownership tests cover duplicate Player linking, existing roster userId, repeated approval, Coach ownership transfer and Scout trial ownership. They are not a substitute for real HTTP/session/Mongo integration.

Actual isolated HTTP tests in the prior session covered the duplicate Player-link collision, password-reset token races/session invalidation, role visibility, all 28 default sport formats, absent-player restrictions, and exact 75% plus two-scored-match readiness. Those are historical evidence, not freshly repeated in this offline pass.

## Environment and commands

The ordinary sandbox shell fails before executing PowerShell with helper_sandbox_lock_failed / SetNamedSecurityInfoW error 5. A narrowly approved command outside that helper works. No ACL, Codex configuration or sandbox directory was altered. Re-check the ordinary shell in a new session; if it still fails, use the supported approval mechanism for necessary commands rather than changing Windows security settings.

The prior isolated server on port 3351 was identified by its listening port and verified Next.js parent process, then stopped to release the locked native compiler. Its temporary data was retained. The initial npm ci failed with EPERM on the native SWC file; retry after stopping that verified server succeeded.

Run at the repository root:

    git status --short --branch
    npm ci
    npm test
    npm exec tsc -- --noEmit
    git diff --check

Current local runtime is Node.js 26.10.0. Some existing tests import TypeScript source directly and rely on Node's built-in type stripping. Node 20 cannot run those direct imports without additional tooling. Prefer Node 24 LTS (or a compatible Node 22 release with type stripping) for these tests and verify the selected CI/runtime separately. Next.js production code is compiled; do not confuse test-runner requirements with compiled deployment support.

Do not run a build beside a development server sharing the same .next directory. To prevent Next.js from reading the forbidden local environment file, prepare a fresh temporary directory and copy only these known source entries: app, components, lib, public, tests, scripts, package.json, package-lock.json, tsconfig.json, next.config.ts, next-env.d.ts. Copy docs optionally. Do not copy any .env file, data, .git or .next. Install dependencies there using npm ci, or junction its node_modules to the validated repository installation while no server is holding its compiler open. Set MONGODB_URI and SMTP credential variables blank in that command's environment, set APP_URL to https://validation.invalid and SESSION_SECRET to a test-only value at least 32 characters, then run npm run build from that temporary directory. A build proves compilation and static generation; it does not prove email or database connectivity.

## Real MongoDB integration: currently blocked

Required: a running, explicitly dedicated non-production loopback MongoDB service and a unique empty test database. Ports 27017 and 27018 had no service in the last integration session. No production or Atlas credential should be borrowed from .env.local. The runner intentionally accepts only direct unauthenticated loopback URIs with a khelgrid_test_ database prefix, no query/fragment, and refuses an existing database for its write phase. Use an isolated local MongoDB process, not a production tunnel.

From PowerShell, after the operator has started the dedicated local service:

    $qaDatabase = 'khelgrid_test_' + [guid]::NewGuid().ToString('N')
    $env:KHELGRID_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/' + $qaDatabase
    node scripts/check-test-mongodb.mjs
    node scripts/check-test-mongodb.mjs --verify

The first command uses real lib/store.ts and lib/rate-limit.ts in isolated module instances with explicit test environment, creates only fictional test records in the empty test database, races two writers and asserts both survive revision checks, validates fixed academy IDs, checks shared production email identity limiting and the TTL index, and closes all clients. The second invocation is a new process and verifies both records survive process restart. Test data is deliberately retained. Do not run the first command again with the same non-empty database; choose another unique name. There is no automatic deletion or migration.

Absent/remote/credential-bearing URIs are blocked by the runner before connection and covered by the automated safety test. Missing service, connection failure, or assertion error is a failed/blocked integration result, never a pass. Capture exit codes and sanitized results. The runner is prepared but real Mongo behavior remains UNVERIFIED until these commands succeed. It covers two concurrent application-state writers; it does not simulate every Vercel scaling/failover workload or a browser session. Auth/API token concurrency on Mongo must also be tested on two isolated Next instances sharing the dedicated test DB.

## Browser verification: currently blocked

Required: an available in-app browser backend and a local Next.js instance served from an isolated copy with dedicated test storage. The browser service returned an empty available-browser list in the preceding QA. Use the browser skill to reconnect; do not label HTTP 200 or source inspection as visual verification.

Repeatable acceptance sequence:

1. Prepare isolated app copy and dedicated Mongo test DB as above. Give the copy a fictional ACADEMY_ID/NAME/LOCATION, test SESSION_SECRET and matching local APP_URL. Keep SMTP blank unless a deliberate controlled email test is authorized. Start on a unique port.
2. Register Coach; verify that pending/unverified access is blocked, then verify using a test-only fixture or the controlled email procedure below. First Coach owner can configure sports; later Coach requires owner approval.
3. Register Player with name/age/sports only, verify email, observe pending state; Coach links matching existing roster record. Test duplicate identity/link rejection and original link preservation.
4. Register and verify Scout, approve via Coach. Confirm Ready-only visibility and denial of administration. Verify Player sees only own records and trial calls.
5. Exercise login, forgot-password, reset, expired/invalid/reused links and resend states. Verify fragment is immediately removed with history.replaceState and POSTs carry tokens; do not record tokens in screenshots/HAR/console logs. Verify old sessions fail after reset.
6. Inspect roster, training, team and individual fixtures, history and analytics. At 75% with one scored match expect Developing; with two expect Ready. Absent scoring and closed attendance edits must fail. Check at least one alternate team/individual format and sport-switch isolation.
7. Repeat at mobile 375/390 px, tablet 768 px and desktop 1440 px. Check scrolling/tables, labels/stacked fields, focus order, keyboard controls, password visibility accessible names, disabled/loading/error/success states, contrast, console and failed network requests. Keep KhelGrid olive/lime/warm-neutral design.
8. Record actual viewport/browser, scenario, expected/observed behavior and sanitized screenshot references. Report unavailable scenarios BLOCKED.

## Controlled email-delivery checklist: prepared, not executed

- Use a dedicated test Gmail account, a newly issued App Password and a controlled recipient inbox. Revoke the App Password exposed in historical chat before any real use; never copy its value. Do not ask an agent to read .env.local.
- Operator supplies SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_SECURE=true, SMTP_USER, SMTP_PASS, EMAIL_FROM and matching APP_URL through the isolated process/secret store. Do not echo environment values or include them in test reports. Use no production DB/accounts.
- Trigger exactly one verification message from a test signup or resend action. Observe the safe SMTP diagnostics: intended-recipient acceptance boolean, rejection boolean, SMTP response code, sanitized response and messageId. Never enable verbose protocol/auth logging or print a full verification/reset URL.
- Confirm actual arrival in recipient inbox/spam, sender identity, branding, subject and expiry language. SMTP acceptance or Sent-folder presence alone does not establish delivery. Record only timestamp and receipt result with sanitized diagnostic metadata.
- Open verification link privately; fragment should clear immediately and token should be POSTed. Verify once succeeds; reuse fails. Approval policy must remain intact.
- After approval/login, request one password reset; generic response must remain identical. Confirm real receipt, reset success, no automatic login, new-password login and old-session rejection. Avoid copying password or token into logs/screenshots.
- Test invalid/expired links with isolated fixtures rather than repeatedly sending email. Confirm provider failure is surfaced safely for signup/resend and forgot-password remains generic. Rate limits must remain enabled.
- Remove test credentials from the isolated process after testing; operator revokes disposable App Password. Preserve evidence without secrets. No live email has been sent by this offline validation task.

## Release audit and production gates

- Single-academy identity: existing ID reused; fresh database requires explicit configuration; conflicting IDs fail closed. Existing legacy/multi-academy data needs reviewed backup/migration, never automatic destructive merging.
- Coach/Player/Scout: email verification and applicable approval precede protected access. Player linking and role/sport/academy scopes must remain enforced server-side.
- Match configuration: all 28 sports and configured formats must validate; one scalar per-player metric remains the documented limitation. Official scorecard/result semantics are not fully modeled for every sport.
- Attendance/readiness: closed sheets immutable, scoring requires same-day/sport closed-session Present mark. Exactly 75% and at least two scored played matches remains the rule.
- Analytics: actual records only; scheduled fixtures excluded from completed performance, format/sport isolation retained, legacy unknown formats unclassified. Scalar totals in legacy readiness summaries should not be mistaken for comparable cross-format performance.
- Database: production requires MONGODB_URI, uses shared rateLimits and revision-checked appState. No local JSON fallback in production. Mongo appState's 16 MB document limit and contention require operational capacity review; local JSON is not a Vercel persistence solution.
- Vercel: configure production Mongo database user/network access, MONGODB_DB, unique SESSION_SECRET (32+ chars), canonical HTTPS APP_URL, Gmail SMTP settings and EMAIL_FROM, and fixed academy identity where fresh. Keep all secrets server-side. Verify TLS/SMTP egress and Atlas access from actual deployment. Review function timeout against SMTP verify/send timeouts and Mongo retries. No deployment/settings changes performed here.
- The checked-in .env.example contains development localhost placeholders; override APP_URL in production. Missing config should fail safely. Live service validation, mobile/browser QA and Mongo integration are release gates, not implied by a successful build.

## Fresh check results

Fresh results on 2026-11-07: npm ci passed after releasing the verified isolated test-server lock; npm test passed 84/84 tests with zero skipped; npm exec tsc -- --noEmit passed; npm run build passed in the isolated environment-free copy (Next.js 15.5.28); git diff --check passed. Node emitted existing MODULE_TYPELESS_PACKAGE_JSON warnings; these did not fail tests. Neither mongod nor docker was discoverable on PATH, neither local Mongo test port had a listener, and the in-app browser list was empty. Real Mongo integration, browser/mobile QA, SMTP receipt and Vercel/Atlas validation remain blocked or unverified.
