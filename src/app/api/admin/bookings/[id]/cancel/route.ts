import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, recordAuditAction } from "@/lib/admin";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

const Body = z.object({
  reason: z.string().max(200).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: guard.status });
  }
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const reason = parsed.success ? parsed.data.reason : undefined;

  const supabase = await createSupabaseServerClient();
  // cancel_booking() runs as SECURITY DEFINER and allows admins to cancel
  // any booking — same RPC as the user-facing cancel.
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: id });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const { data: booking } = await service
    .from("bookings")
    .select("user_id, restaurants(name)")
    .eq("id", id)
    .single();

  if (booking) {
    const restaurantName =
      (booking as unknown as { restaurants: { name: string } | null }).restaurants?.name ?? "the restaurant";
    await service.from("notifications").insert({
      user_id: booking.user_id,
      title: "Your booking was cancelled by the venue",
      message: reason
        ? `${restaurantName} cancelled your booking: ${reason}`
        : `${restaurantName} cancelled your booking. Please book again or contact them directly.`,
      href: `/bookings`,
    });
  }

  await recordAuditAction(guard.user.id, "admin_cancel_booking", id, {
    reason: reason ?? null,
  });
  return NextResponse.json({ ok: true });
}
