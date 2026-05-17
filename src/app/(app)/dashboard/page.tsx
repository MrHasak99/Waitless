import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DiscoverClient } from "@/components/DiscoverClient";
import { getRecommendedRestaurants } from "@/lib/ai/recommend";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select(
      "id, name, cuisine, description, address, area, lat, lng, cover_image, phone, opens_at, closes_at, deposit_threshold, deposit_kwd, merge_fee_kwd, borrow_seat_fee_kwd, deleted_at, created_at",
    )
    .is("deleted_at", null)
    .order("name");

  const recommendedIds = user
    ? await getRecommendedRestaurants(user.id, restaurants ?? [])
    : [];

  return (
    <DiscoverClient
      restaurants={restaurants ?? []}
      recommendedIds={recommendedIds}
    />
  );
}
