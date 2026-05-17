"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Restaurant } from "@/lib/supabase/types";
import { haversineKm, formatDistance, KUWAIT_CENTER } from "@/lib/distance";
import { Input } from "@/components/ui/Input";

// react-leaflet uses `window`; load it on the client only.
const RestaurantMap = dynamic(() => import("./RestaurantMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-xl border border-border bg-muted text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

type Props = {
  restaurants: Restaurant[];
  recommendedIds: string[];
};

export function DiscoverClient({ restaurants, recommendedIds }: Props) {
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [unit, setUnit] = useState<"km" | "mi">("km");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        // Permission denied — fall back to Kuwait City center.
        setUserLoc(KUWAIT_CENTER);
      },
      { timeout: 4000 },
    );
  }, []);

  const enriched = useMemo(() => {
    const origin = userLoc ?? KUWAIT_CENTER;
    return restaurants
      .map((r) => ({
        ...r,
        distanceKm: haversineKm(origin, { lat: r.lat, lng: r.lng }),
      }))
      .filter((r) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return (
          r.name.toLowerCase().includes(q) ||
          (r.cuisine ?? "").toLowerCase().includes(q) ||
          (r.area ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [restaurants, userLoc, query]);

  const recommendedSet = useMemo(
    () => new Set(recommendedIds),
    [recommendedIds],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tonight in Kuwait</h1>
          <p className="text-sm text-muted-foreground">
            {enriched.length} restaurants — sorted by nearest.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search by name, cuisine, area…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-64"
          />
          <button
            type="button"
            onClick={() => setUnit(unit === "km" ? "mi" : "km")}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            {unit.toUpperCase()}
          </button>
        </div>
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-border">
        <RestaurantMap
          restaurants={enriched}
          user={userLoc}
          selectedId={selectedId}
        />
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {enriched.map((r) => (
          <li
            key={r.id}
            onMouseEnter={() => setSelectedId(r.id)}
            onMouseLeave={() => setSelectedId(null)}
            className="rounded-xl border border-border bg-card p-4 transition hover:border-accent/40"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{r.name}</h3>
              {recommendedSet.has(r.id) && (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                  For you
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.cuisine}
              {r.area ? ` · ${r.area}` : ""} · {formatDistance(r.distanceKm, unit)}
            </p>
            {r.description && (
              <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
                {r.description}
              </p>
            )}
            <div className="mt-4">
              <Link
                href={`/restaurants/${r.id}`}
                className="text-sm font-medium text-accent hover:underline"
              >
                View tables &amp; book →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
