import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getPaymentStatus } from "@/lib/payments/myfatoorah";

// MyFatoorah redirects here after payment with ?paymentId=...&bookingId=...
// We verify status and update the booking.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const paymentId = url.searchParams.get("paymentId");
  const bookingId = url.searchParams.get("bookingId");
  const errored = url.searchParams.get("error");
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? `${url.protocol}//${url.host}`;

  if (!bookingId) {
    return NextResponse.redirect(`${appUrl}/dashboard?payment=error`);
  }

  if (errored || !paymentId) {
    return NextResponse.redirect(
      `${appUrl}/bookings/${bookingId}?payment=cancelled`,
    );
  }

  const status = await getPaymentStatus(paymentId);
  if (!status.ok) {
    return NextResponse.redirect(
      `${appUrl}/bookings/${bookingId}?payment=error`,
    );
  }

  const service = createSupabaseServiceClient();

  if (status.status === "Paid") {
    // Confirm the booking and stamp the payment.
    // userDefinedField was set to the booking id at initiate time; trust it
    // as a secondary check against the bookingId in the URL.
    const bookingFromMyfatoorah = status.userDefinedField;
    const target = bookingFromMyfatoorah ?? bookingId;

    // Read the current booking to know if status should flip.
    const { data: booking } = await service
      .from("bookings")
      .select("status, deposit_paid_at")
      .eq("id", target)
      .single();

    const update: Record<string, unknown> = {
      payment_id: String(paymentId),
      payment_amount_kwd: status.invoiceValue,
      paid_at: new Date().toISOString(),
    };
    if (booking?.status === "pending_deposit") {
      update.status = "confirmed";
      update.deposit_paid_at = new Date().toISOString();
    } else if (!booking?.deposit_paid_at) {
      // Pure service-fee payment (no deposit was required). Still record.
      update.deposit_paid_at = new Date().toISOString();
    }
    await service.from("bookings").update(update).eq("id", target);

    // In-app notification.
    const { data: bk } = await service
      .from("bookings")
      .select("user_id")
      .eq("id", target)
      .single();
    if (bk) {
      await service.from("notifications").insert({
        user_id: bk.user_id,
        title: "Payment received",
        message: `Your payment of ${status.invoiceValue.toFixed(3)} KWD was confirmed.`,
        href: `/bookings/${target}`,
      });
    }

    return NextResponse.redirect(
      `${appUrl}/bookings/${target}?payment=success`,
    );
  }

  // Pending / Failed / Cancelled
  return NextResponse.redirect(
    `${appUrl}/bookings/${bookingId}?payment=${status.status.toLowerCase()}`,
  );
}
