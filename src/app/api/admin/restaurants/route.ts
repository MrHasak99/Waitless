import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, recordAuditAction } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const Body = z.object({
  name: z.string().min(1).max(120),
  cuisine: z.string().max(60).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  address: z.string().min(1).max(200),
  area: z.string().max(60).nullable().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  phone: z.string().max(30).nullable().optional(),
  opens_at: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).default("12:00"),
  closes_at: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).default("23:00"),
  deposit_threshold: z.number().int().min(1).max(50).default(6),
  deposit_kwd: z.number().min(0).max(500).default(5),
  merge_fee_kwd: z.number().min(0).max(500).default(2),
  borrow_seat_fee_kwd: z.number().min(0).max(500).default(0.5),
});

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: guard.status });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("restaurants")
    .insert(parsed.data)
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await recordAuditAction(guard.user.id, "create_restaurant", data.id, {
    name: parsed.data.name,
  });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
