"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/Button";

type Props = {
  entry: {
    id: string;
    partySize: number;
    position: number;
    notifiedAt: string | null;
    expiresAt: string | null;
    startTime: string | null;
    restaurantName: string;
  };
};

export function WaitlistEntryRow({ entry }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const claimable =
    !!entry.notifiedAt &&
    (!entry.expiresAt || new Date(entry.expiresAt) > new Date());
  const expired =
    !!entry.expiresAt && new Date(entry.expiresAt) <= new Date();

  function claim() {
    start(async () => {
      setError(null);
      const res = await fetch(`/api/waitlist/${entry.id}/claim`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not claim the seat.");
        return;
      }
      router.push(`/bookings/${json.bookingId}`);
      router.refresh();
    });
  }

  function leave() {
    if (!confirm("Leave this waitlist?")) return;
    start(async () => {
      setError(null);
      const res = await fetch(`/api/waitlist/${entry.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Could not leave the waitlist.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{entry.restaurantName}</p>
        <p className="text-xs text-muted-foreground">
          {entry.startTime
            ? format(new Date(entry.startTime), "EEE d MMM · HH:mm")
            : "—"}{" "}
          · {entry.partySize} guests · position #{entry.position}
        </p>
        {claimable && (
          <p className="mt-1 text-xs font-medium text-green-700 dark:text-green-300">
            A seat opened — claim within{" "}
            {entry.expiresAt
              ? formatDistanceToNow(new Date(entry.expiresAt))
              : "24h"}
            .
          </p>
        )}
        {expired && (
          <p className="mt-1 text-xs text-red-600">
            Claim window expired.
          </p>
        )}
        {error && (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {claimable && (
          <Button size="sm" onClick={claim} disabled={pending}>
            {pending ? "Claiming…" : "Claim seat"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={leave}
          disabled={pending}
        >
          Leave
        </Button>
      </div>
    </li>
  );
}
