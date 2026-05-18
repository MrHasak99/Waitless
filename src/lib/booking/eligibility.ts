import type { SupabaseClient } from "@supabase/supabase-js";
import { suggest, type SuggestionResult } from "./suggest";

// Loads the per-slot state and runs the suggestion engine. Same answer
// the diner sees in the SlotPicker, but callable from server contexts
// (cancel route, waitlist claim, scheduled jobs).
export async function suggestForSlot(
  client: SupabaseClient,
  slotId: string,
  partySize: number,
): Promise<SuggestionResult | { status: "slot_full" } | { status: "slot_missing" }> {
  const { data: slot } = await client
    .from("time_slots")
    .select("id, restaurant_id, capacity, booked_count")
    .eq("id", slotId)
    .single();
  if (!slot) return { status: "slot_missing" };
  if (slot.booked_count + partySize > slot.capacity) {
    return { status: "slot_full" };
  }

  const [{ data: restaurant }, { data: tables }, { data: merges }, { data: borrows }, { data: bookings }] =
    await Promise.all([
      client
        .from("restaurants")
        .select("merge_fee_kwd, borrow_seat_fee_kwd")
        .eq("id", slot.restaurant_id)
        .single(),
      client
        .from("restaurant_tables")
        .select(
          "id, label, seats, is_mergeable, can_lend_seats, max_lendable_seats, adjacent_table_ids",
        )
        .eq("restaurant_id", slot.restaurant_id),
      client
        .from("table_merges")
        .select("table_ids")
        .eq("slot_id", slotId),
      client
        .from("seat_borrows")
        .select("from_table_id, to_table_id")
        .eq("slot_id", slotId),
      client
        .from("bookings")
        .select("table_id")
        .eq("slot_id", slotId)
        .not("status", "in", "(cancelled,no_show,completed)"),
    ]);

  return suggest({
    tables: tables ?? [],
    existingMerges: (merges ?? []) as { table_ids: string[] }[],
    existingBorrows: borrows ?? [],
    existingBookings: bookings ?? [],
    partySize,
    mergeFee: Number(restaurant?.merge_fee_kwd ?? 0),
    borrowSeatFee: Number(restaurant?.borrow_seat_fee_kwd ?? 0),
  });
}
