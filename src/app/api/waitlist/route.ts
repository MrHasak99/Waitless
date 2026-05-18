import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

const Body = z.object({
  slotId: z.string().uuid(),
  partySize: z.number().int().min(1).max(20),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();

  // If the diner is already on the waitlist for this slot, return that
  // entry — idempotent so the UI can call freely.
  const { data: existing } = await service
    .from("waitlist_entries")
    .select("id, position, party_size")
    .eq("slot_id", parsed.data.slotId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      ok: true,
      position: existing.position,
      alreadyJoined: true,
    });
  }

  const { count } = await service
    .from("waitlist_entries")
    .select("id", { count: "exact", head: true })
    .eq("slot_id", parsed.data.slotId);

  const { data, error } = await service
    .from("waitlist_entries")
    .insert({
      slot_id: parsed.data.slotId,
      user_id: user.id,
      party_size: parsed.data.partySize,
      position: (count ?? 0) + 1,
    })
    .select("id, position")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await service.from("notifications").insert({
    user_id: user.id,
    title: "Added to waitlist",
    message: `Position #${data.position}. We'll alert you if a seat opens.`,
    href: `/bookings`,
  });

  return NextResponse.json({
    ok: true,
    position: data.position,
    alreadyJoined: false,
  });
}
