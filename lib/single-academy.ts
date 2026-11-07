import { randomUUID } from "node:crypto";
import type { Academy, Store, User } from "./types";

export type AcademyConfiguration = Pick<Academy, "id" | "name" | "location">;
type AcademyState = Pick<Store, "academies" | "users" | "players" | "sessions" | "matches" | "trials" | "auditEvents" | "academySetup">;

export function assertSingleAcademyState(state: AcademyState): void {
  if (state.academies.length > 1) throw new Error("Multiple academy records require a reviewed migration before single-academy mode can run.");
  const ids = new Set<string>(state.academies.map(academy => academy.id));
  if (state.academySetup?.id) ids.add(state.academySetup.id);
  for (const entry of [...state.users, ...state.players, ...state.sessions, ...state.matches, ...state.trials, ...state.auditEvents]) {
    if (entry.academyId) ids.add(entry.academyId);
  }
  if (ids.size > 1) throw new Error("Academy-scoped records refer to multiple academy identities; a reviewed migration is required.");
}

export function resolveAcademyIdentity(state: AcademyState, env: Record<string, string | undefined> = process.env): AcademyConfiguration {
  assertSingleAcademyState(state);
  const existing = state.academies[0];
  if (existing) return { id: existing.id, name: existing.name, location: existing.location };
  const records = [...state.users, ...state.players, ...state.sessions, ...state.matches, ...state.trials, ...state.auditEvents];
  if (records.some(entry => !entry.academyId)) throw new Error("Legacy records without an academy identity require a reviewed migration before single-academy setup.");
  const legacyId = records.find(entry => entry.academyId)?.academyId;
  const id = state.academySetup?.id || legacyId;
  if (!id) throw new Error("Academy registration identity has not been reserved yet.");
  const name = env.ACADEMY_NAME?.trim() || "KhelGrid Academy";
  const location = env.ACADEMY_LOCATION?.trim() || "";
  if (name.length > 100 || location.length > 120) throw new Error("The configured academy display details exceed supported lengths.");
  return { id, name, location };
}

/** Call only inside mutateStore; reserve an ID without creating an academy or owner. */
export function reserveAcademyIdentity(state: Store): string {
  assertSingleAcademyState(state);
  if (state.academies[0]) return state.academies[0].id;
  if (!state.academySetup) {
    const records = [...state.users, ...state.players, ...state.sessions, ...state.matches, ...state.trials, ...state.auditEvents];
    if (records.some(entry => !entry.academyId)) throw new Error("Legacy records without an academy identity require a reviewed migration before single-academy setup.");
    state.academySetup = { id: records.find(entry => entry.academyId)?.academyId || randomUUID() };
  }
  return state.academySetup.id;
}

export function configuredAcademyRecord(identity: AcademyConfiguration, sports: string[] = []): Academy {
  return { ...identity, sports: [...new Set(sports)], createdAt: new Date().toISOString() };
}

/** Verification and this initialization share one revision-checked mutation. */
export function activateVerifiedCoach(state: Store, user: User, env: Record<string, string | undefined> = process.env): void {
  if (user.role !== "coach" || user.status !== "pending" || !user.emailVerifiedAt) return;
  const id = reserveAcademyIdentity(state);
  if (user.academyId !== id) throw new Error("Academy-scoped records refer to multiple academy identities; a reviewed migration is required.");
  let academy = state.academies[0];
  if (!academy) {
    academy = configuredAcademyRecord(resolveAcademyIdentity(state, env), user.coachSports ?? []);
    state.academies.push(academy);
  }
  academy.sports = [...new Set([...(academy.sports ?? []), ...(user.coachSports ?? [])])];
  // Legacy active Coaches keep their ownership; a pending/unverified registration cannot reserve it.
  const activeCoaches = state.users.filter(entry => entry.academyId === id && entry.role === "coach" && entry.status === "active");
  const owner = activeCoaches.find(entry => entry.isOwner) ?? activeCoaches.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? user;
  for (const coach of state.users.filter(entry => entry.academyId === id && entry.role === "coach")) coach.isOwner = coach.id === owner.id;
  user.status = "active";
}
