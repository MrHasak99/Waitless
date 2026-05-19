import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { sendBookingReminder } from "@/lib/email/send";

// Runs hourly via vercel.json. Sends a reminder for bookings starting in the
// next 23-25 hours that haven't received one yet.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (
    secret &&
    req.headers.get("authorization") !== `Bearer ${secret}` &&
    req.headers.get("x-cron-secret") !== secret
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createSupabaseServiceClient();
  // Runs once daily on Hobby plan. Widen the window to 12–36h so every
  // booking gets one reminder somewhere in that ~24h band.
  const windowStart = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
  const windowEnd = new Date(Date.now() + 36 * 3600 * 1000).toISOString();

  const { data: due } = await service
    .from("bookings")
    .select(
      "id, user_id, reminder_sent_at, status, profiles!user_id(email, full_name), time_slots!slot_id(start_time)",
    )
    .in("status", ["confirmed", "pending_deposit"])
    .is("reminder_sent_at", null)
    .limit(500);

  const rows = (due ?? []) as unknown as Array<{
    id: string;
    user_id: string;
    profiles: { email: string; full_name: string | null } | null;
    time_slots: { start_time: string } | null;
  }>;

  let sent = 0;
  for (const b of rows) {
    const start = b.time_slots?.start_time;
    if (!start) continue;
    if (start < windowStart || start > windowEnd) continue;
    if (!b.profiles?.email) continue;

    await sendBookingReminder({
      to: b.profiles.email,
      name: b.profiles.full_name ?? "there",
      startTime: start,
      bookingId: b.id,
    });
    await service.from("notifications").insert({
      user_id: b.user_id,
      title: "Reminder: booking tomorrow",
      message: new Date(start).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      href: `/bookings/${b.id}`,
    });
    await service
      .from("bookings")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", b.id);
    sent++;
  }

  return NextResponse.json({ ok: true, sent });
}
