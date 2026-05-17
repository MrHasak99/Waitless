-- Waitless: per-slot table arrangements (merges + borrows).
--
-- Total slot capacity (time_slots.capacity) is NOT affected — seats can't be
-- conjured by rearranging. What changes is *per-table effective seats* for
-- one specific slot, which matters for table assignment, floor planning, and
-- the admin/staff floor view.

-- ---------------------------------------------------------------------------
-- Table merges: two or more physical tables act as a single seating unit
-- for a specific slot. Effective seats of each component table become 0;
-- effective seats of the merge group = sum of component seats.
-- ---------------------------------------------------------------------------
create table public.table_merges (
  id          uuid primary key default gen_random_uuid(),
  slot_id     uuid not null references public.time_slots(id) on delete cascade,
  table_ids   uuid[] not null,
  total_seats int not null check (total_seats > 0),
  notes       text,
  created_at  timestamptz not null default now(),
  check (array_length(table_ids, 1) >= 2)
);

create index table_merges_slot_idx on public.table_merges(slot_id);

-- ---------------------------------------------------------------------------
-- Seat borrows: N seats move from one table to another for a specific slot.
-- from_table loses N effective seats; to_table gains N. Total restaurant
-- seats is unchanged (this is the whole point).
-- ---------------------------------------------------------------------------
create table public.seat_borrows (
  id            uuid primary key default gen_random_uuid(),
  slot_id       uuid not null references public.time_slots(id) on delete cascade,
  from_table_id uuid not null references public.restaurant_tables(id) on delete cascade,
  to_table_id   uuid not null references public.restaurant_tables(id) on delete cascade,
  seats         int not null check (seats > 0),
  notes         text,
  created_at    timestamptz not null default now(),
  check (from_table_id <> to_table_id)
);

create index seat_borrows_slot_idx on public.seat_borrows(slot_id);

-- ---------------------------------------------------------------------------
-- Validation function: returns the effective per-table seats for a slot,
-- accounting for merges (component tables → 0, virtual merge group at sum)
-- and borrows (lend reduces, receive increases).
--
-- Returns rows: (table_id uuid, label text, base_seats int, effective_seats int)
-- For merge groups, table_id is NULL and label is concatenated component labels.
-- ---------------------------------------------------------------------------
create or replace function public.effective_table_seats(p_slot_id uuid)
returns table (
  table_id uuid,
  label text,
  base_seats int,
  effective_seats int,
  merged boolean,
  merge_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_restaurant uuid;
begin
  select restaurant_id into v_restaurant from public.time_slots where id = p_slot_id;
  if v_restaurant is null then
    return;
  end if;

  -- Per-physical-table effective seats: base seats - lent seats + borrowed seats,
  -- unless the table is part of a merge (then effective = 0).
  return query
  with merged_tables as (
    select unnest(table_ids) as t_id, id as m_id
    from public.table_merges
    where slot_id = p_slot_id
  ),
  lent as (
    select from_table_id as t_id, coalesce(sum(seats), 0) as lent_seats
    from public.seat_borrows
    where slot_id = p_slot_id
    group by from_table_id
  ),
  borrowed as (
    select to_table_id as t_id, coalesce(sum(seats), 0) as got_seats
    from public.seat_borrows
    where slot_id = p_slot_id
    group by to_table_id
  )
  select
    rt.id,
    rt.label,
    rt.seats,
    case
      when m.m_id is not null then 0
      else rt.seats - coalesce(l.lent_seats, 0) + coalesce(b.got_seats, 0)
    end,
    m.m_id is not null,
    m.m_id
  from public.restaurant_tables rt
  left join merged_tables m on m.t_id = rt.id
  left join lent l on l.t_id = rt.id
  left join borrowed b on b.t_id = rt.id
  where rt.restaurant_id = v_restaurant
  order by rt.label;

  -- Merge groups as synthetic rows.
  return query
  select
    null::uuid,
    string_agg(rt.label, '+' order by rt.label) as label,
    sum(rt.seats)::int,
    tm.total_seats,
    true,
    tm.id
  from public.table_merges tm
  join public.restaurant_tables rt on rt.id = any(tm.table_ids)
  where tm.slot_id = p_slot_id
  group by tm.id, tm.total_seats;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.table_merges enable row level security;
alter table public.seat_borrows enable row level security;

create policy table_merges_select on public.table_merges
  for select using (true);
create policy table_merges_admin_write on public.table_merges
  for all using (public.is_admin()) with check (public.is_admin());

create policy seat_borrows_select on public.seat_borrows
  for select using (true);
create policy seat_borrows_admin_write on public.seat_borrows
  for all using (public.is_admin()) with check (public.is_admin());
