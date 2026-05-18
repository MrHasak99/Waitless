import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { aiVerdict, type CapacitySignal } from "@/lib/ai/capacity";
import { sendBookingConfirmation } from "@/lib/email/send";

const MergeArrangement = z.object({
  kind: z.literal("merge"),
  tableIds: z.array(z.string().uuid()).min(2).max(8),
  fee: z.number().min(0),
});

const BorrowArrangement = z.object({
  kind: z.literal("borrow"),
  toTableId: z.string().uuid(),
  fromTableId: z.string().uuid(),
  seats: z.number().int().min(1).max(20),
  fee: z.number().min(0),
});

const Body = z.object({
  slotId: z.string().uuid(),
  partySize: z.number().int().min(1).max(20),
  tableId: z.string().uuid().nullable().optional(),
  arrangement: z
    .union([MergeArrangement, BorrowArrangement])
    .nullable()
    .optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
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

  // Route through the appropriate atomic RPC.
  let bookingId: string | null = null;
  let bookingError: { message: string } | null = null;
  const arrangement = parsed.data.arrangement ?? null;

  if (arrangement?.kind === "merge") {
    const { data, error } = await supabase.rpc("book_with_merge", {
      p_slot_id: parsed.data.slotId,
      p_party_size: parsed.data.partySize,
      p_table_ids: arrangement.tableIds,
      p_fee_kwd: arrangement.fee,
    });
    bookingId = data ?? null;
    bookingError = error;
  } else if (arrangement?.kind === "borrow") {
    const { data, error } = await supabase.rpc("book_with_borrow", {
      p_slot_id: parsed.data.slotId,
      p_party_size: parsed.data.partySize,
      p_to_table_id: arrangement.toTableId,
      p_from_table_id: arrangement.fromTableId,
      p_seats: arrangement.seats,
      p_fee_kwd: arrangement.fee,
    });
    bookingId = data ?? null;
    bookingError = error;
  } else {
    const { data, error } = await supabase.rpc("book_slot", {
      p_slot_id: parsed.data.slotId,
      p_party_size: parsed.data.partySize,
      p_table_id: parsed.data.tableId ?? null,
    });
    bookingId = data ?? null;
    bookingError = error;
  }

  if (bookingError || !bookingId) {
    const msg = bookingError?.message ?? "Booking failed";
    const friendly = msg.includes("SLOT_FULL")
      ? "This slot just filled up — please pick another."
      : msg.includes("SLOT_NOT_FOUND")
        ? "Slot no longer available."
        : msg.includes("NO_TABLE_AVAILABLE")
          ? "No physical table at this restaurant fits your party right now. Try a merge/borrow suggestion, or pick a different time."
          : msg.includes("TABLE_ALREADY_MERGED") ||
              msg.includes("TABLE_IN_BORROW")
            ? "Another diner grabbed those tables just now — pick a different arrangement."
            : msg.includes("MERGE_TOO_SMALL") ||
                msg.includes("BORROW_TOO_SMALL")
              ? "That arrangement doesn't fit your party."
              : msg;
    return NextResponse.json({ error: friendly }, { status: 409 });
  }

  // Service-role tasks: risk scoring + notifications + email.
  const service = createSupabaseServiceClient();
  const [{ data: profile }, { data: slot }] = await Promise.all([
    service
      .from("profiles")
      .select("no_show_count, total_bookings, email, full_name")
      .eq("id", user.id)
      .single(),
    service
      .from("time_slots")
      .select("id, restaurant_id, start_time, end_time, capacity, booked_count")
      .eq("id", parsed.data.slotId)
      .single(),
  ]);

  if (slot) {
    const startHour = new Date(slot.start_time).getUTCHours();
    const signal: CapacitySignal = {
      occupancyRatio: slot.booked_count / Math.max(1, slot.capacity),
      partySize: parsed.data.partySize,
      noShowCount: profile?.no_show_count ?? 0,
      totalBookings: profile?.total_bookings ?? 0,
      isPeakSlot: startHour >= 19 && startHour <= 21,
    };
    const verdict = await aiVerdict(signal);

    await service
      .from("bookings")
      .update({ risk_score: verdict.riskScore })
      .eq("id", bookingId);

    await service.from("notifications").insert({
      user_id: user.id,
      title: "Booking confirmed",
      message: `${parsed.data.partySize} guests · ${new Date(
        slot.start_time,
      ).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`,
      href: `/bookings/${bookingId}`,
    });

    if (profile?.email) {
      void sendBookingConfirmation({
        to: profile.email,
        name: profile.full_name ?? "there",
        startTime: slot.start_time,
        partySize: parsed.data.partySize,
        bookingId,
      });
    }
  }

  return NextResponse.json({ bookingId }, { status: 201 });
}
