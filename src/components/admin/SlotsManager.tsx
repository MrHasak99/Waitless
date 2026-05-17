"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Slot = {
  id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  booked_count: number;
};

type Props = {
  restaurantId: string;
  initialSlots: Slot[];
};

export function SlotsManager({ restaurantId, initialSlots }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [showBatch, setShowBatch] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of initialSlots) {
      const day = s.start_time.slice(0, 10);
      const arr = map.get(day) ?? [];
      arr.push(s);
      map.set(day, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [initialSlots]);

  function remove(id: string) {
    if (!confirm("Delete this slot? Only allowed if there are no active bookings.")) return;
    start(async () => {
      setErr(null);
      const res = await fetch(
        `/api/admin/restaurants/${restaurantId}/slots/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Delete failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowBatch((s) => !s)}
        >
          {showBatch ? "Hide" : "Generate slots in bulk"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Capacity is auto-derived from your tables — to change it, adjust
          tables above.
        </p>
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>

      {showBatch && (
        <BatchGenerator
          restaurantId={restaurantId}
          onDone={() => {
            setShowBatch(false);
            router.refresh();
          }}
        />
      )}

      <div className="rounded-xl border border-border bg-card">
        {grouped.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No upcoming slots. Generate some above.
          </p>
        )}
        {grouped.map(([day, slots]) => (
          <div key={day} className="border-b border-border last:border-0">
            <div className="bg-muted/40 px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {format(new Date(`${day}T00:00:00Z`), "EEEE d MMMM yyyy")}
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-1.5">Time</th>
                  <th className="px-4 py-1.5">Booked / Capacity</th>
                  <th className="px-4 py-1.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {slots.map((s) => (
                  <SlotRow
                    key={s.id}
                    slot={s}
                    onDelete={() => remove(s.id)}
                    disabled={pending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  onDelete,
  disabled,
}: {
  slot: Slot;
  onDelete: () => void;
  disabled: boolean;
}) {
  const utilization = slot.capacity === 0 ? 0 : slot.booked_count / slot.capacity;
  return (
    <tr>
      <td className="px-4 py-2 font-medium">
        {format(new Date(slot.start_time), "HH:mm")} —{" "}
        {format(new Date(slot.end_time), "HH:mm")}
      </td>
      <td className="px-4 py-2">
        <span
          className={
            utilization >= 1
              ? "text-red-600"
              : utilization >= 0.8
                ? "text-yellow-700"
                : "text-muted-foreground"
          }
        >
          {slot.booked_count} / {slot.capacity}
        </span>
      </td>
      <td className="space-x-3 px-4 py-2 text-right">
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="text-xs text-red-600 hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

function BatchGenerator({
  restaurantId,
  onDone,
}: {
  restaurantId: string;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({
    fromDate: new Date().toISOString().slice(0, 10),
    toDate: new Date(Date.now() + 14 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10),
    hours: "18,19,20,21,22",
    durationMinutes: 90,
  }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const hoursArr = form.hours
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 23);
    if (hoursArr.length === 0) {
      setErr("Provide at least one valid hour (0-23, comma-separated).");
      return;
    }
    start(async () => {
      setErr(null);
      const res = await fetch(
        `/api/admin/restaurants/${restaurantId}/slots`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batch: {
              fromDate: form.fromDate,
              toDate: form.toDate,
              hours: hoursArr,
              durationMinutes: form.durationMinutes,
            },
          }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Failed");
        return;
      }
      onDone();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-4"
    >
      <label className="flex flex-col gap-1 text-xs">
        From date
        <Input
          type="date"
          value={form.fromDate}
          onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        To date
        <Input
          type="date"
          value={form.toDate}
          onChange={(e) => setForm({ ...form, toDate: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs sm:col-span-2">
        Hours (UTC, comma-separated)
        <Input
          value={form.hours}
          onChange={(e) => setForm({ ...form, hours: e.target.value })}
          placeholder="18,19,20,21,22"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Duration (min)
        <Input
          type="number"
          min={15}
          max={360}
          value={form.durationMinutes}
          onChange={(e) =>
            setForm({
              ...form,
              durationMinutes: Math.max(15, Number(e.target.value)),
            })
          }
        />
      </label>
      <div className="sm:col-span-4 flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Generating…" : "Generate"}
        </Button>
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </form>
  );
}
