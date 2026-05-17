import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, recordAuditAction } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const Patch = z.object({
  label: z.string().min(1).max(20).optional(),
  seats: z.number().int().min(2).max(50).optional(),
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
  is_mergeable: z.boolean().optional(),
  can_lend_seats: z.boolean().optional(),
  max_lendable_seats: z.number().int().min(0).max(20).optional(),
  adjacent_table_ids: z.array(z.string().uuid()).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; tableId: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: guard.status });
  }
  const { tableId } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const service = createSupabaseServiceClient();

  // Cross-field check: max_lendable_seats vs seats and the 2-seat floor.
  // Need the resulting state, so merge with the current row.
  const { data: current } = await service
    .from("restaurant_tables")
    .select("seats, can_lend_seats, max_lendable_seats")
    .eq("id", tableId)
    .single();
  if (!current) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }
  const merged = { ...current, ...parsed.data };
  if (
    merged.can_lend_seats &&
    merged.max_lendable_seats > merged.seats - 2
  ) {
    return NextResponse.json(
      {
        error: `Max lendable seats can't exceed ${merged.seats - 2} (table must keep 2 seats minimum).`,
      },
      { status: 400 },
    );
  }

  const { error } = await service
    .from("restaurant_tables")
    .update(parsed.data)
    .eq("id", tableId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await recordAuditAction(guard.user.id, "update_table", tableId, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; tableId: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: guard.status });
  }
  const { tableId } = await ctx.params;
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("restaurant_tables")
    .delete()
    .eq("id", tableId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await recordAuditAction(guard.user.id, "delete_table", tableId);
  return NextResponse.json({ ok: true });
}
