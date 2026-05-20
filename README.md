# Waitless

Live restaurant availability + instant booking for Kuwait. Next.js 16 +
Supabase + OpenRouter, with table-aware booking, paid merge/borrow upsells,
and a closed waitlist loop.

Live: <https://waitless.hamadalkhalaf.com>

## Stack

- **Frontend** — Next.js 16 (App Router) + React 19 + Tailwind 4
- **Database / Auth / Realtime** — Supabase (Postgres + RLS + Realtime)
- **AI** — OpenRouter (capacity engine, recommendations, predictive analytics) — falls back to a deterministic heuristic if no key is configured
- **Email** — Resend (welcome, booking confirmation, daily reminder)
- **Payments** — MyFatoorah (sandbox by default; swap base URL + token for production)
- **Maps** — Leaflet + OpenStreetMap tiles + marker clustering + cuisine-tinted pins
- **Monitoring** — Sentry (server + edge + client instrumentation) and Google Analytics 4 (env-gated)

## Local setup

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env.local
# Fill in your Supabase URL + anon + service role keys. Everything else is
# optional; the app degrades gracefully when OpenRouter / Resend / Sentry
# keys are absent.

# 3. Apply DB schema + seed in the Supabase SQL editor, in order:
#    supabase/migrations/0001_init.sql           — tables, RLS, RPCs
#    supabase/migrations/0002_seed.sql           — 4 Kuwait restaurants + 14d slots
#    supabase/migrations/0003_table_arrangements.sql
#    supabase/migrations/0004_arrangement_fees.sql
#    supabase/migrations/0005_table_policy.sql
#    supabase/migrations/0006_auto_capacity.sql
#    supabase/migrations/0007_table_aware_booking.sql
#    supabase/migrations/0008_payments_and_polish.sql

# 4. Promote yourself to admin (one-off, via SQL editor):
update public.profiles set role = 'admin' where email = 'you@example.com';

# 5. Run
npm run dev
```

App boots at <http://localhost:3000>.

## What's wired

| Capability                       | Lives at                                                                    |
|----------------------------------|-----------------------------------------------------------------------------|
| Auth (email/password + OTP stub) | Supabase Auth + `src/proxy.ts` (session refresh + admin gate)               |
| Live updates                     | Realtime channels in `SlotPicker.tsx`, `NotificationBell.tsx`               |
| Map + clustered cuisine pins     | `RestaurantMap.tsx` with `react-leaflet-cluster`                            |
| Distance + km/mi toggle          | `lib/distance.ts`, `DiscoverClient.tsx`                                     |
| Personalized recs + dismiss      | `lib/ai/recommend.ts` + `recommendation_dismissals` table                   |
| In-app notifications + bell      | `NotificationBell.tsx`, `notifications` table, "Mark all as read"           |
| Transactional email              | `lib/email/send.ts` — welcome / confirmation / daily reminder, opt-out aware|
| Settings (email opt-in)          | `/settings/notifications` toggles `profiles.email_opt_in`                   |
| Time slot booking (table-aware)  | `book_slot()` claims a specific physical table; falls back to merge/borrow  |
| Merge + borrow at booking        | Diner-paid upsell, per-restaurant fee config, `book_with_merge/borrow` RPCs |
| Auto-derived slot capacity       | Trigger on `restaurant_tables` syncs all upcoming slots                     |
| Waitlist (join → notify → claim) | `/api/waitlist/*` + `/bookings` "My waitlist" section, 24h claim window     |
| Admin user mgmt + role change    | `/admin/users` — search, role select, deactivate, audit                     |
| Admin restaurant CRUD            | `/admin/restaurants` (list + create) + `/admin/restaurants/[id]`            |
| Floor plan grid editor           | `FloorPlanEditor.tsx` — drag + center-snap + chair-footprint collision check|
| Admin analytics + chart          | `/admin` stat cards + Recharts area chart (30d signups vs bookings)         |
| CSV export (filtered)            | `/api/admin/export` respects search + role + status filters                 |
| MyFatoorah payment               | `lib/payments/myfatoorah.ts` + `/api/payments/initiate` + `/callback`       |
| Daily booking reminder cron      | `vercel.json` → 12:00 UTC daily, 12–36h booking window                      |
| AI capacity engine               | `lib/ai/capacity.ts` — risk + deposit + wait estimate (heuristic baseline)  |
| Predictive analytics (admin)     | `GET /api/ai/predict?restaurantId=…`                                        |
| Sentry + GA                      | `src/instrumentation*.ts`, `sentry.*.config.ts`, `components/Analytics.tsx` |

## Booking model

Every booking claims a specific physical table (`bookings.table_id`) or
arrangement. The suggestion engine (`lib/booking/suggest.ts`) considers:

- Tables already held by active bookings on that slot
- Tables locked in existing merges or borrows
- Per-table policy (`is_mergeable`, `can_lend_seats`, `max_lendable_seats`, `adjacent_table_ids`)
- Hard floor: every table keeps ≥ 2 effective seats after any lend

If a single table fits, `book_slot()` auto-assigns the tightest fit. If not,
the diner picks a merge or borrow option and pays the configured fee at
booking time (or via MyFatoorah for the deposit + fee). Waitlist claims
follow the same fallback chain.

## Architectural notes

- Capacity is enforced atomically. `book_slot()`, `book_with_merge()`, and
  `book_with_borrow()` all lock the slot row with `FOR UPDATE`, validate
  table availability against other bookings/merges/borrows, and either
  commit or raise — no double-booking even under concurrent claims.
- `proxy.ts` (Next 16's renamed middleware) refreshes the Supabase session
  cookie on every request and gates `/admin/*` with a DB role check.
- The service-role Supabase client is **server-only**. It's used in route
  handlers to insert notifications and run admin queries that bypass RLS.
- The AI capacity engine has a deterministic heuristic baseline; OpenRouter
  is consulted only to tighten the reason text and adjust the score band.
- Adjacency edits auto-mirror on the neighbor side so admins only mark
  adjacency once.

## Deploying

The production deployment lives at <https://waitless.hamadalkhalaf.com>. To
deploy fresh:

```bash
vercel link --project waitless
# Push env from .env.local
while IFS='=' read -r k v; do
  [[ -z "$k" || "$k" == \#* || -z "$v" ]] && continue
  printf '%s' "$v" | vercel env add "$k" production --force
done < .env.local
vercel deploy --prod
```

After the first deploy, set `NEXT_PUBLIC_APP_URL` to the assigned domain and
add that domain to **Supabase → Authentication → URL Configuration** (Site
URL + Redirect URLs) so email confirmation links resolve correctly.

The Vercel cron runs once daily at 12:00 UTC (Hobby plan limit). To
restore the original hourly cadence after upgrading to Pro, change the
schedule in `vercel.json` back to `"0 * * * *"` and narrow the reminder
window in `src/app/api/cron/reminders/route.ts`.

## What's intentionally not built

- **Production payment swap** — MyFatoorah sandbox is live; flip
  `MYFATOORAH_BASE_URL` to `https://api.myfatoorah.com` and the API key to
  a production token to go real-money.
- **Venue-staff floor plan UI** — the schema supports the `venue_staff`
  role but there's no dedicated UI yet (staff use the admin views).
- **Phone OTP UI** — backend route exists at `/api/auth/otp` but no
  sign-in page invokes it. Requires a Supabase SMS provider config too.
