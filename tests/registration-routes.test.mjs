import test from "node:test";
import assert from "node:assert/strict";
import { routeHarness, fixture } from "./helpers/route-harness.mjs";
const details = (username, role = "coach", sports = ["Football"]) => ({ username, displayName: "Test " + username, email: username + "@example.invalid", password: "Test-only-password-123", role, sports, ...(role === "player" ? { age: 16 } : {}) });

test("public academy route allows fresh registration without academy configuration", async () => {
  const state = fixture(); state.academies = [];
  const response = await routeHarness("app/api/academy/route.ts", state, null).invoke("GET");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.academy, null);
  assert.equal(body.registrationOpen, true);
  assert.equal(body.sports.length, 28);
  assert.equal(state.academies.length, 0);
});

test("real signup and verification handlers initialize one academy only at first Coach verification", async () => {
  const state = fixture(); state.academies = [];
  const outbox = [];
  const signup = routeHarness("app/api/auth/signup/route.ts", state, null, { outbox });
  assert.equal((await signup.invoke("POST", undefined, details("coach-one", "coach", ["Football", "Badminton"])) ).status, 202);
  assert.equal((await signup.invoke("POST", undefined, details("coach-two", "coach", ["Cricket"])) ).status, 202);
  assert.equal(state.academies.length, 0);
  assert.ok(state.users.every(user => user.status === "pending" && !user.isOwner));
  assert.equal(new Set(state.users.map(user => user.academyId)).size, 1);
  assert.ok(state.authTokens.every(row => row.hash && !Object.hasOwn(row, "token")));
  const verification = routeHarness("app/api/auth/verify-email/route.ts", state, null);
  const results = await Promise.all(outbox.map(email => verification.invoke("POST", undefined, { token: email.token })));
  assert.ok(results.every(response => response.status === 200));
  assert.equal(state.academies.length, 1);
  assert.equal(state.users.filter(user => user.isOwner).length, 1);
  assert.ok(state.users.every(user => user.status === "active" && user.emailVerifiedAt));
  assert.equal(state.academies[0].id, state.academySetup.id);
  assert.deepEqual([...state.academies[0].sports].sort(), ["Badminton", "Cricket", "Football"]);
  assert.deepEqual([...state.users[0].coachSports], ["Football", "Badminton"]);
  assert.equal((await verification.invoke("POST", undefined, { token: outbox[0].token })).status, 400);
  assert.equal((await signup.invoke("POST", undefined, details("coach-three", "coach", ["Swimming"]))).status, 202);
  assert.equal((await verification.invoke("POST", undefined, { token: outbox.at(-1).token })).status, 200);
  assert.equal(state.users[2].status, "active");
  assert.equal(state.users[2].isOwner, false);
  assert.equal(state.academies.length, 1);
});

test("all roles validate catalogue sports and Player requests stay pending after verification", async () => {
  const state = fixture(); const outbox = [];
  const signup = routeHarness("app/api/auth/signup/route.ts", state, null, { outbox });
  for (const role of ["coach", "player", "scout"]) {
    assert.equal((await signup.invoke("POST", undefined, details("invalid-" + role, role, []))).status, 400);
    assert.equal((await signup.invoke("POST", undefined, details("invalid-" + role, role, ["Unknown sport"])) ).status, 400);
  }
  const verification = routeHarness("app/api/auth/verify-email/route.ts", state, null);
  for (const role of ["player", "scout"]) {
    const response = await signup.invoke("POST", undefined, details("pending-" + role, role));
    assert.equal(response.status, 202);
    assert.equal((await response.json()).requiresApproval, true);
    const verified = await verification.invoke("POST", undefined, { token: outbox.at(-1).token });
    assert.equal((await verified.json()).requiresApproval, true);
    assert.equal(state.users.at(-1).status, "pending");
  }
  assert.deepEqual([...state.users.find(user => user.role === "scout").scoutSports], ["Football"]);
  const duplicate = { ...details("different-username"), email: "PENDING-PLAYER@EXAMPLE.INVALID" };
  assert.equal((await signup.invoke("POST", undefined, duplicate)).status, 409);
});
