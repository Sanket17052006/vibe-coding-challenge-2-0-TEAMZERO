import { randomBytes, randomUUID, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { MongoClient } from "mongodb";
import { AuditEvent, Store } from "./types";
import { assertSingleAcademyState } from "./single-academy";
export { isLocalMongoUri } from "./local-mongo";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";

const scrypt = promisify(scryptCallback);
const DATA_FILE = path.join(process.cwd(), "data", "excelrs.json");
let clientPromise: Promise<MongoClient> | null = null;
let memoryStore: Store | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let mutationQueue: Promise<void> = Promise.resolve();
type MongoStateDocument = { _id: string; revision: number; state: Store };

export async function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return { salt, hash: key.toString("hex") };
}

export async function createEmptyStore(): Promise<Store> {
  return { academies: [], users: [], players: [], sessions: [], matches: [], trials: [], auditEvents: [], authTokens: [] };
}

function normalizeStore(value: unknown): Store {
  if (!value || typeof value !== "object") throw new Error("Stored KhelGrid data is not a valid object.");
  const raw = value as Partial<Store> & { academy?: Store["academies"][number] | null };
  if (!Array.isArray(raw.users) || !Array.isArray(raw.players) || !Array.isArray(raw.sessions) || !Array.isArray(raw.matches)) throw new Error("Stored KhelGrid data is missing required collections.");
  const academies = Array.isArray(raw.academies) ? raw.academies : raw.academy ? [raw.academy] : [];
  const legacyAcademyId = raw.academy?.id ?? (academies.length === 1 ? academies[0].id : undefined);
  const users = raw.users.map((user) => ({ ...user, academyId: user.academyId ?? legacyAcademyId ?? "" }));
  const players = raw.players.map((player) => ({ ...player, academyId: player.academyId ?? legacyAcademyId ?? "", sports: Array.isArray(player.sports) ? player.sports : [player.sport], sportRequests: Array.isArray(player.sportRequests) ? player.sportRequests : [] }));
  if (raw.academy && users.some((user) => user.role === "coach") && !users.some((user) => user.role === "coach" && user.isOwner)) {
    const foundingCoach = users.filter((user) => user.role === "coach").sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (foundingCoach) foundingCoach.isOwner = true;
  }
  const normalizedAcademies = academies.map((academy) => ({ ...academy, sports: Array.isArray(academy.sports) ? academy.sports : [...new Set(players.filter((player) => player.academyId === academy.id).flatMap((player) => player.sports ?? []))] }));
  const normalized = {
    academies: normalizedAcademies,
    users,
    players,
    sessions: raw.sessions.map((session) => ({ ...session, academyId: session.academyId ?? legacyAcademyId ?? "", playerIds: session.playerIds ?? session.attendance?.map((row) => row.playerId) ?? [] })),
    matches: raw.matches.map((match) => ({ ...match, academyId: match.academyId ?? legacyAcademyId ?? "" })),
    trials: Array.isArray(raw.trials) ? raw.trials.map((trial) => ({ ...trial, academyId: trial.academyId ?? legacyAcademyId ?? "", status: trial.status === "withdrawn" ? "withdrawn" : "active" })) : [],
    auditEvents: Array.isArray(raw.auditEvents) ? raw.auditEvents.map((event) => ({ ...event, academyId: event.academyId ?? legacyAcademyId ?? "" })) : [],
    authTokens: Array.isArray(raw.authTokens) ? raw.authTokens : [],
  } as Store;
  assertSingleAcademyState(normalized);
  return normalized;
}

async function getMongoClient() {
  if (!process.env.MONGODB_URI) {
    if (process.env.NODE_ENV === "production") throw new Error("MONGODB_URI is required in production. Configure MongoDB Atlas in the deployment environment.");
    return null;
  }
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI, { connectTimeoutMS: 8000, serverSelectionTimeoutMS: 8000 });
    clientPromise = client.connect().catch(async (error) => { clientPromise = null; await client.close().catch(() => undefined); throw error; });
  }
  return clientPromise;
}

export async function getMongoDatabase() {
  const client = await getMongoClient();
  if (!client) throw new Error("MongoDB is required for this operation.");
  return client.db(process.env.MONGODB_DB || "excelrs");
}

export async function getStore(): Promise<Store> {
  const client = await getMongoClient();
  if (client) {
    const col = client.db(process.env.MONGODB_DB || "excelrs").collection<MongoStateDocument>("appState");
    const doc = await col.findOne({ _id: "main" });
    if (doc) {
      if (typeof doc.revision !== "number") await col.updateOne({ _id: "main", revision: { $exists: false } }, { $set: { revision: 0 } });
      return normalizeStore(doc.state);
    }
    const empty = await createEmptyStore();
    try {
      await col.updateOne({ _id: "main" }, { $setOnInsert: { state: empty, revision: 0 } }, { upsert: true });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
    }
    const fresh = await col.findOne({ _id: "main" });
    if (!fresh) throw new Error("Unable to initialize the MongoDB state document.");
    return normalizeStore(fresh.state);
  }
  if (memoryStore) return memoryStore;
  try {
    memoryStore = normalizeStore(JSON.parse(await readFile(DATA_FILE, "utf8")) as unknown);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw new Error("Could not read local KhelGrid data. The data file may be damaged; it was left untouched.");
    const emptyStore = await createEmptyStore();
    await persistStore(emptyStore);
    return emptyStore;
  }
  return memoryStore;
}

export async function persistStore(state: Store) {
  const client = await getMongoClient();
  if (client) {
    await client.db(process.env.MONGODB_DB || "excelrs").collection<MongoStateDocument>("appState").updateOne({ _id: "main" }, { $set: { state }, $inc: { revision: 1 } }, { upsert: true });
    return;
  }
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    await mkdir(path.dirname(DATA_FILE), { recursive: true });
    const tempFile = `${DATA_FILE}.${randomUUID()}.tmp`;
    await writeFile(tempFile, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(tempFile, DATA_FILE);
  });
  await writeQueue;
  memoryStore = state;
}


export function recordAudit(state: Store, actorId: string, action: string, targetId: string, details: AuditEvent["details"] = {}) {
  const academyId = state.users.find((user) => user.id === actorId)?.academyId ?? "";
  state.auditEvents.push({ id: randomUUID(), academyId, actorId, action, targetId, details, createdAt: new Date().toISOString() });
  if (state.auditEvents.length > 5000) state.auditEvents.splice(0, state.auditEvents.length - 5000);
}

export async function mutateStore<T>(mutator: (state: Store) => T | Promise<T>): Promise<T> {
  const client = await getMongoClient();
  if (client) {
    const collection = client.db(process.env.MONGODB_DB || "excelrs").collection<MongoStateDocument>("appState");
    for (let attempt = 0; attempt < 8; attempt++) {
      await getStore();
      const document = await collection.findOne({ _id: "main" });
      if (!document) continue;
      const revision = typeof document.revision === "number" ? document.revision : 0;
      const draft = normalizeStore(document.state);
      const output = await mutator(draft);
      const updated = await collection.updateOne({ _id: "main", revision }, { $set: { state: draft }, $inc: { revision: 1 } });
      if (updated.matchedCount === 1) return output;
    }
    throw new Error("The academy changed during this save. Refresh the page and try again.");
  }
  let output!: T;
  const task = mutationQueue.then(async () => {
    const state = JSON.parse(JSON.stringify(await getStore())) as Store;
    output = await mutator(state);
    await persistStore(state);
  });
  mutationQueue = task.then(() => undefined, () => undefined);
  await task;
  return output;
}
