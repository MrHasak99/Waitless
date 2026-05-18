import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { suggestForSlot } from "@/lib/booking/eligibility";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Notify the first waitlist entry whose party can actually fit with what
  // just freed up — checked via the same suggestion engine the diner uses.
  const service = createSupabaseServiceClient();
  const { data: booking } = await service
    .from("bookings")
    .select("slot_id")
    .eq("id", id)
    .single();
  if (booking) {
    const { data: waiters } = await service
      .from("waitlist_entries")
      .select("id, user_id, party_size, position")
      .eq("slot_id", booking.slot_id)
      .is("notified_at", null)
      .order("position");

    for (const w of waiters ?? []) {
      const result = await suggestForSlot(service, booking.slot_id, w.party_size);
      const canFit =
        result.status === "single_table_ok" || result.status === "options";
      if (!canFit) continue;

      const feeNote =
        result.status === "options" && result.suggestions[0]
          ? ` A ${result.suggestions[0].fee.toFixed(3)} KWD service fee may apply.`
          : "";

      await service
        .from("waitlist_entries")
        .update({
          notified_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        })
        .eq("id", w.id);
      await service.from("notifications").insert({
        user_id: w.user_id,
        title: "A waitlist seat opened",
        message: `Confirm within 24 hours to claim it.${feeNote}`,
        href: `/bookings`,
      });
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
