-- Waitless: per-table policy for merges + borrows.
-- The admin's job is to set policy, not to run the floor. These flags
-- control whether the diner-facing suggestion engine is allowed to propose
-- merging or borrowing involving a given table.

-- ---------------------------------------------------------------------------
-- New per-table flags
-- ---------------------------------------------------------------------------
alter table public.restaurant_tables
  add column if not exists is_mergeable        boolean not null default false,
  add column if not exists can_lend_seats      boolean not null default false,
  add column if not exists max_lendable_seats  int     not null default 0
    check (max_lendable_seats >= 0),
  add column if not exists adjacent_table_ids  uuid[]  not null default '{}'::uuid[];

-- Hard floor: every base table must have at least 2 seats. This makes the
-- "lender keeps ≥2 effective seats" guarantee enforceable at borrow time.
alter table public.restaurant_tables
  drop constraint if exists restaurant_tables_min_seats;
alter table public.restaurant_tables
  add constraint restaurant_tables_min_seats check (seats >= 2);

-- ---------------------------------------------------------------------------
-- Updated book_with_merge: only mergeable tables, all pairs must be adjacent.
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

  -- All tables must be flagged mergeable.
  select count(*) into v_count
  from public.restaurant_tables
  where id = any(p_table_ids) and is_mergeable;
  if v_count <> array_length(p_table_ids, 1) then
    raise exception 'TABLE_NOT_MERGEABLE';
  end if;

  -- Every pair in the merge must be mutually adjacent. We check by ensuring
  -- that for each table in the group, all the *other* tables in the group
  -- are listed in its adjacent_table_ids.
  perform 1
  from public.restaurant_tables rt
  where rt.id = any(p_table_ids)
    and not (
      (array(select unnest(p_table_ids) except select rt.id))::uuid[]
        <@ rt.adjacent_table_ids
    );
  if found then raise exception 'TABLES_NOT_ADJACENT'; end if;

  -- Same anti-overlap checks as before.
  perform 1 from public.table_merges
   where slot_id = p_slot_id and table_ids && p_table_ids;
  if found then raise exception 'TABLE_ALREADY_MERGED'; end if;
  perform 1 from public.seat_borrows
   where slot_id = p_slot_id
     and (from_table_id = any(p_table_ids) or to_table_id = any(p_table_ids));
  if found then raise exception 'TABLE_IN_BORROW'; end if;

  select coalesce(sum(seats), 0) into v_total_seats
  from public.restaurant_tables
  where id = any(p_table_ids);
  if v_total_seats < p_party_size then
    raise exception 'MERGE_TOO_SMALL';
  end if;

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
-- Updated book_with_borrow: lender must allow lending, respect cap, and keep
-- at least 2 effective seats after lending.
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
  v_to record;
  v_from record;
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

  select * into v_to from public.restaurant_tables
   where id = p_to_table_id and restaurant_id = v_restaurant;
  select * into v_from from public.restaurant_tables
   where id = p_from_table_id and restaurant_id = v_restaurant;
  if v_to is null or v_from is null then
    raise exception 'TABLE_NOT_IN_RESTAURANT';
  end if;

  -- Lender policy gates.
  if not v_from.can_lend_seats then raise exception 'TABLE_CANT_LEND'; end if;
  if p_seats > v_from.max_lendable_seats then raise exception 'EXCEEDS_LEND_CAP'; end if;

  -- 2-seat floor on the lender post-lending.
  if v_from.seats - p_seats < 2 then raise exception 'LENDER_BELOW_MIN'; end if;

  -- Receiver must end up with enough seats to host the party.
  if v_to.seats + p_seats < p_party_size then
    raise exception 'BORROW_TOO_SMALL';
  end if;

  -- Anti-overlap checks (unchanged).
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
