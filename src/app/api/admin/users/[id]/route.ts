import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, recordAuditAction } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const Patch = z.object({
  disabled: z.boolean().optional(),
  role: z.enum(["diner", "admin", "venue_staff"]).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: guard.status });
  }

  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("profiles")
    .update(parsed.data)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await recordAuditAction(guard.user.id, "update_profile", id, parsed.data);
  return NextResponse.json({ ok: true });
}
