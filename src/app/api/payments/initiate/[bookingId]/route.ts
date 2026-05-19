import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { sendPayment } from "@/lib/payments/myfatoorah";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, user_id, status, deposit_required, arrangement_fee_kwd, paid_at, restaurants(deposit_kwd, name)",
    )
    .eq("id", bookingId)
    .single();
  if (!booking || booking.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (booking.paid_at) {
    return NextResponse.json({ error: "Already paid" }, { status: 409 });
  }

  const restaurant = (
    booking as unknown as { restaurants: { deposit_kwd: number; name: string } }
  ).restaurants;

  const depositAmount = booking.deposit_required
    ? Number(restaurant.deposit_kwd)
    : 0;
  const feeAmount = Number(booking.arrangement_fee_kwd ?? 0);
  const total = depositAmount + feeAmount;
  if (total <= 0) {
    return NextResponse.json(
      { error: "Nothing to pay for this booking." },
      { status: 400 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, phone")
    .eq("id", user.id)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const result = await sendPayment({
    invoiceValueKwd: total,
    customerName: profile?.full_name || profile?.email || "Diner",
    customerEmail: profile?.email ?? user.email ?? "diner@waitless.kw",
    customerMobile: profile?.phone ?? undefined,
    callbackUrl: `${appUrl}/api/payments/callback?bookingId=${bookingId}`,
    errorUrl: `${appUrl}/api/payments/callback?bookingId=${bookingId}&error=1`,
    customerReference: bookingId,
    userDefinedField: bookingId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Stash the invoice id on the booking for later reconciliation.
  const service = createSupabaseServiceClient();
  await service
    .from("bookings")
    .update({
      payment_id: String(result.invoiceId),
      payment_amount_kwd: total,
    })
    .eq("id", bookingId);

  return NextResponse.json({ invoiceUrl: result.invoiceUrl, total });
}
