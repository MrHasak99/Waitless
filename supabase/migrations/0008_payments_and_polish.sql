-- Waitless: payment tracking on bookings, dismissed AI recommendations, and
-- a notification-preferences row per profile.

-- ---------------------------------------------------------------------------
-- Payment tracking on bookings
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists payment_id          text,
  add column if not exists payment_amount_kwd  numeric(8,3),
  add column if not exists paid_at             timestamptz;

create index if not exists bookings_paid_idx
  on public.bookings(payment_id) where payment_id is not null;

-- ---------------------------------------------------------------------------
-- Dismissed restaurant recommendations
-- ---------------------------------------------------------------------------
create table if not exists public.recommendation_dismissals (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);

alter table public.recommendation_dismissals enable row level security;
drop policy if exists rec_dismissals_select_own on public.recommendation_dismissals;
create policy rec_dismissals_select_own on public.recommendation_dismissals
  for select using (user_id = auth.uid());
drop policy if exists rec_dismissals_insert_own on public.recommendation_dismissals;
create policy rec_dismissals_insert_own on public.recommendation_dismissals
  for insert with check (user_id = auth.uid());
drop policy if exists rec_dismissals_delete_own on public.recommendation_dismissals;
create policy rec_dismissals_delete_own on public.recommendation_dismissals
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Notification preferences on profile
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists email_opt_in boolean not null default true;
