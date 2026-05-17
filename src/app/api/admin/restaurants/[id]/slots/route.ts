import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, recordAuditAction } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

// Capacity is now auto-derived from the sum of restaurant_tables.seats via
// a Postgres trigger. Admins only choose the time windows.
//
// Two modes:
//   { startTime, endTime }                                       → create one slot
//   { batch: { fromDate, toDate, hours:[18,19], durationMinutes }} → create many
const Body = z.union([
  z.object({
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
  }),
  z.object({
    batch: z.object({
      fromDate: z.string(),
      toDate: z.string(),
      hours: z.array(z.number().int().min(0).max(23)).min(1).max(24),
      durationMinutes: z.number().int().min(15).max(360).default(90),
    }),
  }),
]);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: guard.status });
  }
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const service = createSupabaseServiceClient();

  if ("batch" in parsed.data) {
    const { fromDate, toDate, hours, durationMinutes } = parsed.data.batch;
    const rows: Array<{
      restaurant_id: string;
      start_time: string;
      end_time: string;
      capacity: number;
    }> = [];
    const start = new Date(`${fromDate}T00:00:00Z`);
    const end = new Date(`${toDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }
    if (end < start) {
      return NextResponse.json({ error: "toDate before fromDate" }, { status: 400 });
    }
    for (
      let d = new Date(start);
      d <= end;
      d = new Date(d.getTime() + 24 * 3600 * 1000)
    ) {
      for (const h of hours) {
        const startTime = new Date(d);
        startTime.setUTCHours(h, 0, 0, 0);
        const endTime = new Date(
          startTime.getTime() + durationMinutes * 60 * 1000,
        );
        rows.push({
          restaurant_id: id,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          // Placeholder — the BEFORE INSERT trigger overrides with the sum
          // of restaurant_tables.seats. Required because the column is NOT NULL.
          capacity: 1,
        });
      }
    }
    const { error } = await service
      .from("time_slots")
      .upsert(rows, { onConflict: "restaurant_id,start_time", ignoreDuplicates: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    await recordAuditAction(guard.user.id, "batch_create_slots", id, {
      count: rows.length,
      ...parsed.data.batch,
    });
    return NextResponse.json({ created: rows.length }, { status: 201 });
  }

  const { startTime, endTime } = parsed.data;
  const { data, error } = await service
    .from("time_slots")
    .insert({
      restaurant_id: id,
      start_time: startTime,
      end_time: endTime,
      capacity: 1, // trigger overrides
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await recordAuditAction(guard.user.id, "create_slot", data.id, {
    restaurant_id: id,
    startTime,
    endTime,
  });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
