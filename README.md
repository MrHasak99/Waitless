# Waitless

Live restaurant availability + instant booking for Kuwait. Built on Next.js 16,
Supabase, and an OpenRouter-powered predictive capacity engine.

## Stack

- **Frontend** — Next.js 16 (App Router) + React 19 + Tailwind 4
- **Database / Auth / Realtime** — Supabase (Postgres + RLS + Realtime)
- **AI** — OpenRouter (capacity engine, recommendations, predictive analytics)
- **Email** — Resend (welcome, booking confirmation, 24h reminders)
- **Maps** — Leaflet + OpenStreetMap tiles
- **Payments** — MyFatoorah / Tap (not wired in MVP — deposit flow stubs the gateway)

## Local setup

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env.local
# fill in Supabase + OpenRouter + Resend keys

# 3. Apply DB schema + seed
# Either via the Supabase CLI:
supabase db push
# or paste supabase/migrations/0001_init.sql and 0002_seed.sql into the SQL editor.

# 4. Promote yourself to admin (one-off, via SQL editor):
update public.profiles set role = 'admin' where email = 'you@example.com';

# 5. Run
npm run dev
```

App boots at <http://localhost:3000>.

## What's wired up (MVP)

| User story                | Where it lives                                              |
|---------------------------|-------------------------------------------------------------|
| Admin role + gate         | `src/middleware.ts`, `0001_init.sql` (`is_admin()`)         |
| Live data updates         | `SlotPicker.tsx`, `NotificationBell.tsx` (Realtime channel) |
| Map display + pins        | `RestaurantMap.tsx`                                         |
| Distance + sort           | `lib/distance.ts`, `DiscoverClient.tsx`                     |
| In-app notifications      | `NotificationBell.tsx`, `notifications` table               |
| Transactional emails      | `lib/email/send.ts` (Resend)                                |
| Email notifications       | Welcome, confirmation, 24h reminder via `cron/reminders`    |
| Personalized recs         | `lib/ai/recommend.ts` (OpenRouter, heuristic fallback)      |
| Admin user mgmt           | `/admin/users`                                              |
| Admin content mgmt        | `/admin/restaurants` (soft-delete via `deleted_at`)         |
| Analytics dashboard       | `/admin`                                                    |
| Time slot booking         | `/restaurants/[id]` + `book_slot()` Postgres RPC            |
| Capacity limits           | Slot states: available / almost-full / full                 |
| Booking reminders         | `vercel.json` cron → `/api/cron/reminders`                  |
| AI capacity engine        | `lib/ai/capacity.ts` (risk + deposit decisions)             |

## Phase 2 stubs (ready to extend)

- **Phone OTP** — `POST /api/auth/otp?action=send|verify` (needs SMS provider on Supabase Auth).
- **Predictive analytics** — `GET /api/ai/predict?restaurantId=…`.
- **CSV export** — `GET /api/admin/export?type=bookings|users|restaurants`.
- **Waitlist** — `POST /api/waitlist` + notify-first-on-cancel in `bookings/[id]/cancel`.

## Architectural notes

- All writes to `bookings` go through `book_slot()` / `cancel_booking()` so capacity
  is enforced atomically under `FOR UPDATE` row locks — no double-booking even
  with concurrent requests.
- The middleware (`src/middleware.ts`) refreshes the Supabase session cookie on
  every request and gates `/admin/*` with a DB role check.
- The AI capacity engine has a deterministic heuristic baseline so the app
  works fully without OpenRouter credentials.
- The service-role Supabase client is **server-only**. It's used in route handlers
  to insert notifications and run admin queries that bypass RLS.

## What's intentionally not built

- Payment gateway integration (MyFatoorah / Tap) — booking flow records that a
  deposit is required, but the actual payment redirect is left as a TODO.
- Venue-staff floor plan UI (the schema supports it via the `venue_staff` role).
- Sentry / GA wiring — add via `@sentry/nextjs` and a `<Script>` tag in the
  root layout.
