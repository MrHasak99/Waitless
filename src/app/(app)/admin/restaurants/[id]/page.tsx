import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RestaurantInfoForm } from "@/components/admin/RestaurantInfoForm";
import { TablesManager } from "@/components/admin/TablesManager";
import { SlotsManager } from "@/components/admin/SlotsManager";
import { BookingsManager } from "@/components/admin/BookingsManager";

export const dynamic = "force-dynamic";

export default async function AdminRestaurantDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: restaurant }, { data: tables }, { data: slots }, { data: bookings }] =
    await Promise.all([
      supabase.from("restaurants").select("*").eq("id", id).single(),
      supabase
        .from("restaurant_tables")
        .select("*")
        .eq("restaurant_id", id)
        .order("label"),
      supabase
        .from("time_slots")
        .select("id, start_time, end_time, capacity, booked_count")
        .eq("restaurant_id", id)
        .gte("start_time", new Date().toISOString())
        .order("start_time")
        .limit(500),
      supabase
        .from("bookings")
        .select(
          "id, party_size, status, created_at, profiles!user_id(email, full_name), time_slots!slot_id(start_time)",
        )
        .eq("restaurant_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  if (!restaurant) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 text-xs">
        <Link
          href="/admin/restaurants"
          className="text-muted-foreground hover:text-foreground"
        >
          ← All restaurants
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">{restaurant.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage restaurant info, tables, time slots, and bookings.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Restaurant info
        </h2>
        <RestaurantInfoForm restaurant={restaurant} />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Tables ({tables?.length ?? 0})
        </h2>
        <TablesManager restaurantId={id} initialTables={tables ?? []} />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Upcoming time slots ({slots?.length ?? 0})
        </h2>
        <SlotsManager restaurantId={id} initialSlots={slots ?? []} />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent bookings ({bookings?.length ?? 0})
        </h2>
        <BookingsManager
          restaurantId={id}
          initialBookings={(bookings ?? []) as unknown as Parameters<
            typeof BookingsManager
          >[0]["initialBookings"]}
        />
      </section>
    </div>
  );
}
