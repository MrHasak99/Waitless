import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotificationBell } from "@/components/NotificationBell";
import { Button } from "@/components/ui/Button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-lg font-semibold tracking-tight"
            >
              Waitless
            </Link>
            <nav className="hidden gap-4 text-sm md:flex">
              <Link
                href="/dashboard"
                className="text-foreground/80 hover:text-foreground"
              >
                Discover
              </Link>
              <Link
                href="/bookings"
                className="text-foreground/80 hover:text-foreground"
              >
                My bookings
              </Link>
              {profile?.role === "admin" && (
                <Link
                  href="/admin"
                  className="text-accent hover:text-accent/80"
                >
                  Admin
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <form action="/api/auth/sign-out" method="post">
              <Button type="submit" size="sm" variant="ghost">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
