import type { Academy, Store } from "./types";

export type AcademyConfiguration = Pick<Academy, "id" | "name" | "location">;

export function assertSingleAcademyState(state: Pick<Store, "academies" | "users" | "players" | "sessions" | "matches" | "trials" | "auditEvents">): void {
  if (state.academies.length > 1) throw new Error("Multiple academy records require a reviewed migration before single-academy mode can run.");
  const ids = new Set<string>(state.academies.map((academy) => academy.id));
  for (const entry of [...state.users, ...state.players, ...state.sessions, ...state.matches, ...state.trials, ...state.auditEvents]) {
    if (entry.academyId) ids.add(entry.academyId);
  }
  if (ids.size > 1) throw new Error("Academy-scoped records refer to multiple academy identities; a reviewed migration is required.");
}

export function resolveAcademyIdentity(
  state: Pick<Store, "academies" | "users" | "players" | "sessions" | "matches" | "trials" | "auditEvents">,
  env: Record<string, string | undefined> = process.env,
): AcademyConfiguration {
  assertSingleAcademyState(state);
  const existing = state.academies[0];
  const configuredId = env.ACADEMY_ID?.trim();
  if (existing) {
    if (configuredId && configuredId !== existing.id) throw new Error("ACADEMY_ID does not match the existing academy identity.");
    return { id: existing.id, name: existing.name, location: existing.location };
  }

  const id = configuredId;
  const name = env.ACADEMY_NAME?.trim();
  const location = env.ACADEMY_LOCATION?.trim();
  if (!id || !name || !location) throw new Error("Configure ACADEMY_ID, ACADEMY_NAME, and ACADEMY_LOCATION before registering the first account.");
  if (id.length > 100 || name.length > 100 || location.length > 120) throw new Error("The configured academy identity exceeds supported lengths.");
  const scopedRecords = [ ...state.users, ...state.players, ...state.sessions, ...state.matches, ...state.trials, ...state.auditEvents ];
  if (scopedRecords.some((entry) => !entry.academyId)) throw new Error("Legacy records without an academy identity require a reviewed migration before single-academy setup.");
  const legacyIds = new Set(scopedRecords.map((entry) => entry.academyId).filter(Boolean));
  if (legacyIds.size && (legacyIds.size !== 1 || !legacyIds.has(id))) throw new Error("Configured academy identity does not match existing records; a reviewed migration is required.");
  return { id, name, location };
}

export function configuredAcademyRecord(identity: AcademyConfiguration, sports: string[] = []): Academy {
  return { ...identity, sports: [...new Set(sports)], createdAt: new Date().toISOString() };
}
