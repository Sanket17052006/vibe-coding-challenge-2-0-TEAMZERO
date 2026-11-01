import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth";
import { badRequest, errorResponse, readJsonBody } from "../../../../lib/http";
import { mutateStore, recordAudit } from "../../../../lib/store";

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireRole("coach");
    const body = await readJsonBody(request);
    if (!body || typeof body.userId !== "string") return badRequest("Choose an active Coach to receive ownership.");
    const result = await mutateStore((state) => {
      const currentOwner = state.users.find((entry) => entry.id === actor.id && entry.academyId === actor.academyId && entry.role === "coach" && entry.status === "active" && entry.isOwner);
      if (!currentOwner) return { error: "Only the active academy owner can transfer ownership." };
      const nextOwner = state.users.find((entry) => entry.id === body.userId && entry.academyId === actor.academyId && entry.role === "coach" && entry.status === "active");
      if (!nextOwner || nextOwner.id === currentOwner.id) return { error: "Choose a different active Coach in this academy." };
      currentOwner.isOwner = false;
      nextOwner.isOwner = true;
      recordAudit(state, currentOwner.id, "academy.owner.transferred", nextOwner.id, {});
      return { ok: true, owner: { id: nextOwner.id, displayName: nextOwner.displayName } };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
