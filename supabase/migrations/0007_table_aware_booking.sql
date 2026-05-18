-- Waitless: every booking now claims a specific physical table (or an
-- arrangement). The total-capacity gate alone was not enough: it allowed
-- N parties of 5 to "fit" the 24-seat slot even if only 2 physical tables
-- could host a 5-top.

-- ---------------------------------------------------------------------------
-- Updated book_slot: assigns the tightest-fitting available table; raises
-- NO_TABLE_AVAILABLE if none. Existing arrangement-flow RPCs (merge/borrow)
-- already commit specific tables and are untouched.
-- ---------------------------------------------------------------------------
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
  v_user uuid := auth.uid();
  v_slot record;
  v_restaurant uuid;
  v_threshold int;
  v_booking_id uuid;
  v_deposit_required boolean := false;
  v_assigned uuid;
  v_seats int;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_slot from public.time_slots where id = p_slot_id for update;
  if not found then raise exception 'SLOT_NOT_FOUND'; end if;
  if v_slot.booked_count + p_party_size > v_slot.capacity then
    raise exception 'SLOT_FULL';
  end if;
  v_restaurant := v_slot.restaurant_id;

  -- Pick (or validate) a physical table that has enough seats AND isn't
  -- already committed to another booking/merge/borrow on this slot.
  with committed as (
    select b.table_id as id
      from public.bookings b
     where b.slot_id = p_slot_id
       and b.table_id is not null
       and b.status not in ('cancelled', 'no_show', 'completed')
    union
    select unnest(tm.table_ids)
      from public.table_merges tm
     where tm.slot_id = p_slot_id
    union
    select sb.from_table_id
      from public.seat_borrows sb
     where sb.slot_id = p_slot_id
    union
    select sb.to_table_id
      from public.seat_borrows sb
     where sb.slot_id = p_slot_id
  )
  select rt.id, rt.seats into v_assigned, v_seats
    from public.restaurant_tables rt
   where rt.restaurant_id = v_restaurant
     and rt.seats >= p_party_size
     and rt.id not in (select id from committed where id is not null)
     and (p_table_id is null or rt.id = p_table_id)
   order by rt.seats   -- tightest fit first
   limit 1;

  if v_assigned is null then
    raise exception 'NO_TABLE_AVAILABLE';
  end if;

  select deposit_threshold into v_threshold from public.restaurants where id = v_restaurant;
  if p_party_size >= v_threshold then v_deposit_required := true; end if;

  update public.time_slots set booked_count = booked_count + p_party_size where id = p_slot_id;

  insert into public.bookings (
    user_id, restaurant_id, slot_id, table_id, party_size, status,
    deposit_required
  ) values (
    v_user, v_restaurant, p_slot_id, v_assigned, p_party_size,
    case when v_deposit_required then 'pending_deposit'::booking_status
         else 'confirmed'::booking_status end,
    v_deposit_required
  ) returning id into v_booking_id;

  update public.profiles set total_bookings = total_bookings + 1 where id = v_user;
  return v_booking_id;
end;
$$;
