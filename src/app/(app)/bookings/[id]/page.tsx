import { notFound } from "next/navigation";
import { format } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CancelButton } from "@/components/CancelButton";

export const dynamic = "force-dynamic";

export default async function BookingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: booking }, { data: { user } }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, party_size, status, risk_score, deposit_required, deposit_paid_at, arrangement_fee_kwd, created_at, restaurants(id, name, address, area), time_slots(start_time, end_time)",
      )
      .eq("id", id)
      .single(),
    supabase.auth.getUser(),
  ]);
  if (!booking) notFound();

  // Arrangement lookup (merge / borrow) tied to this booking, if any.
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

  // Resolve table labels if needed.
  const involvedTableIds: string[] = [
    ...((merge?.table_ids as string[] | undefined) ?? []),
    ...(borrow ? [borrow.from_table_id, borrow.to_table_id] : []),
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
  const restaurant = (booking as unknown as { restaurants: { id: string; name: string; address: string; area: string | null } }).restaurants;

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
        {Number(booking.arrangement_fee_kwd) > 0 && (
          <Row label="Service fee">
            {Number(booking.arrangement_fee_kwd).toFixed(3)} KWD · due at the
            venue
          </Row>
        )}
        {booking.deposit_required && (
          <Row label="Deposit">
            {booking.deposit_paid_at ? "Paid" : "Pending payment"}
          </Row>
        )}
        {isAdmin && booking.risk_score !== null && (
          <Row label="AI risk score (admin)">
            {(Number(booking.risk_score) * 100).toFixed(0)}%
          </Row>
        )}
      </dl>

      {booking.status !== "cancelled" &&
        booking.status !== "completed" &&
        booking.status !== "no_show" && (
          <div className="mt-6">
            <CancelButton bookingId={booking.id} />
          </div>
        )}
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
