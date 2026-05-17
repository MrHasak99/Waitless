import { format } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("admin_audit_log")
    .select("id, action, target_id, metadata, created_at, profiles!admin_id(email)")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as unknown as Array<{
    id: number;
    action: string;
    target_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    profiles: { email: string } | null;
  }>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Last 200 admin actions.
      </p>
      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Admin</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Target</th>
              <th className="px-4 py-2">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {format(new Date(r.created_at), "d MMM HH:mm:ss")}
                </td>
                <td className="px-4 py-2">{r.profiles?.email ?? "—"}</td>
                <td className="px-4 py-2">{r.action}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {r.target_id ?? "—"}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                  {JSON.stringify(r.metadata)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No actions logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
