import type { RestaurantTable } from "@/lib/supabase/types";

export function FloorPlan({ tables }: { tables: RestaurantTable[] }) {
  if (tables.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Floor plan not configured.
      </p>
    );
  }
  const maxX = Math.max(...tables.map((t) => t.x)) + 80;
  const maxY = Math.max(...tables.map((t) => t.y)) + 80;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted/30 p-2">
      <svg
        viewBox={`0 0 ${maxX} ${maxY}`}
        className="h-72 w-full"
        aria-label="Restaurant floor plan"
      >
        {tables.map((t) => (
          <g key={t.id} transform={`translate(${t.x}, ${t.y})`}>
            <circle
              r={Math.min(34, 18 + t.seats * 1.5)}
              fill="var(--color-accent)"
              opacity={0.85}
            />
            <text
              y={4}
              textAnchor="middle"
              fontSize={12}
              fontWeight={600}
              fill="white"
            >
              {t.label}
            </text>
            <text
              y={20}
              textAnchor="middle"
              fontSize={9}
              fill="white"
              opacity={0.9}
            >
              {t.seats} seats
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
