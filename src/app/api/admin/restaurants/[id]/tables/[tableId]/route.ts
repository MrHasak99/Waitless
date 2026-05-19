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
  const { data: current } = await service
    .from("restaurant_tables")
    .select(
      "id, seats, can_lend_seats, max_lendable_seats, adjacent_table_ids",
    )
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

  // Mirror adjacency edits on the neighbor side so the admin only needs to
  // mark adjacency once. The engine requires bidirectional links to merge.
  if (parsed.data.adjacent_table_ids !== undefined) {
    const before = new Set<string>(current.adjacent_table_ids ?? []);
    const after = new Set<string>(parsed.data.adjacent_table_ids);
    const added = [...after].filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !after.has(id));

    if (added.length > 0 || removed.length > 0) {
      const touched = [...new Set([...added, ...removed])];
      const { data: neighbors } = await service
        .from("restaurant_tables")
        .select("id, adjacent_table_ids")
        .in("id", touched);
      for (const n of neighbors ?? []) {
        const adj = new Set<string>(n.adjacent_table_ids ?? []);
        if (added.includes(n.id)) adj.add(tableId);
        if (removed.includes(n.id)) adj.delete(tableId);
        await service
          .from("restaurant_tables")
          .update({ adjacent_table_ids: Array.from(adj) })
          .eq("id", n.id);
      }
    }
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
