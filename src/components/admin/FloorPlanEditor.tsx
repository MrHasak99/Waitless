"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RestaurantTable } from "@/lib/supabase/types";
import { Button } from "@/components/ui/Button";

// Cell size of the snap grid (px). Coarser cells make the layout easier to
// align; the diner-facing FloorPlan reads the same x/y so they always agree.
const CELL = 50;
const COLS = 16;
const ROWS = 10;
// Extra space around the table for chairs (matches the diner FloorPlan's
// chair offset + radius + a small margin). The collision check treats this
// padded rectangle as the table's true footprint so chairs never overlap.
const CHAIR_PAD = 26;

type Pos = { x: number; y: number };
type Rect = { left: number; right: number; top: number; bottom: number };

type Props = {
  restaurantId: string;
  initialTables: RestaurantTable[];
};

function tableWidth(seats: number) {
  if (seats <= 2) return 60;
  if (seats <= 4) return 80;
  if (seats <= 6) return 100;
  if (seats <= 8) return 120;
  return 140;
}

function tableHeight(seats: number) {
  return seats <= 2 ? 50 : 56;
}

function footprintOf(t: { x: number; y: number; seats: number }): Rect {
  const w = tableWidth(t.seats);
  const h = tableHeight(t.seats);
  return {
    left: t.x - w / 2 - CHAIR_PAD,
    right: t.x + w / 2 + CHAIR_PAD,
    top: t.y - h / 2 - CHAIR_PAD,
    bottom: t.y + h / 2 + CHAIR_PAD,
  };
}

function rectsOverlap(a: Rect, b: Rect) {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

export function FloorPlanEditor({ restaurantId, initialTables }: Props) {
  const router = useRouter();
  // Seeded once on mount. The parent remounts this component (via a key
  // built from the table id set) when tables are added or removed.
  const [tables, setTables] = useState(initialTables);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<Pos>({ x: 0, y: 0 });
  // Captured at pointerdown so we can revert if the drop position collides.
  const originalPosRef = useRef<Pos | null>(null);

  // Map of {table id -> footprint} for the *non-dragged* tables. Recomputed
  // whenever tables change so the live collision indicator stays accurate.
  const otherFootprints = useMemo(() => {
    const map = new Map<string, Rect>();
    for (const t of tables) {
      if (t.id !== dragId) map.set(t.id, footprintOf(t));
    }
    return map;
  }, [tables, dragId]);

  function snap(v: number) {
    return Math.round(v / CELL) * CELL;
  }

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function collides(candidate: { x: number; y: number; seats: number }) {
    const fp = footprintOf(candidate);
    for (const other of otherFootprints.values()) {
      if (rectsOverlap(fp, other)) return true;
    }
    return false;
  }

  function onPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    table: RestaurantTable,
  ) {
    if (!canvasRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    originalPosRef.current = { x: table.x, y: table.y };
    setError(null);
    setDragId(table.id);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragId || !canvasRef.current) return;
    const canvas = canvasRef.current.getBoundingClientRect();
    const t = tables.find((x) => x.id === dragId);
    if (!t) return;
    const w = tableWidth(t.seats);
    const h = tableHeight(t.seats);
    const rawLeft = e.clientX - canvas.left - dragOffsetRef.current.x;
    const rawTop = e.clientY - canvas.top - dragOffsetRef.current.y;
    const left = clamp(rawLeft, 0, COLS * CELL - w);
    const top = clamp(rawTop, 0, ROWS * CELL - h);
    setTables((curr) =>
      curr.map((x) =>
        x.id === dragId ? { ...x, x: left + w / 2, y: top + h / 2 } : x,
      ),
    );
  }

  async function onPointerUp() {
    if (!dragId) return;
    const t = tables.find((x) => x.id === dragId);
    const original = originalPosRef.current;
    setDragId(null);
    originalPosRef.current = null;
    if (!t || !original) return;

    const w = tableWidth(t.seats);
    const h = tableHeight(t.seats);
    // Snap the *center* to a grid intersection so tables sit symmetrically
    // around grid dots instead of getting glued to the left of a cell.
    const sx = clamp(snap(t.x), w / 2, COLS * CELL - w / 2);
    const sy = clamp(snap(t.y), h / 2, ROWS * CELL - h / 2);

    const candidate = { x: sx, y: sy, seats: t.seats };
    if (collides(candidate)) {
      // Snap back — too close to another table's chair footprint.
      setTables((curr) =>
        curr.map((x) =>
          x.id === t.id ? { ...x, x: original.x, y: original.y } : x,
        ),
      );
      setError(
        "That spot overlaps another table's chair space. Pick a cell with more clearance.",
      );
      return;
    }

    if (sx === original.x && sy === original.y) {
      // Nothing changed (just nudged within snap range).
      return;
    }
    setTables((curr) =>
      curr.map((x) => (x.id === t.id ? { ...x, x: sx, y: sy } : x)),
    );
    setPendingSave(t.id);
    const res = await fetch(
      `/api/admin/restaurants/${restaurantId}/tables/${t.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: sx, y: sy }),
      },
    );
    setPendingSave(null);
    if (res.ok) router.refresh();
  }

  async function snapAll() {
    if (!confirm("Snap every table to the nearest grid cell?")) return;
    const placed: Rect[] = [];
    const updates: { id: string; x: number; y: number }[] = [];
    for (const t of tables) {
      const w = tableWidth(t.seats);
      const h = tableHeight(t.seats);
      // Same center-snap rule used in onPointerUp.
      const sx = clamp(snap(t.x), w / 2, COLS * CELL - w / 2);
      const sy = clamp(snap(t.y), h / 2, ROWS * CELL - h / 2);
      const fp = footprintOf({ x: sx, y: sy, seats: t.seats });
      if (placed.some((p) => rectsOverlap(p, fp))) {
        // Would overlap an already-placed table; leave it where it was.
        placed.push(footprintOf(t));
        continue;
      }
      placed.push(fp);
      if (sx === t.x && sy === t.y) continue;
      updates.push({ id: t.id, x: sx, y: sy });
    }
    if (updates.length === 0) {
      setError("Already aligned — nothing to snap.");
      return;
    }
    // Optimistic local update so the editor visually reflects the snap.
    setTables((curr) =>
      curr.map((x) => {
        const u = updates.find((u) => u.id === x.id);
        return u ? { ...x, x: u.x, y: u.y } : x;
      }),
    );
    setError(null);
    await Promise.all(
      updates.map((u) =>
        fetch(`/api/admin/restaurants/${restaurantId}/tables/${u.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: u.x, y: u.y }),
        }),
      ),
    );
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Drag tables to position. Snaps to a {CELL}px grid. Mergeable and
          lendable settings stay on each table&apos;s card below.
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={snapAll}
          disabled={!!dragId}
        >
          Snap all
        </Button>
      </div>
      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </p>
      )}
      <div className="overflow-auto rounded-xl border border-border bg-card p-2">
        <div
          ref={canvasRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="relative bg-[#f4f1ea] dark:bg-[#1c1c1a]"
          style={{
            width: COLS * CELL,
            height: ROWS * CELL,
            backgroundImage:
              "radial-gradient(rgba(0,0,0,0.10) 1px, transparent 1px)",
            backgroundSize: `${CELL}px ${CELL}px`,
            touchAction: "none",
          }}
        >
          {tables.map((t) => {
            const w = tableWidth(t.seats);
            const h = tableHeight(t.seats);
            const left = clamp(t.x - w / 2, 0, COLS * CELL - w);
            const top = clamp(t.y - h / 2, 0, ROWS * CELL - h);
            const isDragging = dragId === t.id;
            const saving = pendingSave === t.id;
            // Live collision flag while dragging — turns the dragged table red.
            const colliding =
              isDragging && collides({ x: t.x, y: t.y, seats: t.seats });
            return (
              <div key={t.id}>
                {/* Chair footprint outline — subtle, matches the diner view. */}
                <div
                  className="pointer-events-none absolute rounded-xl border border-dashed"
                  style={{
                    left: left - CHAIR_PAD,
                    top: top - CHAIR_PAD,
                    width: w + CHAIR_PAD * 2,
                    height: h + CHAIR_PAD * 2,
                    borderColor: colliding
                      ? "#dc2626"
                      : "rgba(122, 90, 50, 0.35)",
                    zIndex: isDragging ? 9 : 0,
                  }}
                />
                <div
                  onPointerDown={(e) => onPointerDown(e, t)}
                  role="button"
                  aria-label={`Position ${t.label}`}
                  className="absolute flex flex-col items-center justify-center rounded-lg border text-[#3a2a16] shadow-sm select-none"
                  style={{
                    left,
                    top,
                    width: w,
                    height: h,
                    background: colliding
                      ? "linear-gradient(to bottom, #f87171, #b91c1c)"
                      : "linear-gradient(to bottom, #c89464, #a26a3a)",
                    borderColor: colliding ? "#7f1d1d" : "#7a5a32",
                    cursor: isDragging ? "grabbing" : "grab",
                    zIndex: isDragging ? 10 : 1,
                    opacity: saving ? 0.6 : 1,
                    transition: isDragging
                      ? "none"
                      : "left 120ms ease, top 120ms ease",
                  }}
                >
                  <span className="text-sm font-semibold">{t.label}</span>
                  <span className="text-[10px] opacity-75">
                    {t.seats} seats
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
