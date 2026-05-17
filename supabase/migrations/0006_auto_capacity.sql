-- Waitless: time_slots.capacity is now auto-derived from the sum of
-- restaurant_tables.seats. Admins manage tables; capacity follows.

-- ---------------------------------------------------------------------------
-- Helper: total seats for a restaurant.
-- ---------------------------------------------------------------------------
create or replace function public.restaurant_total_seats(p_restaurant uuid)
returns int
language sql
stable
as $$
  select coalesce(sum(seats), 0)::int
  from public.restaurant_tables
  where restaurant_id = p_restaurant;
$$;

-- ---------------------------------------------------------------------------
-- BEFORE INSERT on time_slots: always set capacity from current tables.
-- Whatever the caller passes is ignored.
-- ---------------------------------------------------------------------------
create or replace function public.set_slot_capacity()
returns trigger
language plpgsql
as $$
begin
  new.capacity := public.restaurant_total_seats(new.restaurant_id);
  return new;
end;
$$;

drop trigger if exists time_slots_auto_capacity on public.time_slots;
create trigger time_slots_auto_capacity
  before insert on public.time_slots
  for each row execute function public.set_slot_capacity();

-- ---------------------------------------------------------------------------
-- AFTER change on restaurant_tables: recompute capacity for all current and
-- future slots of the affected restaurant. Past slots stay frozen.
-- If any non-past slot would end up with booked_count > new capacity, raise
-- so the table change is rolled back.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_restaurant_capacity()
returns trigger
language plpgsql
as $$
declare
  v_restaurant uuid;
  v_new_capacity int;
  v_violation record;
begin
  -- Determine which restaurant was touched (works for INSERT/UPDATE/DELETE).
  v_restaurant := coalesce(
    case tg_op when 'DELETE' then old.restaurant_id else new.restaurant_id end,
    case tg_op when 'DELETE' then null else old.restaurant_id end
  );
  if v_restaurant is null then return null; end if;

  v_new_capacity := public.restaurant_total_seats(v_restaurant);

  -- Block changes that would over-subscribe an existing slot.
  select id, booked_count, start_time
    into v_violation
    from public.time_slots
   where restaurant_id = v_restaurant
     and end_time > now()
     and booked_count > v_new_capacity
   limit 1;
  if found then
    raise exception
      'CAPACITY_BELOW_BOOKED: slot at % already has % bookings; would not fit in new capacity of %',
      v_violation.start_time, v_violation.booked_count, v_new_capacity;
  end if;

  -- Sync forward-looking slots. Past slots are immutable history.
  update public.time_slots
     set capacity = v_new_capacity
   where restaurant_id = v_restaurant
     and end_time > now();

  return null;
end;
$$;

-- Fire on INSERT/DELETE always, and on UPDATE only when seats or
-- restaurant_id changed (the only fields that affect total capacity).
drop trigger if exists restaurant_tables_capacity_sync_ins on public.restaurant_tables;
create trigger restaurant_tables_capacity_sync_ins
  after insert on public.restaurant_tables
  for each row execute function public.refresh_restaurant_capacity();

drop trigger if exists restaurant_tables_capacity_sync_del on public.restaurant_tables;
create trigger restaurant_tables_capacity_sync_del
  after delete on public.restaurant_tables
  for each row execute function public.refresh_restaurant_capacity();

drop trigger if exists restaurant_tables_capacity_sync_upd on public.restaurant_tables;
create trigger restaurant_tables_capacity_sync_upd
  after update on public.restaurant_tables
  for each row
  when (old.seats is distinct from new.seats
     or old.restaurant_id is distinct from new.restaurant_id)
  execute function public.refresh_restaurant_capacity();

-- ---------------------------------------------------------------------------
-- Backfill: align existing future slots with current totals.
-- ---------------------------------------------------------------------------
update public.time_slots ts
   set capacity = public.restaurant_total_seats(ts.restaurant_id)
 where ts.end_time > now();
