-- Seed data for Waitless — a handful of Kuwait restaurants with tables
-- and the next 14 days of dinner slots. Safe to run multiple times.

insert into public.restaurants (id, name, cuisine, description, address, area, lat, lng, phone, opens_at, closes_at, deposit_threshold, deposit_kwd)
values
  ('11111111-1111-1111-1111-111111111111', 'Sirocco', 'Mediterranean', 'Rooftop Mediterranean dining overlooking the Gulf.', 'Salmiya, Block 12', 'Salmiya', 29.3375, 48.0758, '+96522224444', '12:00', '23:30', 6, 5.000),
  ('22222222-2222-2222-2222-222222222222', 'Bait 7', 'Levantine', 'Casual Levantine plates in a converted villa.', 'Shaab, Block 8', 'Shaab', 29.3525, 48.0857, '+96522226666', '13:00', '23:00', 8, 7.500),
  ('33333333-3333-3333-3333-333333333333', 'Burger Boutique', 'American', 'Stacked burgers, milkshakes, late-night vibe.', 'The Avenues, Phase 2', 'Rai', 29.3030, 47.9320, '+96522257777', '12:00', '00:30', 10, 5.000),
  ('44444444-4444-4444-4444-444444444444', 'Mais Alghanim', 'Kuwaiti', 'The classic — machboos, grills, and family seating.', 'Gulf Road, Bida', 'Bida', 29.3640, 48.0103, '+96522251155', '11:30', '23:30', 8, 5.000)
on conflict (id) do nothing;

-- Tables per restaurant.
insert into public.restaurant_tables (restaurant_id, label, seats, x, y) values
  ('11111111-1111-1111-1111-111111111111', 'T1',  2,  50,  60),
  ('11111111-1111-1111-1111-111111111111', 'T2',  4, 150,  60),
  ('11111111-1111-1111-1111-111111111111', 'T3',  4, 250,  60),
  ('11111111-1111-1111-1111-111111111111', 'T4',  6,  50, 180),
  ('11111111-1111-1111-1111-111111111111', 'T5',  8, 200, 180),
  ('22222222-2222-2222-2222-222222222222', 'T1',  4,  60,  60),
  ('22222222-2222-2222-2222-222222222222', 'T2',  4, 180,  60),
  ('22222222-2222-2222-2222-222222222222', 'T3',  6,  60, 180),
  ('22222222-2222-2222-2222-222222222222', 'T4',  6, 180, 180),
  ('33333333-3333-3333-3333-333333333333', 'T1',  2,  40,  40),
  ('33333333-3333-3333-3333-333333333333', 'T2',  2, 120,  40),
  ('33333333-3333-3333-3333-333333333333', 'T3',  4, 200,  40),
  ('33333333-3333-3333-3333-333333333333', 'T4',  4,  80, 160),
  ('33333333-3333-3333-3333-333333333333', 'T5',  6, 220, 160),
  ('44444444-4444-4444-4444-444444444444', 'T1',  4,  40,  60),
  ('44444444-4444-4444-4444-444444444444', 'T2',  4, 160,  60),
  ('44444444-4444-4444-4444-444444444444', 'T3',  8, 280,  60),
  ('44444444-4444-4444-4444-444444444444', 'T4', 10,  40, 220)
on conflict do nothing;

-- Generate slots: one per 90 min, from 18:00 to 22:30 local, next 14 days.
-- Capacity = sum of all seats at that restaurant.
insert into public.time_slots (restaurant_id, start_time, end_time, capacity)
select
  r.id,
  d.day + (h.hour || ' hours')::interval as start_time,
  d.day + (h.hour || ' hours')::interval + interval '90 minutes' as end_time,
  coalesce((select sum(seats) from public.restaurant_tables rt where rt.restaurant_id = r.id), 20) as capacity
from public.restaurants r
cross join generate_series(
  date_trunc('day', now() at time zone 'Asia/Kuwait')::date,
  (date_trunc('day', now() at time zone 'Asia/Kuwait') + interval '13 days')::date,
  interval '1 day'
) as d(day)
cross join (values (18), (19), (20), (21), (22)) as h(hour)
on conflict (restaurant_id, start_time) do nothing;
