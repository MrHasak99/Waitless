import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { suggestForSlot } from "@/lib/booking/eligibility";

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

  const result = await suggestForSlot(
    supabase,
    parsed.data.slotId,
    parsed.data.partySize,
  );
  if (result.status === "slot_missing") {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
