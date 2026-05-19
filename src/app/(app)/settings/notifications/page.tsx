import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmailOptInToggle } from "@/components/EmailOptInToggle";

export const dynamic = "force-dynamic";

export default async function NotificationsSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, email_opt_in")
    .eq("id", user.id)
    .single();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Notification settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Control which Waitless emails land in your inbox at{" "}
        <strong>{profile?.email}</strong>.
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <EmailOptInToggle
          initial={profile?.email_opt_in ?? true}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          Disabling this stops welcome, confirmation, and reminder emails.
          In-app notifications still work.
        </p>
      </div>
    </div>
  );
}
