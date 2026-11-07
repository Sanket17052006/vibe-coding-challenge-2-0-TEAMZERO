import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { domainToASCII } from "node:url";
import type { Store } from "./types";
import type { OutgoingEmail } from "./smtp-email";

export function normalizeEmail(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 1 || at !== normalized.indexOf("@")) return normalized;
  let asciiDomain: string;
  try { asciiDomain = domainToASCII(normalized.slice(at + 1)); } catch { return normalized; }
  return asciiDomain ? `${normalized.slice(0, at)}@${asciiDomain.toLowerCase()}` : normalized;
}
export function validEmail(value: string) {
  const email = normalizeEmail(value);
  if (email.length > 254) return false;
  const at = email.lastIndexOf("@");
  if (at < 1 || at !== email.indexOf("@")) return false;
  const local = email.slice(0, at), rawDomain = email.slice(at + 1);
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i.test(local)) return false;
  let domain: string;
  try { domain = domainToASCII(rawDomain); } catch { return false; }
  if (!domain || domain.length > 253 || local.length + 1 + domain.length > 254 || !domain.includes(".")) return false;
  const labels = domain.split(".");
  if (labels.some((label) => label.length < 1 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) return false;
  return labels[labels.length - 1].length >= 2 && /[a-z]/i.test(labels[labels.length - 1]);
}
export const emailAllowsLogin = (user: { email?: string; emailVerifiedAt?: string }) => !user.email || !!user.emailVerifiedAt;
export function genericForgotPasswordResult() {
  return { status: 200, body: { message: "If an account with that verified email exists, a reset link will be sent." } } as const;
}
export async function waitForMinimumDuration(startedAt: number, minimumMs: number) {
  const remaining = minimumMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
function equalHash(a: string, b: string) { const left = Buffer.from(a, "hex"), right = Buffer.from(b, "hex"); return left.length === right.length && timingSafeEqual(left, right); }
export const hasDuplicateEmail = (users: Store["users"], email: string, exceptId?: string) => {
  const normalized = normalizeEmail(email);
  return users.some((user) => user.id !== exceptId && !!user.email && normalizeEmail(user.email) === normalized);
};
export function newToken() { const token = randomBytes(32).toString("base64url"); return { token, hash: tokenHash(token) }; }

export function consumeVerification(state: Store, token: string, now = Date.now()) {
  const hash = tokenHash(token);
  const row = (state.authTokens ?? []).find((entry) => entry.kind === "verify" && equalHash(entry.hash, hash) && !entry.usedAt);
  if (!row || Date.parse(row.expiresAt) <= now) return false;
  const user = state.users.find((entry) => entry.id === row.userId);
  if (!user) return false;
  row.usedAt = new Date(now).toISOString(); user.emailVerifiedAt = row.usedAt;
  if (user.role === "coach" && user.isOwner && user.status === "pending") user.status = "active";
  return true;
}

export function consumePasswordReset(state: Store, token: string, credentials: { hash: string; salt: string }, now = Date.now()) {
  const hash = tokenHash(token);
  const row = (state.authTokens ?? []).find((entry) => entry.kind === "reset" && equalHash(entry.hash, hash) && !entry.usedAt && Date.parse(entry.expiresAt) > now);
  if (!row) return false;
  const user = state.users.find((entry) => entry.id === row.userId && !!entry.emailVerifiedAt);
  if (!user) return false;
  row.usedAt = new Date(now).toISOString(); user.passwordHash = credentials.hash; user.passwordSalt = credentials.salt; user.sessionVersion = (user.sessionVersion ?? 0) + 1;
  return true;
}

export function createAuthEmailSender(deliver: ((email: OutgoingEmail) => Promise<void>) | undefined = undefined, env: Record<string, string | undefined> = process.env, buildLink?: (kind: "verify" | "reset", baseUrl: string, token: string) => string) {
  return async function sendAuthEmail(kind: "verify" | "reset", email: string, token: string) {
  const base = env.APP_URL?.replace(/\/$/, "");
  if (base) {
    let parsed: URL;
    try { parsed = new URL(base); } catch { throw new Error("APP_URL must be an absolute HTTPS URL in production."); }
    if (parsed.protocol !== "https:" && env.NODE_ENV === "production") throw new Error("APP_URL must use HTTPS in production.");
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("APP_URL must be the canonical application origin without a path or query.");
    if (env.NODE_ENV === "production" && /localhost|127\.0\.0\.1|\[::1\]/i.test(parsed.hostname)) throw new Error("APP_URL cannot point to localhost in production.");
  }
  if (!base) throw new Error("Email delivery is not configured. Set APP_URL, then request a new email.");
  const emailActionLink = buildLink ?? (await import("./email-link")).emailActionLink;
  const link = emailActionLink(kind, base, token);
  const title = kind === "verify" ? "Verify your KhelGrid email" : "Reset your KhelGrid password";
  const expiry = kind === "verify" ? "24 hours" : "30 minutes";
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#18221a"><h1 style="color:#23351f">KHELGRID</h1><h2>${title}</h2><p>Use the secure button below. This link expires in ${expiry}.</p><p><a style="display:inline-block;background:#d4ff32;color:#18221a;padding:14px 22px;text-decoration:none;font-weight:bold" href="${link}">${kind === "verify" ? "Verify email" : "Choose a new password"}</a></p><p>If you did not request this, you can ignore this email.</p></div>`;
  const delivery = deliver ?? (await import("./smtp-email")).sendSmtpEmail;
  await delivery({ to: email, subject: title, html });
  };
}

export const sendAuthEmail = createAuthEmailSender();

export async function issueToken(userId: string, kind: "verify" | "reset", expiryMs: number) {
  const { mutateStore } = await import("./store");
  const issued = newToken();
  await mutateStore((state) => {
    const now = Date.now();
    state.authTokens = (state.authTokens ?? []).filter((entry) => !entry.usedAt && Date.parse(entry.expiresAt) > now && !(entry.userId === userId && entry.kind === kind));
    state.authTokens!.push({ userId, kind, hash: issued.hash, expiresAt: new Date(Date.now() + expiryMs).toISOString() });
  });
  return issued.token;
}
