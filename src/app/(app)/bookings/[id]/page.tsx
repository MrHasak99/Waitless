import { notFound } from "next/navigation";
import { format } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CancelButton } from "@/components/CancelButton";
import { PayNowButton } from "@/components/PayNowButton";

export const dynamic = "force-dynamic";

export default async function BookingDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    action?: string;
    payment?: string;
  }>;
}) {
  const { id } = await params;
  const { action, payment } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: booking }, { data: { user } }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, party_size, status, risk_score, deposit_required, deposit_paid_at, arrangement_fee_kwd, paid_at, payment_amount_kwd, table_id, created_at, restaurants(id, name, address, area, deposit_kwd), time_slots(start_time, end_time)",
      )
      .eq("id", id)
      .single(),
    supabase.auth.getUser(),
  ]);
  if (!booking) notFound();

  const [{ data: merge }, { data: borrow }] = await Promise.all([
    supabase
      .from("table_merges")
      .select("id, table_ids, total_seats")
      .eq("booking_id", id)
      .maybeSingle(),
    supabase
      .from("seat_borrows")
      .select("id, seats, from_table_id, to_table_id")
      .eq("booking_id", id)
      .maybeSingle(),
  ]);

  const involvedTableIds: string[] = [
    ...((merge?.table_ids as string[] | undefined) ?? []),
    ...(borrow ? [borrow.from_table_id, borrow.to_table_id] : []),
    ...(booking.table_id ? [booking.table_id] : []),
  ];
  let tableLabels = new Map<string, string>();
  if (involvedTableIds.length > 0) {
    const { data: rows } = await supabase
      .from("restaurant_tables")
      .select("id, label")
      .in("id", involvedTableIds);
    tableLabels = new Map((rows ?? []).map((r) => [r.id, r.label]));
  }

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.role === "admin";
  }

  const slot = (booking as unknown as { time_slots: { start_time: string; end_time: string } }).time_slots;
  const restaurant = (booking as unknown as { restaurants: { id: string; name: string; address: string; area: string | null; deposit_kwd: number } }).restaurants;

  const cancellable =
    booking.status !== "cancelled" &&
    booking.status !== "completed" &&
    booking.status !== "no_show";

  const depositOwed = booking.deposit_required ? Number(restaurant.deposit_kwd) : 0;
  const feeOwed = Number(booking.arrangement_fee_kwd ?? 0);
  const totalOwed = booking.paid_at ? 0 : depositOwed + feeOwed;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Booking
      </p>
      <h1 className="mt-1 text-3xl font-semibold">{restaurant.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {restaurant.address}
        {restaurant.area ? ` · ${restaurant.area}` : ""}
      </p>

      <PaymentBanner status={payment} />

      <dl className="mt-8 grid gap-4 rounded-xl border border-border bg-card p-5 text-sm">
        <Row label="Date">
          {format(new Date(slot.start_time), "EEEE d MMMM yyyy")}
        </Row>
        <Row label="Time">
          {format(new Date(slot.start_time), "HH:mm")} —{" "}
          {format(new Date(slot.end_time), "HH:mm")}
        </Row>
        <Row label="Party size">{booking.party_size}</Row>
        <Row label="Status">{booking.status.replace("_", " ")}</Row>
        {merge && (
          <Row label="Tables">
            Combined {(merge.table_ids as string[])
              .map((tid: string) => tableLabels.get(tid) ?? "?")
              .sort()
              .join(" + ")}{" "}
            ({merge.total_seats} seats)
          </Row>
        )}
        {borrow && (
          <Row label="Tables">
            {tableLabels.get(borrow.to_table_id) ?? "?"} + {borrow.seats}{" "}
            extra chair{borrow.seats === 1 ? "" : "s"} from{" "}
            {tableLabels.get(borrow.from_table_id) ?? "?"}
          </Row>
        )}
        {!merge && !borrow && booking.table_id && (
          <Row label="Table">
            {tableLabels.get(booking.table_id) ?? "—"}
          </Row>
        )}
        {feeOwed > 0 && (
          <Row label="Service fee">{feeOwed.toFixed(3)} KWD</Row>
        )}
        {booking.deposit_required && (
          <Row label="Deposit">{depositOwed.toFixed(3)} KWD</Row>
        )}
        {booking.paid_at && (
          <Row label="Paid">
            {format(new Date(booking.paid_at), "d MMM HH:mm")} ·{" "}
            {Number(booking.payment_amount_kwd ?? 0).toFixed(3)} KWD
          </Row>
        )}
        {isAdmin && booking.risk_score !== null && (
          <Row label="AI risk score (admin)">
            {(Number(booking.risk_score) * 100).toFixed(0)}%
          </Row>
        )}
      </dl>

      {totalOwed > 0 && cancellable && (
        <div className="mt-6 rounded-xl border border-accent/40 bg-accent/5 p-4">
          <p className="text-sm font-medium">
            {totalOwed.toFixed(3)} KWD due to secure this booking
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {depositOwed > 0 && <>Deposit {depositOwed.toFixed(3)} KWD</>}
            {depositOwed > 0 && feeOwed > 0 && " · "}
            {feeOwed > 0 && <>Service fee {feeOwed.toFixed(3)} KWD</>}
          </p>
          <div className="mt-3">
            <PayNowButton bookingId={booking.id} amount={totalOwed} />
          </div>
        </div>
      )}

      {cancellable && (
        <div className="mt-6">
          {/* `?action=cancel` from the reminder email opens the dialog automatically. */}
          <CancelButton
            bookingId={booking.id}
            autoConfirm={action === "cancel"}
          />
        </div>
      )}
    </div>
  );
}

function PaymentBanner({ status }: { status?: string }) {
  if (!status) return null;
  if (status === "success") {
    return (
      <div className="mt-4 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200">
        Payment confirmed. Your booking is secured.
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <div className="mt-4 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-200">
        Payment was cancelled. You can retry below.
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
      Payment status: {status}. Try again below or contact support.
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
