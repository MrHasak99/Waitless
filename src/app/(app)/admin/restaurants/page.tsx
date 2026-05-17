import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DeleteRestaurantButton } from "@/components/admin/DeleteRestaurantButton";

export const dynamic = "force-dynamic";

export default async function AdminRestaurants() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("restaurants")
    .select("id, name, cuisine, area, deleted_at, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Restaurants</h1>
        <Link
          href="/admin/restaurants/new"
          className="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-foreground"
        >
          Add restaurant
        </Link>
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Cuisine</th>
              <th className="px-4 py-2">Area</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data ?? []).map((r) => (
              <tr key={r.id} className={r.deleted_at ? "opacity-50" : ""}>
                <td className="px-4 py-2 font-medium">
                  <Link
                    href={`/admin/restaurants/${r.id}`}
                    className="hover:text-accent hover:underline"
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{r.cuisine ?? "—"}</td>
                <td className="px-4 py-2">{r.area ?? "—"}</td>
                <td className="px-4 py-2">
                  {r.deleted_at ? "Hidden" : "Visible"}
                </td>
                <td className="space-x-3 px-4 py-2 text-right">
                  <Link
                    href={`/admin/restaurants/${r.id}`}
                    className="text-xs text-accent hover:underline"
                  >
                    Manage
                  </Link>
                  <DeleteRestaurantButton
                    id={r.id}
                    isDeleted={!!r.deleted_at}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
