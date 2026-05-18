"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RestaurantTable } from "@/lib/supabase/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Props = {
  restaurantId: string;
  initialTables: RestaurantTable[];
};

export function TablesManager({ restaurantId, initialTables }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [globalErr, setGlobalErr] = useState<string | null>(null);
  const [newTable, setNewTable] = useState({ label: "", seats: 4 });

  function patch(tableId: string, body: Partial<RestaurantTable>) {
    return new Promise<{ ok: true } | { ok: false; error: string }>(
      (resolve) => {
        start(async () => {
          const res = await fetch(
            `/api/admin/restaurants/${restaurantId}/tables/${tableId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          );
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            resolve({ ok: false, error: friendlyError(j.error) });
            return;
          }
          router.refresh();
          resolve({ ok: true });
        });
      },
    );
  }

  function remove(tableId: string) {
    if (
      !confirm(
        "Delete this table? Existing bookings keep their record but lose the table assignment.",
      )
    ) {
      return;
    }
    start(async () => {
      setGlobalErr(null);
      const res = await fetch(
        `/api/admin/restaurants/${restaurantId}/tables/${tableId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setGlobalErr(friendlyError(j.error));
        return;
      }
      router.refresh();
    });
  }

  function create() {
    if (!newTable.label) {
      setGlobalErr("Label is required");
      return;
    }
    if (newTable.seats < 2) {
      setGlobalErr("Each table must have at least 2 seats.");
      return;
    }
    start(async () => {
      setGlobalErr(null);
      const res = await fetch(
        `/api/admin/restaurants/${restaurantId}/tables`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newTable),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setGlobalErr(friendlyError(j.error));
        return;
      }
      setNewTable({ label: "", seats: 4 });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {initialTables.map((t) => (
          <TableCard
            key={t.id}
            table={t}
            allTables={initialTables}
            onSave={(body) => patch(t.id, body)}
            onDelete={() => remove(t.id)}
            disabled={pending}
          />
        ))}
        {initialTables.length === 0 && (
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No tables yet — add one below.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Add a new table
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            Label
            <Input
              placeholder="e.g. T6"
              value={newTable.label}
              onChange={(e) =>
                setNewTable({ ...newTable, label: e.target.value })
              }
              className="w-28"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Seats (min 2)
            <Input
              type="number"
              min={2}
              max={50}
              value={newTable.seats}
              onChange={(e) =>
                setNewTable({
                  ...newTable,
                  seats: Math.max(2, Number(e.target.value)),
                })
              }
              className="w-24"
            />
          </label>
          <Button size="sm" onClick={create} disabled={pending}>
            Add table
          </Button>
        </div>
        {globalErr && (
          <p className="mt-2 text-sm text-red-600">{globalErr}</p>
        )}
      </div>
    </div>
  );
}

function TableCard({
  table,
  allTables,
  onSave,
  onDelete,
  disabled,
}: {
  table: RestaurantTable;
  allTables: RestaurantTable[];
  onSave: (
    body: Partial<RestaurantTable>,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onDelete: () => void;
  disabled: boolean;
}) {
  const [label, setLabel] = useState(table.label);
  const [seats, setSeats] = useState(table.seats);
  const [isMergeable, setIsMergeable] = useState(table.is_mergeable);
  const [canLend, setCanLend] = useState(table.can_lend_seats);
  const [maxLendable, setMaxLendable] = useState(table.max_lendable_seats);
  const [adj, setAdj] = useState<Set<string>>(
    new Set(table.adjacent_table_ids),
  );
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    label !== table.label ||
    seats !== table.seats ||
    isMergeable !== table.is_mergeable ||
    canLend !== table.can_lend_seats ||
    maxLendable !== table.max_lendable_seats ||
    !sameSet(adj, new Set(table.adjacent_table_ids));

  const cap = Math.max(0, seats - 2);

  function toggleAdj(id: string) {
    const next = new Set(adj);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAdj(next);
  }

  async function save() {
    setErr(null);
    if (seats < 2) {
      setErr("Seats must be at least 2.");
      return;
    }
    if (canLend && maxLendable > cap) {
      setErr(`Max lendable can't exceed ${cap} (keep 2 seats minimum).`);
      return;
    }
    const res = await onSave({
      label,
      seats,
      is_mergeable: isMergeable,
      can_lend_seats: canLend,
      max_lendable_seats: maxLendable,
      adjacent_table_ids: Array.from(adj),
    });
    if (!res.ok) setErr(res.error);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <label className="flex flex-col gap-1 text-xs">
          Label
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-24"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Seats
          <Input
            type="number"
            min={2}
            max={50}
            value={seats}
            onChange={(e) => setSeats(Math.max(2, Number(e.target.value)))}
            className="w-20"
          />
        </label>
        <div className="ml-auto">
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3 border-t border-border pt-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isMergeable}
            onChange={(e) => setIsMergeable(e.target.checked)}
            className="h-4 w-4"
          />
          <span>
            <span className="font-medium">Allow merging</span>
            <span className="ml-2 text-xs text-muted-foreground">
              with adjacent mergeable tables
            </span>
          </span>
        </label>

        {isMergeable && (
          <div className="ml-6">
            <p className="text-xs text-muted-foreground">Adjacent to:</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {allTables
                .filter((t) => t.id !== table.id)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleAdj(t.id)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      adj.has(t.id)
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={canLend}
            onChange={(e) => setCanLend(e.target.checked)}
            className="h-4 w-4"
          />
          <span>
            <span className="font-medium">Allow lending seats</span>
            <span className="ml-2 text-xs text-muted-foreground">
              to nearby tables for a fee
            </span>
          </span>
        </label>

        {canLend && (
          <label className="ml-6 flex items-center gap-2 text-xs">
            Max seats to lend
            <Input
              type="number"
              min={0}
              max={cap}
              value={maxLendable}
              onChange={(e) =>
                setMaxLendable(Math.max(0, Number(e.target.value)))
              }
              className="w-20"
            />
            <span className="text-muted-foreground">
              (max {cap} — keep 2 seats minimum)
            </span>
          </label>
        )}
      </div>

      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

      {dirty && (
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setLabel(table.label);
              setSeats(table.seats);
              setIsMergeable(table.is_mergeable);
              setCanLend(table.can_lend_seats);
              setMaxLendable(table.max_lendable_seats);
              setAdj(new Set(table.adjacent_table_ids));
              setErr(null);
            }}
            disabled={disabled}
            className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
          >
            Discard
          </button>
          <Button size="sm" onClick={save} disabled={disabled}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

function sameSet<T>(a: Set<T>, b: Set<T>) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// The capacity-sync trigger raises with a long Postgres message; collapse it
// to something an admin can act on.
function friendlyError(raw: string | undefined): string {
  if (!raw) return "Save failed";
  if (raw.includes("CAPACITY_BELOW_BOOKED")) {
    return "This change would over-subscribe an upcoming slot — diners have already booked beyond the new total capacity. Cancel some bookings first or pick a smaller reduction.";
  }
  if (raw.includes("restaurant_tables_min_seats")) {
    return "Each table must have at least 2 seats.";
  }
  return raw;
}
