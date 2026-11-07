import type { Role, User, Player } from "./types";

type PendingAccountInput = {
  id: string;
  academyId: string;
  username: string;
  displayName: string;
  email: string;
  role: Role;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  requestedSports: string[];
  age?: number;
};

export function buildPendingAccount(input: PendingAccountInput): User {
  if (input.role === "player" && !Number.isInteger(input.age)) throw new Error("Player registrations require a valid age.");
  return {
    id: input.id,
    academyId: input.academyId,
    username: input.username,
    displayName: input.displayName,
    email: input.email,
    role: input.role,
    status: "pending",
    ...(input.role === "player" && input.age !== undefined ? { pendingPlayer: { age: input.age, sports: input.requestedSports } } : {}),
    coachSports: input.role === "coach" ? input.requestedSports : undefined,
    scoutSports: input.role === "scout" ? input.requestedSports : undefined,
    isOwner: false,
    passwordHash: input.passwordHash,
    passwordSalt: input.passwordSalt,
    createdAt: input.createdAt,
  };
}

function normalizedName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function canLinkPendingPlayer(account: User, player: Player, users: User[]) {
  if (account.role !== "player" || account.status !== "pending" || !account.emailVerifiedAt || !account.pendingPlayer) return false;
  if (!player.active || player.academyId !== account.academyId) return false;
  if (player.age !== account.pendingPlayer.age || normalizedName(player.name) !== normalizedName(account.displayName)) return false;
  if (player.userId && player.userId !== account.id) return false;
  return !users.some((entry) => entry.id !== account.id && entry.academyId === account.academyId && entry.role === "player" && entry.status === "active" && entry.playerId === player.id);
}
