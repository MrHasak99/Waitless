import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { suggest } from "@/lib/booking/suggest";

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
    .select("id, restaurant_id, capacity, booked_count")
    .eq("id", parsed.data.slotId)
    .single();
  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }
  if (slot.booked_count + parsed.data.partySize > slot.capacity) {
    return NextResponse.json({ status: "slot_full" });
  }

  const [{ data: restaurant }, { data: tables }, { data: merges }, { data: borrows }] =
    await Promise.all([
      supabase
        .from("restaurants")
        .select("merge_fee_kwd, borrow_seat_fee_kwd")
        .eq("id", slot.restaurant_id)
        .single(),
      supabase
        .from("restaurant_tables")
        .select(
          "id, label, seats, is_mergeable, can_lend_seats, max_lendable_seats, adjacent_table_ids",
        )
        .eq("restaurant_id", slot.restaurant_id),
      supabase
        .from("table_merges")
        .select("table_ids")
        .eq("slot_id", parsed.data.slotId),
      supabase
        .from("seat_borrows")
        .select("from_table_id, to_table_id")
        .eq("slot_id", parsed.data.slotId),
    ]);

  const result = suggest({
    tables: tables ?? [],
    existingMerges: (merges ?? []) as { table_ids: string[] }[],
    existingBorrows: borrows ?? [],
    partySize: parsed.data.partySize,
    mergeFee: Number(restaurant?.merge_fee_kwd ?? 0),
    borrowSeatFee: Number(restaurant?.borrow_seat_fee_kwd ?? 0),
  });

  return NextResponse.json(result);
}
