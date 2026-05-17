import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, recordAuditAction } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const Create = z.object({
  label: z.string().min(1).max(20),
  seats: z.number().int().min(2).max(50),
  x: z.number().int().min(0).default(0),
  y: z.number().int().min(0).default(0),
  is_mergeable: z.boolean().default(false),
  can_lend_seats: z.boolean().default(false),
  max_lendable_seats: z.number().int().min(0).max(20).default(0),
  adjacent_table_ids: z.array(z.string().uuid()).default([]),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: guard.status });
  }
  const { id } = await ctx.params;
  const parsed = Create.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  // A lender can't lend more than it has minus the 2-seat floor.
  if (
    parsed.data.can_lend_seats &&
    parsed.data.max_lendable_seats > parsed.data.seats - 2
  ) {
    return NextResponse.json(
      {
        error: `Max lendable seats can't exceed ${parsed.data.seats - 2} (table must keep 2 seats minimum).`,
      },
      { status: 400 },
    );
  }

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("restaurant_tables")
    .insert({ restaurant_id: id, ...parsed.data })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await recordAuditAction(guard.user.id, "create_table", data.id, {
    restaurant_id: id,
    ...parsed.data,
  });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
