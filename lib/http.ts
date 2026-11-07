import { NextRequest, NextResponse } from "next/server";
import { authStatus } from "./auth";
const MAX_JSON_BYTES = 32 * 1024;

export function isSameOrigin(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.origin === requestUrl.origin) return true;
      // Local preview proxies can normalize localhost to 127.0.0.1 (or vice versa),
      // including when the local preview runs with NODE_ENV=production.
      const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
      const sameLocalPreview = originUrl.protocol === requestUrl.protocol
        && originUrl.port === requestUrl.port
        && loopback.has(originUrl.hostname)
        && loopback.has(requestUrl.hostname);
      return sameLocalPreview;
    } catch { return false; }
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

export async function readJsonBody(request: NextRequest): Promise<Record<string, any> | null> {
  if (!isSameOrigin(request)) return null;
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_JSON_BYTES || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } catch { return null; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, any> : null;
  } catch { return null; }
}

export function errorResponse(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const messageText = error instanceof Error ? error.message : "";
  const isDatabaseError = name.startsWith("Mongo") || name.includes("MongoDB");
  const isAcademySetupError = /^(Multiple academy records|Academy-scoped records|Configured academy identity|ACADEMY_ID|Configure ACADEMY_)/.test(messageText);
  const status = isDatabaseError || isAcademySetupError ? 503 : authStatus(error);
  const message = isDatabaseError
    ? "The academy database is unavailable. Check MongoDB Atlas status, the app server’s Network Access IP allowlist, and its connection settings."
    : isAcademySetupError
      ? "Single academy setup needs configuration or a reviewed data migration before this operation can continue."
    : status === 500 ? "The server could not complete this request. Check the database connection and try again." : status === 401 ? "Please log in to continue." : "You do not have permission to do that.";
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
export function badRequest(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }
