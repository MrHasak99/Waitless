import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

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

  // Notify the first waitlisted user (if any) using the service role.
  const service = createSupabaseServiceClient();
  const { data: booking } = await service
    .from("bookings")
    .select("slot_id")
    .eq("id", id)
    .single();
  if (booking) {
    const { data: next } = await service
      .from("waitlist_entries")
      .select("id, user_id")
      .eq("slot_id", booking.slot_id)
      .is("notified_at", null)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (next) {
      await service
        .from("waitlist_entries")
        .update({
          notified_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        })
        .eq("id", next.id);
      await service.from("notifications").insert({
        user_id: next.user_id,
        title: "A waitlist seat opened",
        message: "Confirm within 24 hours to claim it.",
        href: `/bookings`,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
