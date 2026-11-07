import test from "node:test";
import assert from "node:assert/strict";
import { buildPendingAccount, canLinkPendingPlayer } from "../lib/membership.ts";

function account(role, overrides = {}) {
  return buildPendingAccount({
    id: "user-" + role, academyId: "academy-fixed", username: "new-user",
    displayName: "Aarav Singh", email: "aarav@example.com", role,
    passwordHash: "scrypt-hash", passwordSalt: "salt", createdAt: "2026-01-01T00:00:00.000Z",
    isFirstCoach: false, requestedSports: ["Football"], age: 16, ...overrides,
  });
}

test("Coach, Player, and Scout registrations all start pending under the same academy", () => {
  const owner = account("coach", { id: "owner", isFirstCoach: true, requestedSports: [] });
  const coach = account("coach", { id: "coach-2", isFirstCoach: false });
  const player = account("player");
  const scout = account("scout");

  for (const created of [owner, coach, player, scout]) {
    assert.equal(created.status, "pending");
    assert.equal(created.academyId, "academy-fixed");
    assert.equal(created.email, "aarav@example.com");
  }
  assert.equal(owner.isOwner, true);
  assert.equal(coach.isOwner, false);
  assert.deepEqual(player.pendingPlayer, { age: 16, sports: ["Football"] });
  assert.equal("playerId" in player, false);
  assert.equal("pendingPlayer" in scout, false);
});

test("Player linking requires the verified matching active record and prevents duplicate links", () => {
  const pending = { ...account("player"), emailVerifiedAt: "2026-01-02T00:00:00.000Z" };
  const record = { id: "player-1", academyId: "academy-fixed", name: "Aarav Singh", age: 16, sport: "Football", sports: ["Football"], active: true, createdAt: "2025-01-01T00:00:00.000Z" };
  assert.equal(canLinkPendingPlayer(pending, record, [pending]), true);
  assert.equal(canLinkPendingPlayer({ ...pending, emailVerifiedAt: undefined }, record, [pending]), false);
  assert.equal(canLinkPendingPlayer(pending, { ...record, age: 17 }, [pending]), false);
  assert.equal(canLinkPendingPlayer(pending, { ...record, academyId: "other" }, [pending]), false);
  assert.equal(canLinkPendingPlayer(pending, { ...record, active: false }, [pending]), false);
  assert.equal(canLinkPendingPlayer(pending, record, [pending, { ...account("player", { id: "other" }), status: "active", playerId: "player-1" }]), false);
});
