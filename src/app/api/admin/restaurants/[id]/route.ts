import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, recordAuditAction } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const Patch = z.object({
  deleted: z.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
  cuisine: z.string().max(60).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  address: z.string().min(1).max(200).optional(),
  area: z.string().max(60).nullable().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  phone: z.string().max(30).nullable().optional(),
  opens_at: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  closes_at: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  deposit_threshold: z.number().int().min(1).max(50).optional(),
  deposit_kwd: z.number().min(0).max(500).optional(),
  merge_fee_kwd: z.number().min(0).max(500).optional(),
  borrow_seat_fee_kwd: z.number().min(0).max(500).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: guard.status });
  }
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { deleted, ...rest } = parsed.data;
  const update: Record<string, unknown> = { ...rest };
  if (deleted !== undefined) {
    update.deleted_at = deleted ? new Date().toISOString() : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("restaurants")
    .update(update)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const action =
    deleted === true
      ? "hide_restaurant"
      : deleted === false
        ? "restore_restaurant"
        : "update_restaurant";
  await recordAuditAction(guard.user.id, action, id, rest);
  return NextResponse.json({ ok: true });
}
