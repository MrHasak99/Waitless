import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { chat } from "@/lib/ai/openrouter";

// Phase 2: Predictive analytics endpoint — given a restaurant id, returns
// a forward-looking prediction with a confidence indicator.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json(
      { error: "restaurantId required" },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(
    Date.now() - 30 * 24 * 3600 * 1000,
  ).toISOString();

  const { data: history } = await supabase
    .from("bookings")
    .select("party_size, status, created_at, time_slots!slot_id(start_time)")
    .eq("restaurant_id", restaurantId)
    .gte("created_at", since)
    .limit(500);

  const rows = (history ?? []) as unknown as Array<{
    party_size: number;
    status: string;
    created_at: string;
    time_slots: { start_time: string } | null;
  }>;

  // Heuristic fallback: avg party size, peak hour, no-show rate.
  const total = rows.length;
  const noShow = rows.filter((r) => r.status === "no_show").length;
  const avgParty =
    total === 0 ? 0 : rows.reduce((s, r) => s + r.party_size, 0) / total;
  const peakHours: Record<number, number> = {};
  for (const r of rows) {
    if (r.time_slots?.start_time) {
      const h = new Date(r.time_slots.start_time).getUTCHours();
      peakHours[h] = (peakHours[h] ?? 0) + 1;
    }
  }
  const peakHour = Object.entries(peakHours).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];

  const fallback = {
    summary:
      total === 0
        ? "Not enough history yet — predictions get sharper after the first week of bookings."
        : `Avg party size ${avgParty.toFixed(1)}. Peak hour ${peakHour ?? "—"}:00. No-show rate ${
            total > 0 ? ((noShow / total) * 100).toFixed(1) : "0"
          }%.`,
    confidence: total >= 50 ? "high" : total >= 10 ? "medium" : "low",
    source: "heuristic" as const,
  };

  const r = await chat(
    [
      {
        role: "system",
        content:
          "You are the Waitless analytics assistant. Given recent booking telemetry for a restaurant, output JSON: {\"summary\": string (under 220 chars), \"confidence\": \"low\"|\"medium\"|\"high\"}. Be concrete. JSON only.",
      },
      {
        role: "user",
        content: JSON.stringify({
          totalBookings: total,
          avgPartySize: avgParty,
          noShowRate: total > 0 ? noShow / total : 0,
          peakHourUtc: peakHour ? Number(peakHour) : null,
        }),
      },
    ],
    { temperature: 0.2, maxTokens: 200 },
  );

  if (!r.ok) return NextResponse.json(fallback);
  try {
    const parsed = JSON.parse(r.text);
    return NextResponse.json({
      summary: String(parsed.summary ?? fallback.summary).slice(0, 240),
      confidence: ["low", "medium", "high"].includes(parsed.confidence)
        ? parsed.confidence
        : fallback.confidence,
      source: "llm",
    });
  } catch {
    return NextResponse.json(fallback);
  }
}
