import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth";
import { errorResponse } from "../../../../lib/http";
import { mutateStore, recordAudit } from "../../../../lib/store";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole("scout");
    const { id } = await params;
    const result = await mutateStore((state) => {
      const trial = state.trials.find((entry) => entry.academyId === actor.academyId && entry.id === id);
      if (!trial) return { error: "Trial call not found.", status: 404 };
      if (trial.scoutId !== actor.id) return { error: "You can only withdraw your own trial calls.", status: 403 };
      if (trial.status === "withdrawn") return { error: "This trial call is already withdrawn.", status: 409 };
      trial.status = "withdrawn";
      trial.withdrawnAt = new Date().toISOString();
      trial.updatedAt = trial.withdrawnAt;
      recordAudit(state, actor.id, "trial.withdrawn", trial.id, { playerId: trial.playerId, sport: trial.sport });
      return { trial };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
