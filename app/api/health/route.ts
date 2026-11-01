import { NextResponse } from "next/server";
import { getMongoDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!process.env.MONGODB_URI) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ ok: false }, { status: 503, headers });
    return NextResponse.json({ ok: true, storage: "local-development" }, { headers });
  }
  try {
    await (await getMongoDatabase()).command({ ping: 1 });
    return NextResponse.json({ ok: true, storage: "mongodb" }, { headers });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
