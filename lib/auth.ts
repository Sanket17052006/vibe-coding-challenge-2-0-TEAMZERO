import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { getStore } from "./store";
import { PublicUser, User } from "./types";
import { canViewerManageSport } from "./match-access";
import { emailAllowsLogin } from "./email-auth";

const COOKIE_NAME = "excelrs_session";
const scrypt = promisify(scryptCallback);
function secret() {
  const configured = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && (!configured || configured.length < 32 || configured.startsWith("replace-"))) throw new Error("Set a unique SESSION_SECRET with at least 32 characters in production.");
  return configured || "khelgrid-local-dev-session-secret-change-before-deploy";
}
function signature(value: string) { return createHmac("sha256", secret()).update(value).digest("base64url"); }
function safeEqual(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function publicUser(user: User): PublicUser { const { id, username, displayName, role, status, playerId, coachSports, isOwner } = user; return { id, username, displayName, role, status, playerId, coachSports, isOwner }; }
export function canManageSport(user: User, sport: string) { return canViewerManageSport(user, sport); }
export async function verifyPassword(password: string, salt: string, expected: string) {
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return safeEqual(actual.toString("hex"), expected);
}
export async function setLoginCookie(user: User) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, version: user.sessionVersion ?? 0, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 })).toString("base64url");
  const value = `${payload}.${signature(payload)}`;
  const jar = await cookies();
  jar.set(COOKIE_NAME, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 14 });
}
export async function clearLoginCookie() { const jar = await cookies(); jar.delete(COOKIE_NAME); }
export async function currentUser(): Promise<User | null> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac || !safeEqual(mac, signature(payload))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { id: string; version?: number; exp: number };
    if (decoded.exp < Date.now()) return null;
    const user = (await getStore()).users.find((entry) => entry.id === decoded.id && entry.status === "active" && emailAllowsLogin(entry) && (entry.sessionVersion ?? 0) === (decoded.version ?? 0));
    return user ?? null;
  } catch { return null; }
}
export async function requireRole(...roles: User["role"][]) {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!roles.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}
export function authStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHENTICATED") return 401;
  if (message === "FORBIDDEN") return 403;
  return 500;
}
