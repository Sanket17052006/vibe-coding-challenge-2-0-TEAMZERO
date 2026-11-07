import test from "node:test";
import assert from "node:assert/strict";
import { consumePasswordReset, consumeVerification, emailAllowsLogin, genericForgotPasswordResult, hasDuplicateEmail, newToken, normalizeEmail, tokenHash, validEmail } from "../lib/email-auth.ts";
import { emailActionLink, extractAndClearEmailToken } from "../lib/email-link.ts";
import { identityRateLimitKey, rateLimitByIdentity } from "../lib/rate-limit.ts";

function fixture({ verified = true, version = 3 } = {}) {
  return { academies: [], users: [{ id: "u1", academyId: "a1", username: "player", displayName: "Player", role: "player", status: "active", email: verified ? "a@example.com" : undefined, emailVerifiedAt: verified ? "2025-01-01T00:00:00.000Z" : undefined, passwordHash: "old", passwordSalt: "salt", sessionVersion: version, createdAt: "2025-01-01T00:00:00.000Z" }], players: [], sessions: [], matches: [], trials: [], auditEvents: [], authTokens: [] };
}

test("signup email validation and uniqueness are normalized case-insensitively", () => {
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
  assert.equal(validEmail("user@example.com"), true);
  assert.equal(validEmail("not-an-email"), false);
  assert.equal(hasDuplicateEmail([{ id: "a", email: "User@Example.com" }], "user@example.COM"), true);
  assert.equal(normalizeEmail("NAME@bücher.de"), "name@xn--bcher-kva.de");
  assert.equal(hasDuplicateEmail([{ id: "idn", email: normalizeEmail("name@bücher.de") }], normalizeEmail("name@xn--bcher-kva.de")), true);
});

test("email validation accepts common formats and rejects malformed local parts and domains", () => {
  assert.equal(validEmail(" First.Last+tag@sub.example.co.uk "), true);
  assert.equal(validEmail("name_with-dash@EXAMPLE.COM"), true);
  assert.equal(validEmail("name@bücher.de"), true);
  for (const value of ["first..last@example.com", ".first@example.com", "first.@example.com", "a@b..com", "a@-example.com", "a@example-.com", "a@exa_mple.com", "a@example.c", "a@@example.com"]) {
    assert.equal(validEmail(value), false, value);
  }
});

test("email rate limits are shared across source IPs and do not store raw addresses", async () => {
  const secret = "test-secret-for-keyed-rate-limit";
  const email = normalizeEmail(" User@example.com ");
  const keyForRequest = (_sourceIp, address) => identityRateLimitKey("forgot-email", normalizeEmail(address), secret);
  const first = keyForRequest("192.0.2.10", email);
  const second = keyForRequest("198.51.100.20", "USER@EXAMPLE.COM");
  assert.equal(first, second);
  assert.equal(first.includes(email), false);
  assert.notEqual(first, keyForRequest("192.0.2.10", "another@example.com"));

  const scope = `test-email-${newToken().token}`;
  const requestFrom = (ip) => ({ headers: { get: (name) => name === "x-real-ip" ? ip : null } });
  assert.equal(await rateLimitByIdentity(requestFrom("192.0.2.10"), scope, email, 2, 60000), null);
  assert.equal(await rateLimitByIdentity(requestFrom("198.51.100.20"), scope, email, 2, 60000), null);
  const blocked = await rateLimitByIdentity(requestFrom("203.0.113.30"), scope, email, 2, 60000);
  assert.equal(blocked?.status, 429);
});

test("verification and reset links keep tokens in fragments and extraction clears browser history", () => {
  for (const [kind, pathname] of [["verify", "/verify-email"], ["reset", "/reset-password"]]) {
    const token = "secure-token-value";
    const link = new URL(emailActionLink(kind, "https://khelgrid.example", token));
    assert.equal(link.pathname, pathname);
    assert.equal(link.search, "");
    assert.equal(link.hash, `#token=${token}`);
    let cleanedAddress = "";
    const extracted = extractAndClearEmailToken(link.hash, link.search, link.pathname, (url) => { cleanedAddress = url; });
    assert.equal(extracted, token);
    assert.equal(cleanedAddress, pathname);
  }
});

test("legacy query token extraction also removes token from the address", () => {
  let cleanedAddress = "";
  assert.equal(extractAndClearEmailToken("", "?token=old-link&other=1", "/reset-password", (url) => { cleanedAddress = url; }), "old-link");
  assert.equal(cleanedAddress, "/reset-password");
});

test("forgot-password response contract is identical and generic", () => {
  const responses = ["unknown", "unverified", "verified"].map(() => genericForgotPasswordResult());
  assert.deepEqual(responses[0], responses[1]);
  assert.deepEqual(responses[1], responses[2]);
  assert.equal(responses[0].status, 200);
  assert.match(responses[0].body.message, /If an account/);
});

test("verification tokens are hashed, expire, and can only be consumed once", () => {
  const state = fixture({ verified: false }); const { token, hash } = newToken();
  assert.notEqual(hash, token); assert.equal(hash, tokenHash(token));
  state.authTokens.push({ userId: "u1", kind: "verify", hash, expiresAt: new Date(2000).toISOString() });
  assert.equal(consumeVerification(state, token, 3000), false);
  const fresh = newToken(); state.authTokens = [{ userId: "u1", kind: "verify", hash: fresh.hash, expiresAt: new Date(5000).toISOString() }];
  assert.equal(consumeVerification(state, fresh.token, 3000), true);
  assert.equal(state.users[0].emailVerifiedAt, new Date(3000).toISOString());
  assert.equal(consumeVerification(state, fresh.token, 3001), false);
});

test("legacy accounts without email remain eligible to log in", () => {
  assert.equal(emailAllowsLogin({}), true);
  assert.equal(emailAllowsLogin({ email: "a@example.com" }), false);
  assert.equal(emailAllowsLogin({ email: "a@example.com", emailVerifiedAt: "now" }), true);
});

test("reset tokens expire, are single-use, change password, and revoke sessions", () => {
  const state = fixture(); const expired = newToken();
  state.authTokens.push({ userId: "u1", kind: "reset", hash: expired.hash, expiresAt: new Date(1000).toISOString() });
  assert.equal(consumePasswordReset(state, expired.token, { hash: "new", salt: "new-salt" }, 2000), false);
  const fresh = newToken(); state.authTokens = [{ userId: "u1", kind: "reset", hash: fresh.hash, expiresAt: new Date(5000).toISOString() }];
  assert.equal(consumePasswordReset(state, fresh.token, { hash: "new", salt: "new-salt" }, 3000), true);
  assert.equal(state.users[0].passwordHash, "new"); assert.equal(state.users[0].sessionVersion, 4);
  assert.equal(consumePasswordReset(state, fresh.token, { hash: "again", salt: "again" }, 3001), false);
});

test("unverified email cannot consume a reset token", () => {
  const state = fixture({ verified: false }); const issued = newToken();
  state.authTokens.push({ userId: "u1", kind: "reset", hash: issued.hash, expiresAt: new Date(5000).toISOString() });
  assert.equal(consumePasswordReset(state, issued.token, { hash: "new", salt: "salt" }, 3000), false);
});
