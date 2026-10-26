-- Demo business data for local development and previews. Idempotent; safe to run repeatedly.
-- Clubs mirror the public site (fikirhane.co/ng, 2026-10-21). Prices and account balances are illustrative values from the design docs.

insert into financial_centers (center_code, center_name, center_type, description, sort_order) values
  ('WORKING_CLUB', 'Working Club / Community Workspace', 'club', 'Community workspace sessions and Working Club activities.', 10),
  ('ENGLISH_CLUB', 'English Club', 'club', 'Financial performance center for English Club activities.', 20),
  ('WRITING_CLUB', 'Spanish Club', 'club', 'Financial performance center for Spanish Club activities.', 30)
on conflict (center_code) do nothing;

insert into clubs (club_code, club_name, club_description, club_type, id_financial_center, status, sort_order)
select v.code, v.name, v.descr, v.type, fc.id_financial_center, 'active', v.ord
from (values
  ('WORKING', 'Çalışma Kulübü', 'Kendi işine, projene ya da öğrenimine odaklanabileceğin rezervasyonlu ortak çalışma seansları. Sabit masa ya da uzun dönem ofis üyeliği gerekmez.', 'workspace', 'WORKING_CLUB', 10),
  ('ENGLISH', 'İngilizce Konuşma Kulübü', 'İngilizceyi düzenli kullanabileceğin bir ortam: konuşma pratiği, telaffuz, iş İngilizcesi ve farklı temalar etrafında tekrar eden programlar.', 'language', 'ENGLISH_CLUB', 20),
  ('WRITING', 'İspanyolca Konuşma Kulübü', 'Konuşma pratiği, günlük hayat, seyahat ve kültür temaları etrafında tekrar eden programlar. Amaç bir ders ortamından çok, İspanyolcayı gerçek iletişim içinde düzenli kullanmak.', 'language', 'WRITING_CLUB', 30)
) as v(code, name, descr, type, fc, ord)
join financial_centers fc on fc.center_code = v.fc
on conflict (club_code) do nothing;

insert into accounts (account_code, account_name, account_type, currency_code, opening_balance, opening_balance_date, account_reference, sort_order) values
  ('BANK_TRY', 'Bank Account TRY (demo)', 'bank', 'TRY', 0, '2026-10-01', 'Main operating account', 10),
  ('CASH_TRY', 'Fikirhane Cash', 'cash', 'TRY', 0, '2026-10-01', null, 20)
on conflict (account_code) do nothing;

insert into items (item_code, item_name, item_type, item_category, unit, is_sellable, is_purchasable, is_stock_tracked, default_tax_rate,
  default_revenue_category_id, sort_order)
select 'WORKSPACE_SESSION', 'Community Workspace Session', 'service', 'workspace_service', 'session', true, false, false, 0,
  (select id_financial_category from financial_categories where category_code = 'WORKSPACE_REVENUE'), 10
on conflict (item_code) do nothing;

-- Café stock, so stock movements and counts can be tried: tracked items with an opening balance on first load only.
with added as (
  insert into items (item_code, item_name, item_type, item_category, unit, stock_behavior, is_sellable, is_purchasable, is_stock_tracked,
    default_selling_price, currency_code, default_tax_rate, default_financial_center_id, default_revenue_category_id,
    default_expense_category_id, reorder_level, target_stock, storage_area, sort_order)
  select v.code, v.name, 'stock_item', v.category, v.unit, v.behavior, v.sellable, true, true, v.price, 'TRY', 10,
    (select id_financial_center from financial_centers where center_code = 'CAFETERIA'),
    (select id_financial_category from financial_categories where category_code = 'CAFETERIA_SALES'),
    (select id_financial_category from financial_categories where category_code = 'FOOD_BEVERAGE_PURCHASES'),
    v.reorder, v.target, 'Kafe deposu', v.sort
  from (values
    ('WATER_500ML', 'Su 500 ml', 'beverage', 'piece', 'resale', true, 20.00, 24, 96, 20, 48),
    ('COFFEE_BEANS', 'Kahve çekirdeği', 'ingredient', 'kg', 'ingredient', false, null, 2, 6, 21, 4),
    ('PAPER_CUP', 'Karton bardak', 'consumable', 'piece', 'consumable', false, null, 100, 500, 22, 300)
  ) as v(code, name, category, unit, behavior, sellable, price, reorder, target, sort, opening)
  on conflict (item_code) do nothing
  returning id_item, item_code
)
insert into stock_movements (id_item, movement_type, quantity, reason_code, notes)
select a.id_item, 'opening_balance', o.qty, null, 'Demo açılış stoku'
from added a join (values ('WATER_500ML', 48), ('COFFEE_BEANS', 4), ('PAPER_CUP', 300)) as o(code, qty) on o.code = a.item_code;

-- Made in the kitchen, so not stock-tracked: sold at the counter and on kitchen tabs (QR labels).
insert into items (item_code, item_name, item_type, item_category, unit, is_sellable, is_purchasable, is_stock_tracked,
  default_selling_price, currency_code, default_tax_rate, default_financial_center_id, default_revenue_category_id, sort_order)
select v.code, v.name, 'nonstock_item', v.category, 'piece', true, false, false, v.price, 'TRY', 10,
  (select id_financial_center from financial_centers where center_code = 'CAFETERIA'),
  (select id_financial_category from financial_categories where category_code = 'CAFETERIA_SALES'), v.sort
from (values
  ('TURKISH_COFFEE', 'Türk kahvesi', 'beverage', 60.00, 11),
  ('FILTER_COFFEE', 'Filtre kahve', 'beverage', 70.00, 12),
  ('TEA', 'Çay', 'beverage', 25.00, 13),
  ('CHEESE_TOAST', 'Kaşarlı tost', 'food', 110.00, 14)
) as v(code, name, category, price, sort)
on conflict (item_code) do nothing;

-- Coworking sessions for the next 7 weekdays (morning 10-14, afternoon 14-18), two options each.
with days as (
  select d::date as day from generate_series(current_date, current_date + 9, interval '1 day') d
  where extract(isodow from d) <= 5 limit 7
), slots as (
  select day, s.code, s.label, s.start_h, s.end_h from days
  cross join (values ('AM', 'Sabah', 10, 14), ('PM', 'Öğleden sonra', 14, 18)) as s(code, label, start_h, end_h)
), ins as (
  insert into events (event_code, event_type, event_title, event_description, start_datetime, end_datetime, status, base_price, currency_code,
                      networking_enabled, enable_need, enable_offer)
  select 'WORKING-' || to_char(day, 'YYYY-MM-DD') || '-' || code, 'workspace', 'Coworking · ' || label,
         'Fikirhane topluluk çalışma alanında ' || lower(label) || ' oturumu.',
         (day + make_interval(hours => start_h)) at time zone 'Europe/Istanbul',
         (day + make_interval(hours => end_h)) at time zone 'Europe/Istanbul',
         'published', 500.00, 'TRY', true, true, true
  from slots
  where (day + make_interval(hours => start_h)) at time zone 'Europe/Istanbul' > now()
  on conflict (event_code) do nothing
  returning id_event
)
insert into event_options (id_event, id_location, id_space_setup, option_code, option_name, capacity, booking_unit, price_adjustment, status, sort_order)
select ins.id_event, s.id_location, s.id_space_setup, o.code, o.name, o.cap, 'seat', l.default_price_adjustment, 'active', o.ord
from ins
cross join (values ('FIK', 'FIKIRHANE_COWORK_V1', 'Fikirhane — Network Zone', 16, 10), ('ATL', 'ATOLYE_COWORK_V1', 'Atölye — Focus Zone', 12, 20)) as o(code, setup, name, cap, ord)
join space_setups s on s.setup_code = o.setup
join locations l on l.id_location = s.id_location;

insert into event_clubs (id_club, id_event, club_event_role, is_primary)
select c.id_club, e.id_event, 'organizer', true from events e join clubs c on c.club_code = 'WORKING'
where e.event_code like 'WORKING-%'
  and not exists (select 1 from event_clubs ec where ec.id_event = e.id_event and ec.status = 'active');

-- Meeting room: weekday evenings in two-hour slots (18-20, 20-22, 22-24). One booking takes the whole room.
with days as (
  select d::date as day from generate_series(current_date, current_date + 9, interval '1 day') d
  where extract(isodow from d) <= 5 limit 7
), slots as (
  select day, start_h from days cross join (values (18), (20), (22)) as s(start_h)
), ins as (
  insert into events (event_code, event_type, event_title, event_description, start_datetime, end_datetime, status, base_price, currency_code)
  select 'MEETING-' || to_char(day, 'YYYY-MM-DD') || '-' || start_h, 'workspace', 'Toplantı odası',
         'Toplantı odasının tamamı, iki saat: 4–6 kişilik masa, ekran ve beyaz tahta.',
         (day + make_interval(hours => start_h)) at time zone 'Europe/Istanbul',
         (day + make_interval(hours => start_h + 2)) at time zone 'Europe/Istanbul',
         'published', 1000.00, 'TRY'
  from slots
  where (day + make_interval(hours => start_h)) at time zone 'Europe/Istanbul' > now()
  on conflict (event_code) do nothing
  returning id_event
)
insert into event_options (id_event, id_location, id_space_setup, option_code, option_name, capacity, booking_unit, price_adjustment, status, sort_order)
select ins.id_event, s.id_location, s.id_space_setup, 'ODA', 'Toplantı odası (4–6 kişi)', 1, 'location', l.default_price_adjustment, 'active', 10
from ins cross join space_setups s join locations l using (id_location)
where s.setup_code = 'MEETING_ROOM_V1';

-- English conversation meetup from the public program (24 Oct 2026, 14:00-16:00), free; skipped once it is in the past.
with ins as (
  insert into events (event_code, event_type, event_title, event_description, start_datetime, end_datetime, status, base_price, currency_code,
                      networking_enabled, show_interests)
  select 'ENG-MEET-2026-10-24', 'meetup', 'Culture, Food and Traditions',
         'Kültürler, yemekler ve gelenekler üzerine İngilizce sohbet.',
         timestamptz '2026-10-24 14:00 Europe/Istanbul', timestamptz '2026-10-24 16:00 Europe/Istanbul', 'published', 0, 'TRY', true, true
  where timestamptz '2026-10-24 14:00 Europe/Istanbul' > now()
  on conflict (event_code) do nothing
  returning id_event
), opt as (
  insert into event_options (id_event, id_location, id_space_setup, option_code, option_name, capacity, booking_unit, price_adjustment, status, sort_order)
  select ins.id_event, s.id_location, s.id_space_setup, 'FIK', 'Fikirhane', 16, 'location', 0, 'active', 10
  from ins, space_setups s where s.setup_code = 'FIKIRHANE_COWORK_V1'
  returning id_event
)
insert into event_clubs (id_club, id_event, club_event_role, is_primary)
select c.id_club, opt.id_event, 'organizer', true from opt, clubs c where c.club_code = 'ENGLISH';
