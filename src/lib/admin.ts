import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, user: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false as const, status: 403, user: null };
  }
  return { ok: true as const, status: 200, user };
}

export async function recordAuditAction(
  adminId: string,
  action: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const service = createSupabaseServiceClient();
  await service.from("admin_audit_log").insert({
    admin_id: adminId,
    action,
    target_id: targetId,
    metadata,
  });
}
