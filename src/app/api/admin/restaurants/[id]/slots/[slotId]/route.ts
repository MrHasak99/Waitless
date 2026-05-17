import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, recordAuditAction } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

// Capacity is auto-managed by a trigger; admins can only change times.
const Patch = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; slotId: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: guard.status });
  }
  const { slotId } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.startTime) update.start_time = parsed.data.startTime;
  if (parsed.data.endTime) update.end_time = parsed.data.endTime;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("time_slots")
    .update(update)
    .eq("id", slotId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await recordAuditAction(guard.user.id, "update_slot", slotId, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; slotId: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: guard.status });
  }
  const { slotId } = await ctx.params;
  const service = createSupabaseServiceClient();

  const { count } = await service
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("slot_id", slotId)
    .not("status", "in", "(cancelled,no_show,completed)");
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Slot has ${count} active booking(s). Cancel them before deleting.`,
      },
      { status: 409 },
    );
  }

  const { error } = await service
    .from("time_slots")
    .delete()
    .eq("id", slotId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await recordAuditAction(guard.user.id, "delete_slot", slotId);
  return NextResponse.json({ ok: true });
}
