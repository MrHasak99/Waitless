"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";

type Row = {
  id: string;
  party_size: number;
  status: string;
  created_at: string;
  profiles: { email: string; full_name: string | null } | null;
  time_slots: { start_time: string } | null;
};

type Props = {
  restaurantId: string;
  initialBookings: Row[];
};

export function BookingsManager({ initialBookings }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("active");

  const visible = initialBookings.filter((b) => {
    if (filter === "all") return true;
    if (filter === "active")
      return !["cancelled", "no_show", "completed"].includes(b.status);
    return b.status === filter;
  });

  function cancel(id: string) {
    const reason = prompt("Reason for cancelling? (shown to the diner, optional)") ?? "";
    if (!confirm("Cancel this booking on behalf of the venue?")) return;
    start(async () => {
      setErr(null);
      const res = await fetch(`/api/admin/bookings/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Cancel failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Show:</span>
        {(["active", "all", "confirmed", "pending_deposit", "cancelled", "no_show"] as const).map(
          (f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full border px-2 py-0.5 ${
                filter === f
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-card hover:bg-muted"
              }`}
            >
              {f.replace("_", " ")}
            </button>
          ),
        )}
        {err && <span className="ml-auto text-red-600">{err}</span>}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Diner</th>
              <th className="px-4 py-2">Party</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2">
                  {b.time_slots?.start_time
                    ? format(new Date(b.time_slots.start_time), "EEE d MMM HH:mm")
                    : "—"}
                </td>
                <td className="px-4 py-2">
                  <div>{b.profiles?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.profiles?.email}
                  </div>
                </td>
                <td className="px-4 py-2">{b.party_size}</td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {b.status.replace("_", " ")}
                  </span>
                </td>
                <td className="space-x-3 px-4 py-2 text-right">
                  <Link
                    href={`/bookings/${b.id}`}
                    className="text-xs text-accent hover:underline"
                  >
                    View
                  </Link>
                  {!["cancelled", "no_show", "completed"].includes(b.status) && (
                    <button
                      type="button"
                      onClick={() => cancel(b.id)}
                      disabled={pending}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No bookings match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
