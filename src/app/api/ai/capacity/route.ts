import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { aiVerdict, type CapacitySignal } from "@/lib/ai/capacity";

const Body = z.object({
  slotId: z.string().uuid(),
  partySize: z.number().int().min(1).max(20),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: slot } = await supabase
    .from("time_slots")
    .select("id, start_time, capacity, booked_count")
    .eq("id", parsed.data.slotId)
    .single();
  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("no_show_count, total_bookings")
    .eq("id", user.id)
    .single();

  const startHour = new Date(slot.start_time).getUTCHours();
  const signal: CapacitySignal = {
    occupancyRatio: slot.booked_count / Math.max(1, slot.capacity),
    partySize: parsed.data.partySize,
    noShowCount: profile?.no_show_count ?? 0,
    totalBookings: profile?.total_bookings ?? 0,
    isPeakSlot: startHour >= 19 && startHour <= 21,
  };

  const verdict = await aiVerdict(signal);
  return NextResponse.json(verdict);
}
