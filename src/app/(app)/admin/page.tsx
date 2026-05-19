import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SignupBookingChart } from "@/components/admin/Charts";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const supabase = await createSupabaseServerClient();

  const now = new Date();
  const sevenDays = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const thirtyDays = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();

  const [{ count: totalUsers }, { count: newUsers }, { count: activeBookings }, { data: signupRows }, { data: bookingRows }, { data: activeIds }] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sevenDays),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .gte("created_at", thirtyDays),
      supabase
        .from("profiles")
        .select("created_at")
        .gte("created_at", thirtyDays),
      supabase
        .from("bookings")
        .select("created_at")
        .gte("created_at", thirtyDays),
      supabase
        .from("bookings")
        .select("user_id")
        .gte("created_at", thirtyDays),
    ]);

  const activeUsers = new Set((activeIds ?? []).map((b) => b.user_id)).size;

  // Bucket signups + bookings per day for the last 30 days.
  const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
  const series = new Map<string, { signups: number; bookings: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    series.set(d, { signups: 0, bookings: 0 });
  }
  for (const r of signupRows ?? []) {
    const k = dayKey(r.created_at);
    const bucket = series.get(k);
    if (bucket) bucket.signups += 1;
  }
  for (const r of bookingRows ?? []) {
    const k = dayKey(r.created_at);
    const bucket = series.get(k);
    if (bucket) bucket.bookings += 1;
  }
  const chartData = Array.from(series.entries()).map(([date, v]) => ({
    date,
    ...v,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin overview</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin/users" className="text-accent hover:underline">
            Users
          </Link>
          <Link
            href="/admin/restaurants"
            className="text-accent hover:underline"
          >
            Restaurants
          </Link>
          <Link href="/admin/audit" className="text-accent hover:underline">
            Audit log
          </Link>
        </nav>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total users" value={totalUsers ?? 0} />
        <Stat label="New signups (7d)" value={newUsers ?? 0} />
        <Stat label="Active users (30d)" value={activeUsers} />
        <Stat label="Bookings (30d)" value={activeBookings ?? 0} />
      </div>

      <div className="mt-6">
        <SignupBookingChart data={chartData} />
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Data refreshes on every page load. Use{" "}
        <a
          href="/api/admin/export?type=bookings"
          className="text-accent hover:underline"
        >
          export bookings CSV
        </a>{" "}
        or{" "}
        <a
          href="/api/admin/export?type=users"
          className="text-accent hover:underline"
        >
          export users CSV
        </a>{" "}
        to dig deeper.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}
