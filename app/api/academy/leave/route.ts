import { NextResponse } from "next/server";
import { clearLoginCookie, currentUser } from "../../../../lib/auth";
import { errorResponse } from "../../../../lib/http";
import { mutateStore, recordAudit } from "../../../../lib/store";

export async function POST() {
  try {
    const actor = await currentUser();
    if (!actor) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
    const result = await mutateStore((state) => {
      const user = state.users.find((entry) => entry.id === actor.id && entry.academyId === actor.academyId && entry.status === "active");
      if (!user) return { error: "This account is no longer active." };
      if (user.role === "coach") {
        const activeCoaches = state.users.filter((entry) => entry.academyId === user.academyId && entry.role === "coach" && entry.status === "active");
        if (activeCoaches.length <= 1) return { error: "The academy needs at least one active Coach. Approve another Coach before leaving." };
        if (user.isOwner) return { error: "Transfer academy ownership to another active Coach before leaving." };
      }
      user.status = "left";
      user.sessionVersion = (user.sessionVersion ?? 0) + 1;
      if (user.role === "player" && user.playerId) {
        const player = state.players.find((entry) => entry.academyId === user.academyId && entry.id === user.playerId);
        if (player) {
          player.active = false;
          for (const request of player.sportRequests ?? []) if (request.status === "pending") { request.status = "declined"; request.decidedAt = new Date().toISOString(); request.decidedBy = user.id; }
        }
      }
      recordAudit(state, user.id, "academy.member.left", user.id, { role: user.role, playerId: user.playerId ?? null });
      return { ok: true };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
    await clearLoginCookie();
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
