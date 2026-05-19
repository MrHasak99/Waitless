import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const ALLOWED = new Set(["bookings", "users", "restaurants"]);

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: guard.status });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "bookings";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const role = url.searchParams.get("role")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";

  if (!ALLOWED.has(type)) {
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  let rows: Record<string, unknown>[] = [];

  if (type === "bookings") {
    let qry = service
      .from("bookings")
      .select(
        "id, user_id, restaurant_id, party_size, status, risk_score, deposit_required, paid_at, arrangement_fee_kwd, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10000);
    if (status && ["confirmed", "pending_deposit", "cancelled", "no_show", "completed", "seated"].includes(status)) {
      qry = qry.eq("status", status);
    }
    const { data } = await qry;
    rows = data ?? [];
  } else if (type === "users") {
    let qry = service
      .from("profiles")
      .select(
        "id, email, full_name, role, disabled, total_bookings, no_show_count, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10000);
    if (q) {
      qry = qry.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
    }
    if (role && ["diner", "admin", "venue_staff"].includes(role)) {
      qry = qry.eq("role", role as "diner" | "admin" | "venue_staff");
    }
    const { data } = await qry;
    rows = data ?? [];
  } else {
    const { data } = await service
      .from("restaurants")
      .select(
        "id, name, cuisine, area, address, lat, lng, deposit_threshold, deposit_kwd, merge_fee_kwd, borrow_seat_fee_kwd, deleted_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10000);
    rows = data ?? [];
  }

  const csv = toCsv(rows);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = [q, role, status].filter(Boolean).join("-");
  const filename = `${type}${suffix ? `-${suffix}` : ""}-${stamp}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
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
