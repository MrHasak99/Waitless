-- Waitless: switch table merges + seat borrows from admin-configured to
-- diner-purchased at booking time. Arrangements are now tied to a specific
-- booking and the diner pays a service fee for them.

-- ---------------------------------------------------------------------------
-- Per-restaurant fee config
-- ---------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists merge_fee_kwd       numeric(8,3) not null default 2.000,
  add column if not exists borrow_seat_fee_kwd numeric(8,3) not null default 0.500;

-- ---------------------------------------------------------------------------
-- Link arrangements to bookings
-- ---------------------------------------------------------------------------
alter table public.table_merges
  add column if not exists booking_id uuid references public.bookings(id) on delete cascade;
alter table public.seat_borrows
  add column if not exists booking_id uuid references public.bookings(id) on delete cascade;

-- Each booking can have at most one merge or one borrow (not both).
create unique index if not exists table_merges_booking_uidx
  on public.table_merges(booking_id) where booking_id is not null;
create unique index if not exists seat_borrows_booking_uidx
  on public.seat_borrows(booking_id) where booking_id is not null;

alter table public.bookings
  add column if not exists arrangement_fee_kwd numeric(8,3) not null default 0;

-- ---------------------------------------------------------------------------
-- Atomic: book + create merge in one transaction.
-- Validates: tables belong to slot's restaurant, none are part of another
-- arrangement for this slot, sum of seats meets party size, slot has capacity.
-- ---------------------------------------------------------------------------
create or replace function public.book_with_merge(
  p_slot_id uuid,
  p_party_size int,
  p_table_ids uuid[],
  p_fee_kwd numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_slot record;
  v_restaurant uuid;
  v_total_seats int;
  v_booking_id uuid;
  v_threshold int;
  v_deposit_required boolean := false;
  v_count int;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if array_length(p_table_ids, 1) < 2 then raise exception 'NEED_TWO_TABLES'; end if;

  select * into v_slot from public.time_slots where id = p_slot_id for update;
  if not found then raise exception 'SLOT_NOT_FOUND'; end if;
  if v_slot.booked_count + p_party_size > v_slot.capacity then
    raise exception 'SLOT_FULL';
  end if;
  v_restaurant := v_slot.restaurant_id;

  -- All tables must belong to this restaurant.
  select count(*) into v_count
  from public.restaurant_tables
  where id = any(p_table_ids) and restaurant_id = v_restaurant;
  if v_count <> array_length(p_table_ids, 1) then
    raise exception 'TABLES_NOT_IN_RESTAURANT';
  end if;

  -- None of the tables may already be in an arrangement for this slot.
  perform 1 from public.table_merges
   where slot_id = p_slot_id and table_ids && p_table_ids;
  if found then raise exception 'TABLE_ALREADY_MERGED'; end if;

  perform 1 from public.seat_borrows
   where slot_id = p_slot_id
     and (from_table_id = any(p_table_ids) or to_table_id = any(p_table_ids));
  if found then raise exception 'TABLE_IN_BORROW'; end if;

  -- Sum of base seats must cover the party.
  select coalesce(sum(seats), 0) into v_total_seats
  from public.restaurant_tables
  where id = any(p_table_ids);
  if v_total_seats < p_party_size then
    raise exception 'MERGE_TOO_SMALL';
  end if;

  -- Capacity gate passed; insert booking + arrangement.
  select deposit_threshold into v_threshold from public.restaurants where id = v_restaurant;
  if p_party_size >= v_threshold then v_deposit_required := true; end if;

  update public.time_slots set booked_count = booked_count + p_party_size where id = p_slot_id;

  insert into public.bookings (
    user_id, restaurant_id, slot_id, party_size, status,
    deposit_required, arrangement_fee_kwd
  ) values (
    v_user, v_restaurant, p_slot_id, p_party_size,
    case when v_deposit_required then 'pending_deposit'::booking_status
         else 'confirmed'::booking_status end,
    v_deposit_required,
    coalesce(p_fee_kwd, 0)
  ) returning id into v_booking_id;

  insert into public.table_merges (slot_id, table_ids, total_seats, booking_id)
  values (p_slot_id, p_table_ids, v_total_seats, v_booking_id);

  update public.profiles set total_bookings = total_bookings + 1 where id = v_user;
  return v_booking_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic: book + create borrow.
-- ---------------------------------------------------------------------------
create or replace function public.book_with_borrow(
  p_slot_id uuid,
  p_party_size int,
  p_to_table_id uuid,
  p_from_table_id uuid,
  p_seats int,
  p_fee_kwd numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_slot record;
  v_restaurant uuid;
  v_to_seats int;
  v_from_seats int;
  v_booking_id uuid;
  v_threshold int;
  v_deposit_required boolean := false;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_from_table_id = p_to_table_id then raise exception 'SAME_TABLE'; end if;
  if p_seats <= 0 then raise exception 'INVALID_SEATS'; end if;

  select * into v_slot from public.time_slots where id = p_slot_id for update;
  if not found then raise exception 'SLOT_NOT_FOUND'; end if;
  if v_slot.booked_count + p_party_size > v_slot.capacity then
    raise exception 'SLOT_FULL';
  end if;
  v_restaurant := v_slot.restaurant_id;

  select seats into v_to_seats from public.restaurant_tables
   where id = p_to_table_id and restaurant_id = v_restaurant;
  select seats into v_from_seats from public.restaurant_tables
   where id = p_from_table_id and restaurant_id = v_restaurant;
  if v_to_seats is null or v_from_seats is null then
    raise exception 'TABLE_NOT_IN_RESTAURANT';
  end if;

  -- Receiver's effective seats must cover the party.
  if v_to_seats + p_seats < p_party_size then
    raise exception 'BORROW_TOO_SMALL';
  end if;
  -- Lender must retain at least 1 seat after lending (otherwise just merge).
  if v_from_seats - p_seats < 1 then
    raise exception 'LENDER_DEPLETED';
  end if;

  -- Neither table may be in another arrangement for this slot.
  perform 1 from public.table_merges
   where slot_id = p_slot_id
     and (p_to_table_id = any(table_ids) or p_from_table_id = any(table_ids));
  if found then raise exception 'TABLE_ALREADY_MERGED'; end if;

  perform 1 from public.seat_borrows
   where slot_id = p_slot_id
     and (from_table_id in (p_from_table_id, p_to_table_id)
       or to_table_id   in (p_from_table_id, p_to_table_id));
  if found then raise exception 'TABLE_IN_BORROW'; end if;

  select deposit_threshold into v_threshold from public.restaurants where id = v_restaurant;
  if p_party_size >= v_threshold then v_deposit_required := true; end if;

  update public.time_slots set booked_count = booked_count + p_party_size where id = p_slot_id;

  insert into public.bookings (
    user_id, restaurant_id, slot_id, party_size, table_id, status,
    deposit_required, arrangement_fee_kwd
  ) values (
    v_user, v_restaurant, p_slot_id, p_party_size, p_to_table_id,
    case when v_deposit_required then 'pending_deposit'::booking_status
         else 'confirmed'::booking_status end,
    v_deposit_required,
    coalesce(p_fee_kwd, 0)
  ) returning id into v_booking_id;

  insert into public.seat_borrows
    (slot_id, from_table_id, to_table_id, seats, booking_id)
  values
    (p_slot_id, p_from_table_id, p_to_table_id, p_seats, v_booking_id);

  update public.profiles set total_bookings = total_bookings + 1 where id = v_user;
  return v_booking_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancel should also clean up the arrangement so the seats free up for others.
-- ---------------------------------------------------------------------------
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
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select role = 'admin' into v_is_admin from public.profiles where id = v_user;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.user_id <> v_user and not coalesce(v_is_admin, false) then
    raise exception 'FORBIDDEN';
  end if;
  if v_booking.status in ('cancelled', 'completed', 'no_show') then return; end if;

  update public.time_slots
     set booked_count = greatest(0, booked_count - v_booking.party_size)
   where id = v_booking.slot_id;

  update public.bookings
     set status = 'cancelled', cancelled_at = now()
   where id = p_booking_id;

  -- Cascade-clean any arrangement tied to this booking.
  delete from public.table_merges where booking_id = p_booking_id;
  delete from public.seat_borrows where booking_id = p_booking_id;
end;
$$;
