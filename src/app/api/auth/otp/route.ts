import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Phase 2 stub: phone OTP via Supabase Auth. Requires a configured SMS
// provider (Twilio / Vonage) on the Supabase project. Rate limiting is
// enforced by Supabase Auth by default.
const Send = z.object({
  phone: z.string().min(6).max(20),
});

const Verify = z.object({
  phone: z.string(),
  token: z.string().length(6),
});

export async function POST(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "send";
  const supabase = await createSupabaseServerClient();

  if (action === "send") {
    const parsed = Send.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }
    const { error } = await supabase.auth.signInWithOtp({
      phone: parsed.data.phone,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "verify") {
    const parsed = Verify.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const { error } = await supabase.auth.verifyOtp({
      phone: parsed.data.phone,
      token: parsed.data.token,
      type: "sms",
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
