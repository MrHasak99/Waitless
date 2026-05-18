import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { sendBookingConfirmation } from "@/lib/email/send";
import { suggestForSlot } from "@/lib/booking/eligibility";

// Claim the seat that opened up. Tries a free single-table booking first;
// if no single table fits, falls back to the cheapest valid arrangement
// (merge or borrow) from the suggestion engine, charging that fee.
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

  const service = createSupabaseServiceClient();
  const { data: entry } = await service
    .from("waitlist_entries")
    .select("id, slot_id, party_size, user_id, notified_at, expires_at")
    .eq("id", id)
    .single();
  if (!entry || entry.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!entry.notified_at) {
    return NextResponse.json(
      { error: "You haven't been notified of an open seat yet." },
      { status: 409 },
    );
  }
  if (entry.expires_at && new Date(entry.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "Your 24h claim window expired." },
      { status: 410 },
    );
  }

  // 1. Try the free single-table path first.
  let bookingId: string | null = null;
  let appliedFee = 0;
  let arrangementKind: "single" | "merge" | "borrow" = "single";

  {
    const { data, error } = await supabase.rpc("book_slot", {
      p_slot_id: entry.slot_id,
      p_party_size: entry.party_size,
    });
    if (data) {
      bookingId = data;
    } else if (error && !error.message.includes("NO_TABLE_AVAILABLE")) {
      // SLOT_FULL or other terminal failure — bail.
      const friendly = error.message.includes("SLOT_FULL")
        ? "The slot just filled up again. Try a different time."
        : error.message;
      return NextResponse.json({ error: friendly }, { status: 409 });
    }
  }

  // 2. Fall back to the cheapest valid arrangement.
  if (!bookingId) {
    const result = await suggestForSlot(supabase, entry.slot_id, entry.party_size);
    if (result.status === "options" && result.suggestions.length > 0) {
      const cheapest = result.suggestions.reduce((a, b) =>
        a.fee <= b.fee ? a : b,
      );
      if (cheapest.kind === "merge") {
        const { data, error } = await supabase.rpc("book_with_merge", {
          p_slot_id: entry.slot_id,
          p_party_size: entry.party_size,
          p_table_ids: cheapest.tableIds,
          p_fee_kwd: cheapest.fee,
        });
        if (error || !data) {
          return NextResponse.json(
            { error: error?.message ?? "Could not book the merge." },
            { status: 409 },
          );
        }
        bookingId = data;
        appliedFee = cheapest.fee;
        arrangementKind = "merge";
      } else {
        const { data, error } = await supabase.rpc("book_with_borrow", {
          p_slot_id: entry.slot_id,
          p_party_size: entry.party_size,
          p_to_table_id: cheapest.toTableId,
          p_from_table_id: cheapest.fromTableId,
          p_seats: cheapest.seats,
          p_fee_kwd: cheapest.fee,
        });
        if (error || !data) {
          return NextResponse.json(
            { error: error?.message ?? "Could not book the borrow." },
            { status: 409 },
          );
        }
        bookingId = data;
        appliedFee = cheapest.fee;
        arrangementKind = "borrow";
      }
    } else {
      return NextResponse.json(
        {
          error:
            "The seat is gone — no physical table fits your party now. Try a different slot.",
        },
        { status: 409 },
      );
    }
  }

  // Defensive: every successful branch above sets bookingId; every failure
  // returns early. This narrows the type for the rest of the handler.
  if (!bookingId) {
    return NextResponse.json({ error: "Booking failed" }, { status: 500 });
  }
  const confirmedId: string = bookingId;

  // Drop the waitlist entry.
  await service.from("waitlist_entries").delete().eq("id", id);

  // Confirmation notification + email.
  const { data: slot } = await service
    .from("time_slots")
    .select("start_time")
    .eq("id", entry.slot_id)
    .single();
  if (slot) {
    const feeNote =
      arrangementKind === "single"
        ? ""
        : ` A ${appliedFee.toFixed(3)} KWD service fee will be due at the venue.`;
    await service.from("notifications").insert({
      user_id: user.id,
      title: "Waitlist seat claimed",
      message: `Your booking is confirmed for ${new Date(
        slot.start_time,
      ).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.${feeNote}`,
      href: `/bookings/${confirmedId}`,
    });

    const { data: profile } = await service
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .single();
    if (profile?.email) {
      void sendBookingConfirmation({
        to: profile.email,
        name: profile.full_name ?? "there",
        startTime: slot.start_time,
        partySize: entry.party_size,
        bookingId: confirmedId,
      });
    }
  }

  return NextResponse.json({
    bookingId: confirmedId,
    fee: appliedFee,
    arrangementKind,
  });
}
