import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UserRow } from "@/components/admin/UserRow";

export const dynamic = "force-dynamic";

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const { q, role } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("profiles")
    .select("id, email, full_name, role, disabled, total_bookings, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) {
    query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
  }
  if (role && ["diner", "admin", "venue_staff"].includes(role)) {
    query = query.eq("role", role as "diner" | "admin" | "venue_staff");
  }

  const { data: users } = await query;

  // Build an export link that mirrors the current filters.
  const exportParams = new URLSearchParams({ type: "users" });
  if (q) exportParams.set("q", q);
  if (role) exportParams.set("role", role);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <a
          href={`/api/admin/export?${exportParams.toString()}`}
          className="text-sm text-accent hover:underline"
        >
          Export CSV (filtered)
        </a>
      </div>
      <form className="mt-4 flex gap-2" action="/admin/users">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by email or name…"
          className="h-9 flex-1 rounded-md border border-border bg-card px-3 text-sm"
        />
        <select
          name="role"
          defaultValue={role ?? ""}
          className="h-9 rounded-md border border-border bg-card px-3 text-sm"
        >
          <option value="">All roles</option>
          <option value="diner">Diner</option>
          <option value="venue_staff">Venue staff</option>
          <option value="admin">Admin</option>
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Filter
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Bookings</th>
              <th className="px-4 py-2">Joined</th>
              <th className="px-4 py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(users ?? []).map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
            {users?.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No users match those filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
