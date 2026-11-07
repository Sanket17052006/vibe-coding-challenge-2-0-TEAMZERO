# KhelGrid — Sports Desk

KhelGrid is a mobile-friendly operations workspace for grassroots sports academies. It helps coaches keep player records, attendance, fixtures, results, ratings, and trial readiness in one place.

## Problem and objectives

Small academies often coordinate training and player progress across paper sheets and chat messages. KhelGrid provides a shared record for academy staff and players while keeping academy access, coach responsibilities, and scout views scoped by role.

The project focuses on:

- A practical player register with stable Player IDs.
- Attendance and match records that support a transparent readiness rule.
- Separate Coach, Player, and Scout permissions.
- Approval workflows for academy membership and sport requests.
- Username/password authentication with email verification and password recovery.

## Features

- Multi-academy accounts with academy codes and an academy owner.
- Coach-managed players, sports, attendance sessions, fixtures, results, and ratings.
- Player views limited to their own records and trial calls.
- Scout views limited to Ready players and trial shortlist actions.
- Coach approval for pending Coach, Player, Scout, and sport requests.
- Per-sport readiness: at least 75% attendance in closed sessions where the player was rostered, plus score rows in at least two played matches.
- Email verification for new accounts, with 24-hour single-use links.
- Forgot-password and reset-password flows, with 30-minute single-use links.
- Session invalidation after a password reset or account access change.
- Responsive KhelGrid dashboard and authentication pages.

A trial call is an in-app shortlist decision. It does not schedule an event or send an external notification. Attendance, results, and ratings are entered by a Coach; the app does not independently verify physical presence.

## Roles and permissions

| Role | Capabilities |
| --- | --- |
| Coach | Manage the academy and assigned sports, players, attendance, matches, access requests, and audit events. The academy owner can configure offered sports and transfer ownership. |
| Player | See their own player record, attendance, match history, ratings, and active or withdrawn trial calls. Request additional academy sports for Coach approval. |
| Scout | See eligible Ready players and their aggregate sport statistics; create or withdraw trial calls. Scouts do not administer attendance or matches. |

New accounts must verify their email before signing in. Email verification does not approve a pending academy account. Coaches still review and approve access requests. Existing accounts without an email retain the username/password login flow.

## Technology and architecture

- Next.js App Router, React, and TypeScript.
- MongoDB Node.js driver for persistent MongoDB storage.
- Nodemailer with Gmail SMTP for transactional email.
- Node.js crypto scrypt for password hashing and HMAC for signed sessions and rate-limit keys.
- Custom responsive CSS and Lucide icons.

The browser sends same-origin JSON requests to Next.js route handlers. Handlers validate input, check the signed session and role, then read or mutate academy-scoped state. A small deployment stores the state in one revision-checked MongoDB document. Local development without MONGODB_URI uses data/excelrs.json. In-memory state is only a process cache; production requires MongoDB.

~~~mermaid
flowchart LR
  B[Coach, Player, Scout browser] -->|same-origin JSON and session cookie| N[Next.js pages and API handlers]
  N --> A[Validation, role checks, academy and sport scope]
  A --> S[Application state]
  S -->|MONGODB_URI set| M[(MongoDB appState and rateLimits)]
  S -->|local development only| F[(data/excelrs.json)]
  N -->|awaited SMTP messages| E[Gmail SMTP]
~~~

## Repository structure

    app/
      api/                 Route handlers for auth, academy, players, sessions, matches, trials, and audit
      forgot-password/     Forgot-password page
      reset-password/      Password-reset page
      verify-email/         Email-verification page
      globals.css          Dashboard and authentication styles
      page.tsx             Login, signup, and dashboard
      layout.tsx           App shell and metadata
    lib/
      auth.ts              Password checks, signed sessions, role helpers
      email-auth.ts        Email validation, token lifecycle, email templates
      email-link.ts        Canonical links and fragment-token extraction
      http.ts              Same-origin and bounded JSON helpers
      rate-limit.ts        Local and MongoDB-backed request limits
      readiness.ts         Per-sport readiness calculations
      smtp-email.ts        Reusable server-only Gmail SMTP sender
      store.ts             MongoDB/local persistence and legacy normalization
      types.ts             Academy and domain types
    public/                KhelGrid marks and README artwork
    scripts/               Optional local development scripts
    tests/                 Node test-runner tests with mocked SMTP

## Requirements

- Node.js 22.6 or newer and npm. The app's SMTP dependency supports Node.js 20+, but the repository test command uses Node's TypeScript stripping flag, available in Node.js 22.6+.
- MongoDB is optional for local development. MongoDB Atlas is required for a persistent Vercel deployment.
- A Gmail account that is permitted to use an App Password for SMTP if email delivery is needed.

## Install and run locally

1. Clone or download the repository and open a terminal in its root directory.
2. Install the locked dependencies:

    npm ci

3. Create a local environment file by copying .env.example to .env.local. On PowerShell:

    Copy-Item .env.example .env.local

   Edit only your local .env.local. Do not commit it.
4. For local use, leave MONGODB_URI blank to use the ignored JSON data file. For email delivery, configure the SMTP variables below.
5. Start the development server:

    npm run dev

6. Open http://localhost:3000.

Without MongoDB or SMTP configured, the app can be explored locally, but new accounts cannot complete email verification. Existing accounts without email can still use the existing username/password flow. Do not use real player data in an unprotected local environment.

## Environment variables

| Variable | Local development | Production |
| --- | --- | --- |
| MONGODB_URI | Blank selects local JSON storage; a local MongoDB URI is also supported. | Required. Use a MongoDB Atlas connection string and restrict Atlas network access. |
| MONGODB_DB | Optional; defaults to excelrs. | Set the application database name. |
| SESSION_SECRET | A local fallback exists for development only. | Required: unique, random, and at least 32 characters. Never use the sample placeholder. |
| SMTP_HOST | smtp.gmail.com for Gmail. | smtp.gmail.com. |
| SMTP_PORT | 465 for Gmail. | 465. |
| SMTP_SECURE | true for Gmail. | true. |
| SMTP_USER | Gmail mailbox used for SMTP authentication. | Gmail mailbox used for SMTP authentication. |
| SMTP_PASS | Google App Password, when SMTP is enabled. | Google App Password stored as a server-side secret. |
| EMAIL_FROM | Sender name and address permitted for that Gmail account. | Sender name and address permitted for that Gmail account. |
| APP_URL | Canonical local origin, normally http://localhost:3000. | Canonical deployed HTTPS origin, without a path, query, or fragment. |

These variables are server-side. Do not add secrets to NEXT_PUBLIC_* variables.

### Gmail App Password setup

1. Open Google Account settings and enable 2-Step Verification.
2. Open the Google Account App Passwords page and create a password for this application.
3. Put the generated value in SMTP_PASS and the matching Gmail address in SMTP_USER and EMAIL_FROM.
4. Restart the local app after changing its environment.

Google only offers App Passwords to eligible accounts. Managed work or school accounts, Advanced Protection, and some 2-Step Verification configurations may not offer the option. See [Google's App Password help](https://support.google.com/accounts/answer/185833).

The app uses Gmail SMTP over TLS on port 465. Nodemailer verifies SMTP configuration before the first send and awaits each send in the API request. SMTP acceptance means the SMTP provider accepted the message for submission; it does not guarantee inbox placement or final delivery.

## Persistence and local development

When MONGODB_URI is unset outside production, the app uses data/excelrs.json and an in-process cache. This is for local development only. The JSON data file is not a shared store and must not be used for Vercel serverless deployments.

With MONGODB_URI configured, the app stores its state in the appState collection and uses a shared rateLimits collection for production rate limiting. MongoDB writes use revision checks to avoid overwriting concurrent application-state updates. The current design stores academy state in one MongoDB document, so it has the MongoDB document-size limit and may serialize writes under load.

The legacy scripts/seed-demo.mjs is not compatible with the required email-verification signup flow. It now refuses to write data rather than leave a partially seeded workspace. Use the application signup and approval workflows for development until that script is redesigned.

## Authentication and email workflows

### Signup and login

Signup requires a normalized, valid, case-insensitively unique email and a password from 8 to 128 characters. Passwords are hashed with scrypt. Existing username/password login remains in place. New accounts cannot sign in until their email is verified; their Coach approval state remains independently pending or active.

### Email verification

The server creates a cryptographically random token and stores only its hash with a 24-hour expiry. The link places the token in the URL fragment. The page reads the fragment in the browser, removes it from the address bar, then sends it to the verification API with POST. The token is single-use. Resend requests are limited independently by IP and normalized email.

### Password recovery

Forgot-password requests return the same generic response for unknown, unverified, and eligible verified addresses. A minimum response duration reduces obvious timing differences, but synchronous SMTP latency means timing cannot be made identical. Only verified email addresses receive reset links. Reset tokens are random, hashed in storage, single-use, and expire after 30 minutes. A successful reset uses scrypt, increments sessionVersion to invalidate prior sessions, and requires the user to sign in again.

Email action tokens are not stored in browser storage. Pages use a no-referrer policy. SMTP exceptions are reduced to safe errors and sanitized diagnostics; credentials, email addresses, and token values are not intentionally logged.

## API route reference

All request bodies are same-origin JSON and bounded by the shared request helper. Protected routes require an active signed-in user and check role, academy, and where applicable sport scope.

| Method and path | Purpose |
| --- | --- |
| POST /api/auth/signup | Create Coach, Player, or Scout account; request academy or sport access; send verification email. |
| POST /api/auth/login | Username/password login, pending-account and email-verification checks. |
| POST /api/auth/logout | Clear the session cookie. |
| GET /api/auth/me | Return the current public user. |
| POST /api/auth/verify-email | Consume a verification token. |
| POST /api/auth/resend-verification | Rate-limited verification email request. |
| POST /api/auth/forgot-password | Generic password-recovery request. |
| POST /api/auth/reset-password | Validate a reset token and replace the password. |
| GET /api/health | Report application storage availability without returning database credentials. |
| GET /api/bootstrap | Return a role-scoped dashboard snapshot. |
| GET, PATCH /api/academy | Read academy details or update owner-managed offered sports. |
| PATCH /api/academy/owner | Transfer academy ownership to an active Coach. |
| POST /api/academy/leave | Leave an academy subject to owner and active-Coach safeguards. |
| GET /api/audit | Return permitted academy audit events to Coaches. |
| POST /api/players | Create a player record (Coach). |
| PATCH /api/players/[id] | Archive or restore a player (Coach). |
| POST /api/players/[id]/sports | Request sports for the signed-in Player. |
| PATCH /api/players/[id]/sports | Approve or decline player sport requests (Coach). |
| POST /api/sessions | Open an attendance session (Coach). |
| PATCH /api/sessions/[id] | Update attendance or close a session (Coach). |
| POST /api/matches | Schedule a match (Coach). |
| PATCH, DELETE /api/matches/[id] | Update or delete an academy match (Coach). |
| POST /api/trials | Call an eligible player for a trial (Scout). |
| DELETE /api/trials/[id] | Withdraw the Scout's trial call. |
| PATCH /api/users/[id] | Approve or decline an academy access request (Coach). |

## Tests and production build

Run the automated checks from the repository root:

    npm test
    npm exec tsc -- --noEmit
    npm run build
    git diff --check

The current tests cover email validation and normalization, rate-limit keying, email-token extraction and history cleanup, generic forgot-password response shape, token expiry and reuse, legacy accounts, reset/session invalidation, and mocked SMTP configuration and response handling. They do not yet provide route-level or full integration coverage for signup approvals, the complete verification/reset HTTP flows, MongoDB conflict retries, or cross-instance production rate limiting. No automated test sends real email.

## Vercel deployment

1. Create a MongoDB Atlas database and a dedicated application user. Restrict database network access to the deployment environment as appropriate.
2. Create or select a Vercel project and connect the repository.
3. In the Vercel project settings, add the production environment variables listed above. Store SMTP_PASS, SESSION_SECRET, and MONGODB_URI as server-side secrets. Do not use NEXT_PUBLIC_* for them.
4. Set APP_URL to the canonical HTTPS origin users will visit. Do not use localhost, a preview URL, a trailing path, query, or fragment for production.
5. Set SMTP_HOST, SMTP_PORT, and SMTP_SECURE to the required Gmail TLS settings; set SMTP_USER and EMAIL_FROM to the permitted Gmail sender.
6. Deploy the feature through your normal review process, then check /api/health and test signup, verification, resend, recovery, reset, login, and role-scoped API access using non-production accounts.
7. Confirm the Gmail account accepted the message and separately confirm recipient inbox delivery. SMTP acceptance alone is not proof of delivery.

Vercel environment changes apply to new deployments, so deploy again after changing configuration. See [Vercel's environment-variable guide](https://vercel.com/docs/environment-variables).

## Security and production limitations

- Production requires MongoDB; the filesystem fallback is not used as persistent serverless storage.
- Rate limiting is MongoDB-backed in production and process-local during local development.
- Email sending is synchronous with the API request. Provider failures are handled safely, but network outages can delay requests.
- Forgot-password response timing is generic with a minimum duration, but provider latency can remain observable.
- SMTP acceptance is not proof of delivery or inbox placement.
- There is no MFA, CI workflow, full data export, guardian-consent workflow, or external trial notification.
- Academies share one state document, which is appropriate only for small deployments. Backups, monitoring, retention, consent, and incident procedures need to be planned before using real records at scale. Player records can contain minors' names and ages.

## Development and contribution

Keep authentication, database, and authorization changes covered by tests. Use mocked SMTP transports in automated tests; do not send real messages from the test suite. Keep secrets in local environment files or deployment settings, and never commit .env.local, real credentials, personal player exports, or generated local data.

Before proposing a change, run the tests, TypeScript check, production build, and diff check. Preserve the established KhelGrid UI and role workflows unless a change explicitly requires otherwise.

## License

All rights reserved. No permission is granted to copy, modify, redistribute, publish, or use this source code without prior written permission from the project owner. Making a repository public does not grant a license.
