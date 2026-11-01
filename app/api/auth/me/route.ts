import { NextResponse } from "next/server";
import { currentUser, publicUser } from "../../../../lib/auth";
import { errorResponse } from "../../../../lib/http";
export async function GET() { try { const user = await currentUser(); return user ? NextResponse.json({ user: publicUser(user) }) : NextResponse.json({ user: null }, { status: 401 }); } catch (error) { return errorResponse(error); } }
