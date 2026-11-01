import { NextRequest, NextResponse } from "next/server";
import { clearLoginCookie } from "../../../../lib/auth";
import { isSameOrigin } from "../../../../lib/http";
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  await clearLoginCookie();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
