import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // 303 "See Other" forces the browser to GET the landing page instead of
  // re-POSTing it (which would 405). The default 307 preserves the method.
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
