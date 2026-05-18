import Link from "next/link";
import { format } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WaitlistEntryRow } from "@/components/WaitlistEntryRow";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: bookings }, { data: waitlist }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, party_size, status, risk_score, created_at, restaurants(name, area), time_slots(start_time)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("waitlist_entries")
      .select(
        "id, party_size, position, notified_at, expires_at, created_at, time_slots!slot_id(start_time, restaurants(name, area))",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const rows = (bookings ?? []) as unknown as Array<{
    id: string;
    party_size: number;
    status: string;
    risk_score: number | null;
    created_at: string;
    restaurants: { name: string; area: string | null } | null;
    time_slots: { start_time: string } | null;
  }>;

  const waitRows = (waitlist ?? []) as unknown as Array<{
    id: string;
    party_size: number;
    position: number;
    notified_at: string | null;
    expires_at: string | null;
    time_slots:
      | {
          start_time: string;
          restaurants: { name: string; area: string | null } | null;
        }
      | null;
  }>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-semibold">My bookings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {rows.length} {rows.length === 1 ? "booking" : "bookings"}
        {waitRows.length > 0 && ` · ${waitRows.length} on the waitlist`}
      </p>

      <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
        {rows.length === 0 && (
          <li className="p-8 text-center text-sm text-muted-foreground">
            No bookings yet.{" "}
            <Link href="/dashboard" className="text-accent hover:underline">
              Find a table
            </Link>
            .
          </li>
        )}
        {rows.map((b) => (
          <li key={b.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{b.restaurants?.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                {b.time_slots?.start_time
                  ? format(
                      new Date(b.time_slots.start_time),
                      "EEE d MMM · HH:mm",
                    )
                  : "—"}{" "}
                · {b.party_size} guests
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(b.status)}`}
              >
                {b.status.replace("_", " ")}
              </span>
              <Link
                href={`/bookings/${b.id}`}
                className="text-sm text-accent hover:underline"
              >
                Open
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {waitRows.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold">My waitlist</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Slots where you&apos;re queued for a seat. We notify you the
            moment one opens.
          </p>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {waitRows.map((w) => (
              <WaitlistEntryRow
                key={w.id}
                entry={{
                  id: w.id,
                  partySize: w.party_size,
                  position: w.position,
                  notifiedAt: w.notified_at,
                  expiresAt: w.expires_at,
                  startTime: w.time_slots?.start_time ?? null,
                  restaurantName: w.time_slots?.restaurants?.name ?? "—",
                }}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function statusClass(s: string) {
  switch (s) {
    case "confirmed":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200";
    case "pending_deposit":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200";
    case "cancelled":
    case "no_show":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}
