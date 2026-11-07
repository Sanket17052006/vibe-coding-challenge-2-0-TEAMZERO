# KhelGrid Development Handoff

Last updated: 2026-11-07 (Asia/Calcutta)

## Read this first

This handoff records the inspected codebase and the latest integration-testing state. The branch reference in .git/HEAD is feature/multisport-performance-analytics. The previously observed worktree had substantial uncommitted changes. This task is intended to add only this file. Git command execution failed during this handoff because the sandbox process helper could not set permissions, so refresh git status before doing anything else; do not assume the inventory below is unchanged.

Do not open, print, copy, or edit .env.local. Do not connect to production MongoDB, send live email, commit, push, merge, create a PR, or deploy unless the owner later explicitly changes those instructions.

## 1. Project overview and problem

KhelGrid is a responsive sports-academy operations workspace for one configured academy in Dumka, Jharkhand. It brings roster management, training attendance, fixtures, results, player performance and trial shortlisting into one role-aware application. It is intentionally not a multi-academy platform. Existing academy identity is reused; a fresh database needs explicit operator configuration.

The product supports Coach, Player and Scout accounts and a catalogue of 28 sports. README tagline: “Every session. Every score. Every next play.”

## 2. Objectives and users

- Coaches manage academy sports, player records, registration requests, attendance, matches, scores/ratings, analytics and trial calls.
- Players request membership, are linked by a Coach to an existing roster record, then view their own attendance, played-match history, performance and trial calls.
- Scouts require approval and can see eligible Ready players and create/withdraw trial calls. They do not administer academy records.
- Operators configure the one academy and production services. A fresh database requires ACADEMY_ID, ACADEMY_NAME and ACADEMY_LOCATION. Identity is not invented at signup.

## 3. Technology stack

Inspected package/source: Node.js 20 LTS or newer, npm, Next.js 15 App Router, React 19, TypeScript 5.7, MongoDB Node driver 7, Nodemailer 10, Lucide React, qrcode.react, Node crypto and custom CSS. Tests use node:test. No lint script is listed in package.json.

Scripts: npm run dev, npm run build, npm run start, npm test.

## 4. Architecture and folder map

- app/page.tsx: role-aware operations dashboard and authentication entry UI.
- app/globals.css: dashboard and auth visual system; app/layout.tsx: shared document/layout.
- app/verify-email, app/forgot-password, app/reset-password: authentication email flows.
- app/api: Next.js route handlers for authentication, academy, players, sessions, matches, trials, audit and bootstrap.
- components/: shared UI components; inspect contents before extending.
- lib/types.ts: domain and Store types.
- lib/store.ts: Mongo appState persistence, local JSON fallback, password hashing and serialized mutations.
- lib/auth.ts: signed cookie, user lookup and role/sport authorization.
- lib/single-academy.ts: configured academy identity and fail-closed checks.
- lib/membership.ts: pending membership/player matching helpers.
- lib/sports.ts and lib/sport-config.ts: 28 sport catalogue, formats and match/stat configuration.
- lib/readiness.ts and lib/performance-analytics.ts: readiness and performance calculations.
- lib/match-access.ts and lib/match-validation.ts: match visibility/participant validation.
- lib/email-auth.ts, lib/email-link.ts, lib/smtp-email.ts: token lifecycle, fragment links/templates and server-only SMTP.
- lib/rate-limit.ts: in-memory local buckets and MongoDB-backed production buckets.
- lib/http.ts: request parsing/error helpers.
- scripts/seed-demo.mjs: guarded local-only Mongo demo seeder; no demo accounts/passwords.
- tests/: Node test-runner tests.

## 5. Feature status

### Implemented in inspected code

- One configured academy identity with checks rejecting multiple academy IDs or records. Existing identity is retained; fresh setup requires explicit configuration.
- Coach/Player/Scout signup, normalized unique email validation, scrypt password hashing, email verification and approval states. Coach does not create an academy. Player submits personal details and sports, not academy code or Player ID; Coach links a verified pending request to an existing record. Scout approval remains required.
- Existing accounts without email retain username/password login.
- Verification/recovery token routes and pages, hash-only token persistence, expiry/single use, fragment links, generic forgot-password response, rate limits and SMTP utility.
- Roster/sport management, session scheduling/attendance/closure, match scheduling, team sheets and individual participants, score/rating entry, history, analytics and trials.
- Explicit sport configuration for all 28 catalogue sports, including format kinds, participant limits, score metrics and aggregations. Analytics uses stored session/match/player records and treats missing/unsupported legacy formats as unclassified.
- Role and academy scope in server routes; Coach sport assignment scope; Player linked-record scope; Scout readiness-filtered data.
- Audit events. Mongo appState persistence and local atomic JSON fallback. Production rejects missing MongoDB configuration; production rate limiting uses MongoDB.

### Partially verified

- Actual local API routes were exercised in an isolated temporary copy, but not every authentication or authorization case was covered.
- Root page returned HTTP 200; no visual browser QA was possible because browser backend listed no available browser.
- Mongo-specific persistence/concurrency/restart behavior has not been run against a dedicated test database.
- Real SMTP delivery and receipt have not been verified in latest QA; no real message was sent.
- Duplicate player matching helper has tests, but actual approval-route duplicate collision was not completed.

### Pending

Finish password recovery/reset/session invalidation and duplicate player-link route tests; run Mongo integration against a dedicated non-production database; perform browser/responsive/accessibility QA when browser access is available; verify real SMTP delivery/receipt and Vercel/Atlas configuration before release. Do not claim production readiness until verified.

## 6. Data model and relationships

Types are in lib/types.ts. Store has academies, users, players, sessions, matches, trials, auditEvents, optional authTokens and demo seed version.

- Academy: id, name, location, optional legacy code, sports, createdAt.
- User: id, academyId, username, displayName, role, status (active/pending/declined/left), optional email/emailVerifiedAt, optional pendingPlayer, playerId, coachSports, isOwner, sessionVersion, passwordHash/passwordSalt and createdAt.
- Player: id, academyId, name, age, sport, optional sports/sportRequests, active, optional userId and createdAt.
- Session: id, academyId, date, sport, playerIds, open/closed status, attendance, createdAt/closedAt. Attendance is playerId and Present/Absent.
- Match: id, academyId, date, optional local time, sport, optional format (legacy compatible), opponent, optional venue, scheduled/played status, score rows, optional result, legacy lineup/teamSheet and createdAt.
- Score: playerId, numeric value, optional rating. Rating is 1–10 in half-point steps.
- MatchResult: academy/opponent score strings, outcome (win/loss/draw/no-contest), optional detail/finish fields.
- TeamSheetEntry: playerId, starter/substitute role, optional position/captain/jersey number.
- Trial: academy/player/sport/scout identifiers and active/withdrawn lifecycle.
- AuditEvent: academyId, actorId, action, targetId, scalar details and timestamp.
- AuthToken: userId, SHA-256 hash, expiry, optional usedAt, verify/reset kind. Raw tokens are not persisted.

A Player account links to one existing Player using playerId/userId. Sessions and matches reference roster player IDs; attendance, scores and team sheets reference those players; trials refer to player/sport/scout. Store normalizer tolerates some legacy fields, but conflicting academy IDs fail closed. No destructive migration has been run.

Mongo stores a single appState document (_id main, revision) plus rateLimits. Local development without Mongo uses data/excelrs.json via temporary write and rename. Single-document size/contention and cross-instance write concurrency require focused Mongo tests and review.

## 7. API route inventory

Handlers live under app/api. Inspect exact methods/payloads before changes.

- POST /api/auth/signup: create Coach/Player/Scout request, validate email/password, associate academy, issue verification and send email.
- POST /api/auth/login: username/password, active and email verification checks, signed cookie.
- POST /api/auth/logout; GET /api/auth/me.
- POST /api/auth/verify-email; POST /api/auth/resend-verification.
- POST /api/auth/forgot-password; POST /api/auth/reset-password.
- GET /api/bootstrap: role-specific scoped dashboard data; GET /api/health.
- GET /api/academy; PATCH /api/academy: owner changes offered sports.
- /api/players and /api/players/[id]; /api/players/[id]/sports for roster and sport workflows.
- POST /api/sessions; PATCH /api/sessions/[id] for attendance/closure.
- POST /api/matches; PATCH/DELETE /api/matches/[id] for match lifecycle and scores.
- POST /api/trials; /api/trials/[id] for trial lifecycle.
- PATCH /api/users/[id] for account approval/linking.
- /api/academy/owner, /api/academy/leave and /api/audit.

Do not assume GET exists for a route file. GET /api/sessions returned 405 in QA, which matches its current supported methods.

## 8. Authentication and authorization

Passwords use Node scrypt with random salt and 64-byte derived key; comparison uses timing-safe equality. Session cookie is HMAC signed, HttpOnly, SameSite=Lax and Secure in production; sessionVersion invalidates old sessions. Existing no-email accounts can use username/password. Accounts with email cannot login until verified.

Verification tokens are cryptographically random, stored as hashes, expire after 24 hours and are single use. Verification does not generally approve accounts; first verified owner Coach activation is a special flow, while Players/Scouts and later Coaches remain pending. Reset token expires after 30 minutes; only verified-email accounts are eligible. Reset validates password server-side, rehashes it, increments sessionVersion and does not log in automatically.

Forgot password uses a generic body/status and verified-account eligibility. A one-second minimum response duration reduces obvious branch differences but does not eliminate timing leakage, especially due to synchronous SMTP/database latency.

Rate limits include IP plus genuinely separate normalized-email identity limits for forgot/resend; email identity uses HMAC. Production uses MongoDB rateLimits; the in-memory Map is local development only. Production also requires valid SESSION_SECRET and Mongo URI.

## 9. Business logic

- One academy only; account association is not an academy creation flow.
- Player membership starts pending and must be email verified before Coach approval. Approval links an existing roster record; prevent duplicate identity/link.
- 28 supported sports are listed in lib/sports.ts. Sport-specific formats and scoring rules are in lib/sport-config.ts.
- Session dates are ISO dates. Sessions require offered sport and active roster. Every rostered player must be marked before closure; closed sessions are immutable.
- Match includes date, optional 24-hour local time, sport, format, opponent, optional venue and scheduled/played status. Format must belong to sport.
- Team formats support configured team-sheet/participant limits and optional starter/substitute, captain, jersey and positions. Individual formats use individual participants.
- Scores require participant presence in a closed same-date/sport session; absent player score is rejected. Incomplete/scheduled matches do not count as completed performance.
- Readiness is per sport: Present marks / closed sessions where rostered >= 75%, AND scored rows in at least two played matches. Exactly 75% plus two scored matches qualifies; one match does not. Do not alter without approval.
- Analytics uses persisted records, sport-configured sum/average/best and score direction. Missing values should remain honest/null, and unsupported legacy formats are unclassified. Outcome is not inferred from arbitrary score text.
- Current score model holds one scalar per player per match. It cannot capture full multidimensional scorecards (for example batting and bowling lines).

## 10. UI/UX

app/globals.css defines the visual system: warm paper background, dark olive/green, lime accent, muted neutral colors, DM Sans body, DM Mono labels and Barlow Condensed display. Dashboard has a fixed desktop sidebar and responsive app shell. Authentication pages use a centered responsive card and consistent form states. Preserve these conventions and avoid dashboard redesign.

Actual visual hierarchy, focus, keyboard, contrast, mobile layouts, console and network errors were not browser-tested in the last QA. Only root HTTP 200 was observed.

## 11. Known bugs and unresolved issues

- Actual duplicate link rejection through approval API is unverified. A second same-identity Player request exists in the temporary QA store but was not verified/approved to reach the collision path.
- Forgot password/reset was not tested end-to-end; need invalid/expired/reused token, validation, reset success, no-auto-login and old-session rejection coverage.
- No dedicated non-production MongoDB was used; persistence, restart and concurrent updates remain unverified. Never use an unknown URI or .env.local.
- No real SMTP delivery/receipt was tested. SMTP server acceptance alone does not establish inbox delivery.
- Browser automation unavailable; UI/accessibility checks blocked.
- No Vercel deployment/environment validation.
- Mongo single appState document may introduce contention and size limits; test concurrent writes and inspect mutation atomicity.
- Match time has no timezone field; it is optional local HH:mm.
- Conflicting legacy academy references fail closed and need a reviewed/manual migration; no production migration was performed.
- Gmail App Password was exposed in historical chat context. Value is intentionally omitted. Account owner must revoke/rotate it before real use; never reuse a value from chat/local files.
- Git status could not be refreshed during this handoff because the shell process helper was denied by sandbox permissions.

## 12. Branch and previously observed working-tree changes

Branch reference: feature/multisport-performance-analytics. No commit/push/merge/PR/deploy occurred in the latest integration QA. Preserve all existing work; do not reset, stash or clean.

Previous git status inventory, which MUST be refreshed before continuing:

Modified: .env.example, README.md, app/api/academy/route.ts, app/api/auth/login/route.ts, app/api/auth/signup/route.ts, app/api/bootstrap/route.ts, app/api/matches/[id]/route.ts, app/api/matches/route.ts, app/api/users/[id]/route.ts, app/globals.css, app/page.tsx, lib/auth.ts, lib/http.ts, lib/rate-limit.ts, lib/sports.ts, lib/store.ts, lib/types.ts, package-lock.json, package.json, scripts/seed-demo.mjs.

Untracked directories/files: app/api/auth/forgot-password, app/api/auth/resend-verification, app/api/auth/reset-password, app/api/auth/verify-email, app/forgot-password, app/reset-password, app/verify-email, components/, lib/email-auth.ts, lib/email-link.ts, lib/local-mongo.ts, lib/match-access.ts, lib/match-validation.ts, lib/membership.ts, lib/performance-analytics.ts, lib/single-academy.ts, lib/smtp-email.ts, lib/sport-config.ts, tests/.

The above is prior observation, not a fresh status from this task. This handoff should be the only file newly created by this task.

## 13. Recent changes and decisions

- Email verification/recovery moved to Gmail SMTP using reusable server-only Nodemailer utility; existing API contracts/templates/auth logic retained. Fragment links keep token out of request/referrer URL; client extracts then removes address fragment before POST.
- Security work added normalized email rate limit independent of IP, HMAC email identity, generic forgot response and safe SMTP diagnostics. Minimum delay is not a complete timing defense.
- Multi-sport match/performance implementation uses explicit config for all 28 sports, team/individual formats, team sheets, score validation and analytics. Follow-up fixes corrected analytics Match.format typing, substitute selection and unknown legacy formats.
- Single-academy conversion reuses existing academy identity and fails closed on conflicts; removed academy creation/code signup workflows, added pending Player membership and Coach linking.
- Demo seeder is guarded for loopback Mongo and does not create shared demo credentials.
- User requested QA only, with no code edits, no production data or real email, no .env.local access and no Git publication/deployment.

## 14. Tests, exact stopping point

### Checks from the immediately preceding QA work

- npm ci with lifecycle scripts enabled: passed, 41 packages added.
- npm test: passed 35/35 tests.
- npm exec tsc -- --noEmit: passed.
- npm run build: passed only from isolated copy without .env.local and with blank Mongo/SMTP settings. Build inside repository was not run to honor no .env.local read instruction.
- git diff --check: passed in earlier validation.

### Actual isolated HTTP/API route exercises

A temporary copy ran at localhost:3351 with blank MONGODB_URI/SMTP, test-only SESSION_SECRET/APP_URL and separate temporary JSON path. No production DB, real Mongo or email used. Test-only store-path override was made only in temporary copy, not repo.

Verified by actual local API calls: health/configured academy/root HTTP; Coach signup pending and login blocked until verified; fixture token stored hash-only; verification accepted once and reuse/expiry rejected; Coach login then worked; Coach created roster/session/match records; closed-session mutation rejected; absent score rejected and present score saved; match history included time/team sheet; exactly 75% attendance plus two scored matches returned Ready; Badminton Singles flow worked and invalid participant count rejected; Player signup/verification/pending approval flow worked; Coach linked Player to existing row; Player login/bootstrap exposed only linked player and audit denied; Scout pending login blocked, verification/Coach approval allowed login, Scout saw Ready-only players and no sessions; unknown-email forgot response was generic. GET /api/sessions returned 405.

Exact stop: created a second Player signup with same name/age as a now-linked player and unique email. It remained pending. Session ended before verifying that second account and attempting the real approval/link route collision. Password reset route workflow was not started. No Mongo, real SMTP receipt or visual/browser QA.

A temporary test server on port 3351 and test artifacts under %TEMP% with prefix khelgrid-it- may still exist. They are not production. Do not resume against repository local data.

## 15. Immediate next steps

1. Refresh git status --short --branch and inspect complete diff. Verify branch; preserve all existing changes. Do not run cleanup.
2. Continue in isolated test copy: hash-only fixture verification for duplicate Player request, attempt approval linking to already-bound player, assert conflict and unchanged records.
3. Exercise forgot-password for unknown/unverified/verified; same generic body/status. Mock SMTP. Exercise valid, invalid, expired, reused reset token; mismatch/length; no automatic sign-in; old session invalidation.
4. Keep test harness writes in temp copy. Repo source edits are not authorized by the current request.
5. Obtain explicit dedicated non-production MongoDB before persistence/concurrency/restart tests. Never infer or use a URI from .env.local. If unavailable, label Mongo checks BLOCKED.
6. When browser tool is available, inspect signup/login/verification/approval/dashboard at desktop and mobile; keyboard/focus/contrast; console/network. If not available, label BLOCKED.
7. For future changes, run npm test and TypeScript. Build only in isolated copy that excludes .env.local. Re-run diff check.
8. Verify Atlas/Vercel settings and SMTP receipt separately before any production-readiness claim. Stop at report; no commit, push, merge, PR or deploy without explicit authorization.

## 16. Setup and run instructions

Requirements: Node.js 20 LTS or newer and npm. MongoDB is optional for local-only development and required for production/shared instances.

1. Run npm ci.
2. If setting up local config, manually copy .env.example to .env.local only when no existing file needs preservation. Supply values yourself; never commit secrets.
3. For a truly fresh store, set ACADEMY_ID, ACADEMY_NAME, ACADEMY_LOCATION to the real fixed academy values. Existing data identity should be reused; mismatches fail closed.
4. Set SESSION_SECRET to a unique random secret (at least 32 characters in production). Set MONGODB_URI/MONGODB_DB for Atlas/shared deployment. Local development may use blank MONGODB_URI and ignored data/excelrs.json.
5. Email variables: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_SECURE=true, SMTP_USER, SMTP_PASS (Gmail App Password), EMAIL_FROM, APP_URL. Production APP_URL must be canonical HTTPS origin without path/query. Keep credentials server-side.
6. Start local development with npm run dev; default local origin http://localhost:3000. Common checks: npm test, npm exec tsc -- --noEmit, npm run build.
7. Read current README.md and .env.example for exact current deployment notes; do not run a seeder except against its dedicated local demo database.

## INSTRUCTIONS FOR THE NEXT CODING AGENT

- Read this handoff, then refresh branch/status/diff before touching anything. Continue on feature/multisport-performance-analytics and preserve every pre-existing change. Do not switch to main.
- Never access .env.local, expose secrets, reuse the historically exposed App Password, or stage local data. Ask the account owner to rotate the old App Password before live email.
- Resume from the unfinished duplicate-player approval and reset-token route tests above using isolated temporary storage. Do not recreate already implemented signup, email, match, analytics or academy features.
- Keep evidence categories separate: code inspection, unit tests, route-level HTTP tests, Mongo integration, actual SMTP receipt and browser UX are not interchangeable. Mark tests BLOCKED when unavailable; do not infer delivery from SMTP acceptance.
- Make no source edits under the present handoff-only request. Subsequent edits need explicit user authorization. No Firebase migration, role/readiness change, academy redesign, production migration, Git publication or deployment.
- Before ending, refresh Git status when shell access is restored. Expected addition from this task is only HANDOFF.md; preserve/report any other worktree changes rather than removing them.


## Latest continuation: offline release validation (2026-11-07)

This update supersedes earlier stopping-point and shell-status notes above. Fresh Git status was obtained through approved execution outside the failing sandbox helper; branch remains feature/multisport-performance-analytics and all existing work was preserved. No Windows ACL or Codex configuration was changed. The known isolated port-3351 server was stopped after process verification to release an SWC file lock for npm ci; its temporary data remains intact.

Actual HTTP testing in the preceding continuation completed the duplicate-link collision and preserved both original links, exercised valid/expired/invalid/reused verification/reset tokens, concurrent one-use reset, sessionVersion invalidation, three-role login and authorization, all 28 default sport workflows, persisted-record analytics, and the exact readiness boundary. Do not unnecessarily repeat those cases.

Fresh offline validation now passes: npm ci, 84/84 npm tests, TypeScript noEmit, environment-free isolated production build, and git diff --check. Added tests invoke real route functions with mocked framework/session/storage for every configured format, cross-academy rejection, duplicate linking/ownership; identity consistency and seeder protections; exact readiness; and safe opt-in Mongo runner URI guards. These are not equivalent to HTTP/browser/real-Mongo tests.

Next: follow docs/RELEASE_VALIDATION.md. The opt-in scripts/check-test-mongodb.mjs is prepared for a unique empty loopback khelgrid_test_ database, revision concurrency/shared-rate-limit checks, and a separate --verify process for restart persistence. It refuses unsafe URIs and retains test data. Real execution is BLOCKED: no local Mongo listener or Mongo/Docker executable was found. Browser remains BLOCKED with no available backend. Controlled SMTP receipt and Vercel/Atlas configuration remain UNVERIFIED; no live email was sent or production database used. No application/UI/CSS logic was changed in this offline task. No commit/push/PR/deploy. Existing MODULE_TYPELESS_PACKAGE_JSON warnings and direct-TypeScript test-runner Node compatibility are documented.
