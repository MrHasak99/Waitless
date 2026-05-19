import type { RestaurantTable } from "@/lib/supabase/types";

// Top-down restaurant floor plan: rounded rectangles for tables, small
// circles for chairs around each one, label centered. Computes a fitted
// viewBox with generous padding so chairs and labels never get clipped.

const PADDING = 60;
const CHAIR_RADIUS = 6;
const CHAIR_OFFSET = 14; // distance from table edge to chair center

type Dims = { w: number; h: number };

// Pick a sensible footprint per table — longer rectangles for bigger parties.
function tableDims(seats: number): Dims {
  if (seats <= 2) return { w: 48, h: 48 };
  if (seats <= 4) return { w: 70, h: 56 };
  if (seats <= 6) return { w: 96, h: 60 };
  if (seats <= 8) return { w: 120, h: 64 };
  return { w: 144, h: 70 };
}

// Distribute chair positions around a rectangle. Two on the short ends + the
// remainder split between long sides.
function chairPositions(seats: number, dims: Dims) {
  const { w, h } = dims;
  const positions: { x: number; y: number }[] = [];
  if (seats <= 2) {
    positions.push({ x: -w / 2 - CHAIR_OFFSET, y: 0 });
    if (seats === 2) positions.push({ x: w / 2 + CHAIR_OFFSET, y: 0 });
    return positions;
  }
  const ends = 2;
  const sides = seats - ends;
  const perSide = Math.ceil(sides / 2);
  positions.push({ x: -w / 2 - CHAIR_OFFSET, y: 0 });
  positions.push({ x: w / 2 + CHAIR_OFFSET, y: 0 });
  for (let i = 0; i < perSide; i++) {
    const t = (i + 1) / (perSide + 1);
    const x = -w / 2 + t * w;
    positions.push({ x, y: -h / 2 - CHAIR_OFFSET });
  }
  const bottom = sides - perSide;
  for (let i = 0; i < bottom; i++) {
    const t = (i + 1) / (bottom + 1);
    const x = -w / 2 + t * w;
    positions.push({ x, y: h / 2 + CHAIR_OFFSET });
  }
  return positions;
}

export function FloorPlan({ tables }: { tables: RestaurantTable[] }) {
  if (tables.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Floor plan not configured.
      </p>
    );
  }

  // Pre-compute footprints to size the viewBox correctly.
  const placed = tables.map((t) => ({ ...t, dims: tableDims(t.seats) }));
  const minX = Math.min(...placed.map((t) => t.x - t.dims.w / 2 - CHAIR_OFFSET - CHAIR_RADIUS));
  const maxX = Math.max(...placed.map((t) => t.x + t.dims.w / 2 + CHAIR_OFFSET + CHAIR_RADIUS));
  const minY = Math.min(...placed.map((t) => t.y - t.dims.h / 2 - CHAIR_OFFSET - CHAIR_RADIUS));
  const maxY = Math.max(...placed.map((t) => t.y + t.dims.h / 2 + CHAIR_OFFSET + CHAIR_RADIUS));
  const viewBox = `${minX - PADDING} ${minY - PADDING} ${maxX - minX + PADDING * 2} ${maxY - minY + PADDING * 2}`;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#f4f1ea] p-3 dark:bg-[#1c1c1a]">
      <svg
        viewBox={viewBox}
        className="h-80 w-full"
        aria-label="Restaurant floor plan"
      >
        {/* Wood-grain hint via gradient */}
        <defs>
          <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c89464" />
            <stop offset="100%" stopColor="#a26a3a" />
          </linearGradient>
          <linearGradient id="chair" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e7e2d8" />
            <stop offset="100%" stopColor="#c8c2b3" />
          </linearGradient>
        </defs>

        {placed.map((t) => {
          const chairs = chairPositions(t.seats, t.dims);
          return (
            <g
              key={t.id}
              transform={`translate(${t.x}, ${t.y})`}
              className="text-foreground"
            >
              {/* Chairs */}
              {chairs.map((c, i) => (
                <circle
                  key={i}
                  cx={c.x}
                  cy={c.y}
                  r={CHAIR_RADIUS}
                  fill="url(#chair)"
                  stroke="#8a8576"
                  strokeWidth={0.8}
                />
              ))}
              {/* Table top */}
              <rect
                x={-t.dims.w / 2}
                y={-t.dims.h / 2}
                width={t.dims.w}
                height={t.dims.h}
                rx={10}
                ry={10}
                fill="url(#wood)"
                stroke="#7a5a32"
                strokeWidth={1.2}
              />
              {/* Label */}
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={13}
                fontWeight={700}
                fill="#3a2a16"
              >
                {t.label}
              </text>
              <text
                y={16}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={9}
                fontWeight={500}
                fill="#3a2a16"
                opacity={0.75}
              >
                {t.seats} seats
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
