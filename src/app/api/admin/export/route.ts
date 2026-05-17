import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const ALLOWED = new Set(["bookings", "users", "restaurants"]);

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: guard.status });
  }
  const type = new URL(req.url).searchParams.get("type") ?? "bookings";
  if (!ALLOWED.has(type)) {
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  let rows: Record<string, unknown>[] = [];

  if (type === "bookings") {
    const { data } = await service
      .from("bookings")
      .select(
        "id, user_id, restaurant_id, party_size, status, risk_score, deposit_required, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10000);
    rows = data ?? [];
  } else if (type === "users") {
    const { data } = await service
      .from("profiles")
      .select(
        "id, email, full_name, role, disabled, total_bookings, no_show_count, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10000);
    rows = data ?? [];
  } else {
    const { data } = await service
      .from("restaurants")
      .select(
        "id, name, cuisine, area, address, lat, lng, deposit_threshold, deposit_kwd, deleted_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10000);
    rows = data ?? [];
  }

  const csv = toCsv(rows);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-${stamp}.csv"`,
    },
  });
}

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const body = rows.map((r) => headers.map((h) => escape(r[h])).join(","));
  return [headers.join(","), ...body].join("\n");
}
