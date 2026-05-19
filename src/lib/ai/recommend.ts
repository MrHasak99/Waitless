import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Restaurant } from "@/lib/supabase/types";
import { chat } from "./openrouter";

// Returns a list of restaurant IDs the user is most likely to enjoy.
// Falls back to "restaurants the user has booked before" if no LLM key.
export async function getRecommendedRestaurants(
  userId: string,
  restaurants: Restaurant[],
): Promise<string[]> {
  if (restaurants.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const [{ data: history }, { data: dismissed }] = await Promise.all([
    supabase
      .from("bookings")
      .select("restaurant_id, party_size, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("recommendation_dismissals")
      .select("restaurant_id")
      .eq("user_id", userId),
  ]);

  // Never recommend something the user explicitly marked "not interested".
  const dismissedSet = new Set(
    (dismissed ?? []).map((d) => d.restaurant_id),
  );
  const eligible = restaurants.filter((r) => !dismissedSet.has(r.id));
  if (eligible.length === 0) return [];

  if (!history || history.length === 0) {
    return eligible.slice(0, 2).map((r) => r.id);
  }

  const visited = new Set(history.map((b) => b.restaurant_id));
  const heuristic = eligible
    .filter((r) => visited.has(r.id))
    .map((r) => r.id)
    .slice(0, 3);

  const r = await chat(
    [
      {
        role: "system",
        content:
          "You recommend restaurants for a Kuwait diner. Return JSON: {\"ids\": string[]} — pick up to 3 restaurant ids the user is most likely to enjoy. JSON only.",
      },
      {
        role: "user",
        content: JSON.stringify({
          history: history.map((b) => ({
            restaurant_id: b.restaurant_id,
            party_size: b.party_size,
            status: b.status,
          })),
          candidates: eligible.map((r) => ({
            id: r.id,
            name: r.name,
            cuisine: r.cuisine,
            area: r.area,
          })),
        }),
      },
    ],
    { temperature: 0.3, maxTokens: 200 },
  );

  if (!r.ok) return heuristic;
  try {
    const parsed = JSON.parse(r.text) as { ids?: string[] };
    const ids = (parsed.ids ?? []).filter(
      (id) => eligible.some((c) => c.id === id) && !dismissedSet.has(id),
    );
    return ids.length > 0 ? ids.slice(0, 3) : heuristic;
  } catch {
    return heuristic;
  }
}
