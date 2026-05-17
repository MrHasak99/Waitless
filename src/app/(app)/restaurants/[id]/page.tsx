import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FloorPlan } from "@/components/FloorPlan";
import { SlotPicker } from "@/components/SlotPicker";

export const dynamic = "force-dynamic";

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (!restaurant) notFound();

  const { data: tables } = await supabase
    .from("restaurant_tables")
    .select("*")
    .eq("restaurant_id", id)
    .order("label");

  const { data: slots } = await supabase
    .from("time_slots")
    .select("*")
    .eq("restaurant_id", id)
    .gte("start_time", new Date().toISOString())
    .order("start_time");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          {restaurant.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {restaurant.cuisine} · {restaurant.area} · Opens{" "}
          {restaurant.opens_at} — {restaurant.closes_at}
        </p>
        {restaurant.description && (
          <p className="mt-3 max-w-2xl text-sm">{restaurant.description}</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Floor plan
          </h2>
          <FloorPlan tables={tables ?? []} />
          <p className="mt-3 text-xs text-muted-foreground">
            Tables update live as the floor team marks them seated and cleared.
          </p>
        </section>
        <aside>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Pick your slot
          </h2>
          <SlotPicker
            restaurantId={restaurant.id}
            depositThreshold={restaurant.deposit_threshold}
            depositKwd={Number(restaurant.deposit_kwd)}
            initialSlots={slots ?? []}
          />
        </aside>
      </div>
    </div>
  );
}
