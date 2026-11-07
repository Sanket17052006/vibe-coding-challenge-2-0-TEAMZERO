import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";

type RateBucket = { _id: string; count: number; expiresAt: Date };
const localBuckets = new Map<string, RateBucket>();
let ttlIndex: Promise<string> | null = null;

function rateLimitSecret() {
  const configured = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && (!configured || configured.length < 32 || configured.startsWith("replace-"))) {
    throw new Error("Set a unique SESSION_SECRET with at least 32 characters in production.");
  }
  return configured || "khelgrid-local-rate-limit";
}

export function identityRateLimitKey(scope: string, identity: string, secret = rateLimitSecret()) {
  return createHmac("sha256", secret).update(`${scope}:${identity}`).digest("hex");
}

function localLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  for (const [storedKey, bucket] of localBuckets) if (bucket.expiresAt.getTime() <= now) localBuckets.delete(storedKey);
  const bucket = localBuckets.get(key);
  if (!bucket || bucket.expiresAt.getTime() <= now) {
    const fresh = { _id: key, count: 1, expiresAt: new Date(now + windowMs) };
    localBuckets.set(key, fresh);
    return null;
  }
  bucket.count += 1;
  return bucket.count <= limit ? null : limitedResponse(bucket.expiresAt);
}

function limitedResponse(expiresAt: Date) {
  const retryAfter = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
  return Response.json(
    { error: "Too many requests. Wait a little and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
  );
}

async function rateLimitKey(key: string, limit: number, windowMs: number) {
  if (process.env.NODE_ENV !== "production") return localLimit(key, limit, windowMs);
  if (!process.env.MONGODB_URI) throw new Error("MongoDB is required for rate limiting in production.");
  const { getMongoDatabase } = await import("./store");
  const database = await getMongoDatabase();
  const buckets = database.collection<RateBucket>("rateLimits");
  if (!ttlIndex) ttlIndex = buckets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch((error) => { ttlIndex = null; throw error; });
  await ttlIndex;

  const now = new Date();
  const expiry = new Date(now.getTime() + windowMs);
  let bucket: RateBucket | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      bucket = await buckets.findOneAndUpdate(
        { _id: key },
        [{ $set: {
          count: { $cond: [{ $gt: ["$expiresAt", now] }, { $add: [{ $ifNull: ["$count", 0] }, 1] }, 1] },
          expiresAt: { $cond: [{ $gt: ["$expiresAt", now] }, "$expiresAt", expiry] },
        } }],
        { upsert: true, returnDocument: "after" },
      );
      break;
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000) || attempt === 2) throw error;
    }
  }
  if (!bucket) throw new Error("Rate limit counter could not be updated.");
  return bucket.count <= limit ? null : limitedResponse(bucket.expiresAt);
}

export async function rateLimit(request: NextRequest, scope: string, identity: string, limit: number, windowMs: number) {
  const clientIp = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return rateLimitKey(identityRateLimitKey(scope, `${clientIp}:${identity}`), limit, windowMs);
}

/** Apply a shared limit to an identity independently of the caller's IP address. */
export async function rateLimitByIdentity(_request: NextRequest, scope: string, identity: string, limit: number, windowMs: number) {
  return rateLimitKey(identityRateLimitKey(scope, identity), limit, windowMs);
}
