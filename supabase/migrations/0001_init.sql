-- Waitless initial schema
-- Run order: this migration creates auth-adjacent tables, restaurants, tables,
-- time slots, bookings, waitlist, notifications, and audit logs, then wires RLS.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users) — holds app-level role + display info.
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('diner', 'admin', 'venue_staff');

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text,
  phone        text,
  role         public.user_role not null default 'diner',
  disabled     boolean not null default false,
  no_show_count int not null default 0,
  total_bookings int not null default 0,
  created_at   timestamptz not null default now()
);

create index profiles_role_idx on public.profiles(role);

-- Auto-create profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'diner'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Restaurants
-- ---------------------------------------------------------------------------
create table public.restaurants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  cuisine     text,
  description text,
  address     text not null,
  area        text,
  lat         double precision not null,
  lng         double precision not null,
  cover_image text,
  phone       text,
  opens_at    time not null default '12:00',
  closes_at   time not null default '23:00',
  deposit_threshold int not null default 6, -- party size at which deposit is enforced
  deposit_kwd numeric(8,3) not null default 5.000,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index restaurants_area_idx on public.restaurants(area);
create index restaurants_active_idx on public.restaurants(id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Tables (physical floor plan)
-- ---------------------------------------------------------------------------
create table public.restaurant_tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  label         text not null,            -- e.g. "T1"
  seats         int not null check (seats > 0),
  x             int not null default 0,   -- floor-plan coordinates
  y             int not null default 0,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, label)
);

-- ---------------------------------------------------------------------------
-- Time slots — pre-generated booking windows per restaurant.
-- ---------------------------------------------------------------------------
create table public.time_slots (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  start_time    timestamptz not null,
  end_time      timestamptz not null,
  capacity      int not null check (capacity > 0),
  booked_count  int not null default 0 check (booked_count >= 0),
  created_at    timestamptz not null default now(),
  unique (restaurant_id, start_time)
);

create index time_slots_restaurant_start_idx
  on public.time_slots(restaurant_id, start_time);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create type public.booking_status as enum (
  'pending_deposit', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'
);

create table public.bookings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  slot_id         uuid not null references public.time_slots(id) on delete restrict,
  table_id        uuid references public.restaurant_tables(id) on delete set null,
  party_size      int not null check (party_size > 0),
  status          public.booking_status not null default 'confirmed',
  risk_score      numeric(3,2),            -- 0.00 - 1.00, set by AI engine
  deposit_required boolean not null default false,
  deposit_paid_at timestamptz,
  reminder_sent_at timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index bookings_user_idx     on public.bookings(user_id);
create index bookings_slot_idx     on public.bookings(slot_id);
create index bookings_restaurant_idx on public.bookings(restaurant_id, status);

-- Atomic booking: increments slot count only if there's room.
-- Returns the new booking id, or raises if no capacity.
create or replace function public.book_slot(
  p_slot_id uuid,
  p_party_size int,
  p_table_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot record;
  v_restaurant uuid;
  v_threshold int;
  v_user uuid := auth.uid();
  v_booking_id uuid;
  v_deposit_required boolean := false;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Lock the slot row so concurrent bookings serialize on it.
  select * into v_slot from public.time_slots where id = p_slot_id for update;
  if not found then
    raise exception 'SLOT_NOT_FOUND';
  end if;
  if v_slot.booked_count + p_party_size > v_slot.capacity then
    raise exception 'SLOT_FULL';
  end if;

  v_restaurant := v_slot.restaurant_id;
  select deposit_threshold into v_threshold
    from public.restaurants where id = v_restaurant;
  if p_party_size >= v_threshold then
    v_deposit_required := true;
  end if;

  update public.time_slots
     set booked_count = booked_count + p_party_size
   where id = p_slot_id;

  insert into public.bookings (
    user_id, restaurant_id, slot_id, table_id, party_size,
    status, deposit_required
  ) values (
    v_user, v_restaurant, p_slot_id, p_table_id, p_party_size,
    case when v_deposit_required then 'pending_deposit'::booking_status
         else 'confirmed'::booking_status end,
    v_deposit_required
  )
  returning id into v_booking_id;

  update public.profiles
     set total_bookings = total_bookings + 1
   where id = v_user;

  return v_booking_id;
end;
$$;

-- Atomic cancel: decrements slot count and marks booking cancelled.
create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_user uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select role = 'admin' into v_is_admin from public.profiles where id = v_user;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.user_id <> v_user and not coalesce(v_is_admin, false) then
    raise exception 'FORBIDDEN';
  end if;
  if v_booking.status in ('cancelled', 'completed', 'no_show') then
    return;
  end if;

  update public.time_slots
     set booked_count = greatest(0, booked_count - v_booking.party_size)
   where id = v_booking.slot_id;

  update public.bookings
     set status = 'cancelled',
         cancelled_at = now()
   where id = p_booking_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Waitlist
-- ---------------------------------------------------------------------------
create table public.waitlist_entries (
  id          uuid primary key default gen_random_uuid(),
  slot_id     uuid not null references public.time_slots(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  party_size  int not null,
  position    int not null,
  notified_at timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (slot_id, user_id)
);

create index waitlist_slot_idx on public.waitlist_entries(slot_id, position);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  message    text not null,
  href       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx
  on public.notifications(user_id, read, created_at desc);

-- ---------------------------------------------------------------------------
-- Email log (for debugging Resend failures)
-- ---------------------------------------------------------------------------
create table public.email_log (
  id          bigserial primary key,
  to_email    text not null,
  subject     text not null,
  status      text not null,  -- 'sent', 'failed'
  error       text,
  provider_id text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Admin audit log
-- ---------------------------------------------------------------------------
create table public.admin_audit_log (
  id         bigserial primary key,
  admin_id   uuid not null references public.profiles(id) on delete set null,
  action     text not null,
  target_id  uuid,
  metadata   jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.restaurants         enable row level security;
alter table public.restaurant_tables   enable row level security;
alter table public.time_slots          enable row level security;
alter table public.bookings            enable row level security;
alter table public.waitlist_entries    enable row level security;
alter table public.notifications       enable row level security;
alter table public.email_log           enable row level security;
alter table public.admin_audit_log     enable row level security;

-- Helper: is current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Profiles: users read/update own row; admins read all.
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid() or public.is_admin());

-- Restaurants: anyone authenticated can read non-deleted; only admins write.
create policy restaurants_select on public.restaurants
  for select using (deleted_at is null or public.is_admin());
create policy restaurants_admin_write on public.restaurants
  for all using (public.is_admin()) with check (public.is_admin());

-- Tables: readable by anyone authenticated.
create policy tables_select on public.restaurant_tables
  for select using (true);
create policy tables_admin_write on public.restaurant_tables
  for all using (public.is_admin()) with check (public.is_admin());

-- Time slots: readable by anyone authenticated; writes via book_slot/cancel_booking.
create policy slots_select on public.time_slots
  for select using (true);
create policy slots_admin_write on public.time_slots
  for all using (public.is_admin()) with check (public.is_admin());

-- Bookings: users see own, admins see all. Inserts/updates go through SECURITY DEFINER
-- functions so we don't open up direct write policies for diners.
create policy bookings_select_own on public.bookings
  for select using (user_id = auth.uid() or public.is_admin());
create policy bookings_admin_write on public.bookings
  for all using (public.is_admin()) with check (public.is_admin());

-- Waitlist: users see own.
create policy waitlist_select_own on public.waitlist_entries
  for select using (user_id = auth.uid() or public.is_admin());
create policy waitlist_insert_own on public.waitlist_entries
  for insert with check (user_id = auth.uid());
create policy waitlist_delete_own on public.waitlist_entries
  for delete using (user_id = auth.uid() or public.is_admin());

-- Notifications: own only; service role bypasses for inserts.
create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid());

-- Email log + audit log: admins only.
create policy email_log_admin on public.email_log
  for select using (public.is_admin());
create policy audit_log_admin on public.admin_audit_log
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.time_slots;
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.notifications;
