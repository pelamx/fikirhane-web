-- Reference data that the application depends on. Business/demo data (clubs, events, accounts) lives in seeds/demo.sql.
-- Permission codes follow PERMISSIONS.md; ROLES.md bundle names are mapped onto them (docs/backend-decisions.md, D-07).

insert into roles (role_code, role_name, description, is_system_role, sort_order) values
  ('USER', 'User', 'Authenticated frontend user base permission package.', true, 10),
  ('FIKIRHANE_ADMIN', 'Fikirhane Admin', 'Global role managing Fikirhane business operations.', true, 20),
  ('KITCHEN_STAFF', 'Kitchen Staff', 'Cafeteria and stock staff.', true, 30),
  ('ACCOUNTING', 'Accounting', 'Finance and accounting view and operations.', true, 40),
  ('MARKETING', 'Marketing', 'Campaigns, acquisition and user analytics.', true, 50),
  ('TECH_ADMIN', 'Tech Admin', 'Technical system administration.', true, 60);

insert into permissions (permission_code, resource, action, sub_action, permission_group, description, is_sensitive, is_system_permission, sort_order)
select code, split_part(code, '.', 1), split_part(split_part(code, '.', 2), '_', 1),
       nullif(substr(split_part(code, '.', 2), length(split_part(split_part(code, '.', 2), '_', 1)) + 2), ''),
       grp, descr, sensitive, true, ord
from (values
  ('user.view_own', 'User Management', 'View own profile.', false, 10),
  ('user.update_own', 'User Management', 'Update own profile.', false, 20),
  ('user.view_basic', 'User Management', 'View basic profile data of users.', false, 30),
  ('user.view_contact', 'User Management', 'View contact data of users.', false, 40),
  ('user.view_sensitive', 'User Management', 'View sensitive user data.', true, 50),
  ('user.suspend', 'User Management', 'Suspend a user account.', true, 60),
  ('user.reactivate', 'User Management', 'Reactivate a suspended user account.', false, 70),
  ('membership.view_own', 'Membership', 'View own membership and applications.', false, 10),
  ('membership.apply', 'Membership', 'Submit or withdraw own membership applications.', false, 20),
  ('membership.view', 'Membership', 'View memberships and applications of all users.', false, 30),
  ('membership.create', 'Membership', 'Grant a membership directly.', false, 40),
  ('membership.update', 'Membership', 'Update memberships.', false, 50),
  ('membership.approve', 'Membership', 'Approve or waitlist membership applications.', false, 60),
  ('membership.reject', 'Membership', 'Decline membership applications.', false, 70),
  ('membership.cancel', 'Membership', 'Cancel a membership.', false, 80),
  ('organization.view', 'Organizations', 'View organizations.', false, 10),
  ('organization.create', 'Organizations', 'Create organizations.', false, 20),
  ('organization.update', 'Organizations', 'Update organizations.', false, 30),
  ('organization.archive', 'Organizations', 'Archive organizations.', false, 40),
  ('organization_users.view', 'Organizations', 'View organization users.', false, 50),
  ('organization_users.manage', 'Organizations', 'Manage organization users.', false, 60),
  ('club.view', 'Clubs', 'View clubs.', false, 10),
  ('club.join', 'Clubs', 'Join or leave a club as a member.', false, 20),
  ('club.create', 'Clubs', 'Create clubs.', false, 30),
  ('club.update', 'Clubs', 'Update clubs.', false, 40),
  ('club.archive', 'Clubs', 'Archive clubs.', false, 50),
  ('club_members.view', 'Clubs', 'View club members.', false, 60),
  ('club_members.manage', 'Clubs', 'Manage club members and roles.', false, 70),
  ('club_analytics.view', 'Clubs', 'View club analytics.', false, 80),
  ('event.view', 'Event Management', 'View published events.', false, 10),
  ('event.create', 'Event Management', 'Create events.', false, 20),
  ('event.update_details', 'Event Management', 'Update event details.', false, 30),
  ('event.update_schedule', 'Event Management', 'Update event schedule.', false, 40),
  ('event.update_location', 'Event Management', 'Update event options and locations.', false, 45),
  ('event.update_capacity', 'Event Management', 'Update event option capacity.', false, 48),
  ('event.update_pricing', 'Event Management', 'Update event pricing.', true, 50),
  ('event.publish', 'Event Management', 'Approve and publish events.', false, 60),
  ('event.cancel', 'Event Management', 'Cancel events.', false, 70),
  ('event_participants.view', 'Event Management', 'View event participants.', false, 80),
  ('event_attendance.manage', 'Event Management', 'Manage event attendance.', false, 90),
  ('booking.create', 'Booking Operations', 'Create own bookings.', false, 10),
  ('booking.view_own', 'Booking Operations', 'View own bookings.', false, 20),
  ('booking.cancel_own', 'Booking Operations', 'Cancel own bookings within policy.', false, 30),
  ('booking.view', 'Booking Operations', 'View all bookings.', false, 40),
  ('booking.update', 'Booking Operations', 'Update bookings.', false, 50),
  ('booking.cancel', 'Booking Operations', 'Cancel any booking at any time.', false, 60),
  ('booking.manual_create', 'Booking Operations', 'Create manual bookings on behalf of users.', false, 70),
  ('booking.checkin', 'Booking Operations', 'Check participants in.', false, 80),
  ('booking.checkout', 'Booking Operations', 'Check participants out.', false, 90),
  ('booking.override_capacity', 'Booking Operations', 'Book beyond option capacity.', true, 100),
  ('booking.override_payment', 'Booking Operations', 'Override booking payment rules.', true, 110),
  ('pricing.view', 'Pricing', 'View pricing data.', false, 10),
  ('pricing_rule.create', 'Pricing', 'Create pricing rules.', true, 20),
  ('pricing_rule.update', 'Pricing', 'Update pricing rules.', true, 30),
  ('pricing_rule.disable', 'Pricing', 'Disable pricing rules.', true, 40),
  ('campaign.view', 'Growth', 'View campaigns.', false, 10),
  ('campaign.create', 'Growth', 'Create campaigns.', false, 20),
  ('campaign.update', 'Growth', 'Update campaigns.', false, 30),
  ('campaign.archive', 'Growth', 'Archive campaigns.', false, 40),
  ('invitation.view', 'Growth', 'View invitations.', false, 50),
  ('invitation.create', 'Growth', 'Create invitations.', false, 60),
  ('freepass.view', 'Growth', 'View freepasses.', false, 70),
  ('freepass.create', 'Growth', 'Issue freepasses.', false, 80),
  ('freepass.cancel', 'Growth', 'Cancel freepasses and reverse redemptions.', false, 90),
  ('freepass.override_limit', 'Growth', 'Redeem a freepass beyond its usage limit.', true, 100),
  ('acquisition.view', 'Growth', 'View acquisition attribution.', false, 110),
  ('acquisition.update', 'Growth', 'Correct acquisition attribution.', true, 120),
  ('marketing_analytics.view', 'Growth', 'View marketing analytics.', false, 130),
  ('sponsorship.view', 'Sponsorship', 'View sponsorships and usage.', false, 10),
  ('sponsorship.manage', 'Sponsorship', 'Manage sponsorship plans, agreements and usage.', false, 20),
  ('sponsorship.override_limit', 'Sponsorship', 'Record usage beyond agreed limits.', true, 30),
  ('item.view', 'Stock', 'View items.', false, 10),
  ('item.create', 'Stock', 'Create items.', false, 20),
  ('item.update', 'Stock', 'Update items.', false, 30),
  ('item.archive', 'Stock', 'Archive items.', false, 40),
  ('stock.view', 'Stock', 'View stock levels and movements.', false, 50),
  ('stock.receive', 'Stock', 'Record stock receipts.', false, 60),
  ('stock.consume', 'Stock', 'Record internal consumption.', false, 70),
  ('stock.waste', 'Stock', 'Record waste.', false, 80),
  ('stock.adjust', 'Stock', 'Record manual stock adjustments.', true, 90),
  ('stock.override_negative', 'Stock', 'Allow stock to go negative.', true, 100),
  ('stock_count.create', 'Stock', 'Create stock counts.', false, 110),
  ('stock_count.enter', 'Stock', 'Enter counted quantities.', false, 120),
  ('stock_count.complete', 'Stock', 'Complete stock counts.', false, 130),
  ('stock_count.approve', 'Stock', 'Approve stock counts.', false, 140),
  ('stock_count.post', 'Stock', 'Post stock count variances.', true, 150),
  ('cafeteria_sale.create', 'Stock', 'Create cafeteria sales.', false, 160),
  ('document.view', 'Finance', 'View documents.', false, 10),
  ('document.create', 'Finance', 'Create documents.', false, 20),
  ('document.update', 'Finance', 'Update draft documents.', false, 30),
  ('document.post', 'Finance', 'Post documents.', true, 40),
  ('document.cancel', 'Finance', 'Cancel documents.', true, 50),
  ('document.export', 'Finance', 'Export documents.', false, 60),
  ('transaction.view', 'Finance', 'View transactions.', false, 70),
  ('transaction.create', 'Finance', 'Create pending transactions.', false, 80),
  ('transaction.update_pending', 'Finance', 'Edit pending transactions.', false, 90),
  ('transaction.post', 'Finance', 'Post transactions.', true, 100),
  ('transaction.reverse', 'Finance', 'Reverse posted transactions.', true, 110),
  ('transaction.adjust', 'Finance', 'Create adjustment transactions.', true, 120),
  ('transaction.export', 'Finance', 'Export transactions.', false, 130),
  ('account.view', 'Finance', 'View accounts.', false, 140),
  ('account_balance.view', 'Finance', 'View account balances.', false, 150),
  ('account.create', 'Finance', 'Create accounts.', true, 160),
  ('account.update', 'Finance', 'Update accounts.', true, 170),
  ('account.close', 'Finance', 'Archive accounts.', true, 180),
  ('account.reconcile', 'Finance', 'Reconcile accounts.', false, 190),
  ('financial_center.view', 'Finance', 'View financial centers.', false, 200),
  ('financial_center.update', 'Finance', 'Manage financial centers.', false, 210),
  ('financial_category.view', 'Finance', 'View financial categories.', false, 220),
  ('financial_category.update', 'Finance', 'Manage financial categories.', false, 230),
  ('report.view', 'Reports', 'View business and financial reports.', false, 10),
  ('report.export', 'Reports', 'Export reports.', false, 20),
  ('role.view', 'System Administration', 'View roles.', false, 10),
  ('role.create', 'System Administration', 'Create roles.', true, 20),
  ('role.update', 'System Administration', 'Update roles and their permissions.', true, 30),
  ('role.assign', 'System Administration', 'Assign global roles to users.', true, 40),
  ('role.revoke', 'System Administration', 'Revoke global roles from users.', true, 50),
  ('permission.view', 'System Administration', 'View permissions.', false, 60),
  ('permission.manage', 'System Administration', 'Manage permissions.', true, 70),
  ('audit.view', 'System Administration', 'View the audit log.', true, 80),
  ('system_settings.view', 'System Administration', 'View system settings.', false, 90),
  ('system_settings.update', 'System Administration', 'Update system settings.', true, 100),
  ('integration.view', 'System Administration', 'View integrations.', false, 110),
  ('integration.manage', 'System Administration', 'Manage integrations.', true, 120)
) as p(code, grp, descr, sensitive, ord);

insert into role_permissions (id_role, id_permission, notes)
select r.id_role, p.id_permission, 'Initial V1 bundle'
from (values
  ('USER', array['user.view_own', 'user.update_own', 'membership.view_own', 'membership.apply', 'event.view', 'club.view', 'club.join',
                 'booking.create', 'booking.view_own', 'booking.cancel_own']),
  ('FIKIRHANE_ADMIN', array['user.view_basic', 'user.view_contact', 'user.suspend', 'user.reactivate',
                 'membership.view', 'membership.create', 'membership.update', 'membership.approve', 'membership.reject', 'membership.cancel',
                 'organization.view', 'organization.create', 'organization.update', 'organization.archive', 'organization_users.view', 'organization_users.manage',
                 'club.view', 'club.create', 'club.update', 'club.archive', 'club_members.view', 'club_members.manage', 'club_analytics.view',
                 'event.view', 'event.create', 'event.update_details', 'event.update_schedule', 'event.update_location', 'event.update_capacity',
                 'event.update_pricing', 'event.publish', 'event.cancel', 'event_participants.view', 'event_attendance.manage',
                 'booking.view', 'booking.update', 'booking.cancel', 'booking.manual_create', 'booking.checkin', 'booking.checkout',
                 'booking.override_capacity', 'booking.override_payment', 'pricing.view',
                 'campaign.view', 'campaign.create', 'campaign.update', 'campaign.archive', 'invitation.view', 'invitation.create',
                 'freepass.view', 'freepass.create', 'freepass.cancel', 'acquisition.view', 'sponsorship.view', 'sponsorship.manage',
                 'item.view', 'stock.view', 'document.view', 'transaction.view', 'account.view', 'report.view']),
  ('KITCHEN_STAFF', array['item.view', 'stock.view', 'stock.receive', 'stock.consume', 'stock.waste', 'stock_count.create', 'stock_count.enter',
                 'cafeteria_sale.create']),
  ('ACCOUNTING', array['document.view', 'document.create', 'document.update', 'document.export', 'transaction.view', 'transaction.create',
                 'transaction.update_pending', 'transaction.export', 'account.view', 'account_balance.view', 'account.reconcile',
                 'financial_center.view', 'financial_category.view', 'report.view', 'report.export']),
  ('MARKETING', array['campaign.view', 'campaign.create', 'campaign.update', 'acquisition.view', 'marketing_analytics.view', 'user.view_basic',
                 'booking.view', 'event.view', 'freepass.view', 'invitation.view']),
  ('TECH_ADMIN', array['user.view_basic', 'role.view', 'role.create', 'role.update', 'role.assign', 'role.revoke', 'permission.view',
                 'permission.manage', 'audit.view', 'system_settings.view', 'system_settings.update', 'integration.view', 'integration.manage'])
) as b(role_code, codes)
cross join lateral unnest(b.codes) as c(code)
join roles r on r.role_code = b.role_code
join permissions p on p.permission_code = c.code;

insert into membership_types (membership_type_code, membership_type_name, description, discount_rate, reservation_window_days,
  max_active_bookings, booking_priority, seat_selection_enabled, priority_booking_enabled, sort_order) values
  ('MEMBER', 'Member', 'Fikirhane standart üyelik paketi.', 15.00, 7, 2, 10, false, false, 10),
  ('PREMIUM', 'Premium Member', 'Fikirhane''nin gelişmiş rezervasyon ve fiyat avantajları sunan üyelik paketi.', 20.00, 14, 4, 20, true, true, 20);

insert into club_member_roles (role_code, role_name, description, role_rank, is_management_role, sort_order) values
  ('MEMBER', 'Member', 'Basic club relation; no management rights.', 10, false, 10),
  ('MODERATOR', 'Moderator', 'Helps community operations: participants, attendance, moderation.', 20, true, 20),
  ('CO_LEAD', 'Co-Lead', 'Supports the club lead with event management.', 30, true, 30),
  ('CLUB_LEAD', 'Club Lead', 'Club''ın operasyonlarını yöneten ana kullanıcı rolü.', 40, true, 40),
  ('SPONSOR_REPRESENTATIVE', 'Sponsor Representative', 'Represents a club sponsor; no automatic management rights.', 5, false, 50);

insert into sponsorship_plans (plan_code, plan_name, description, default_duration_months, default_fee_amount, currency_code, billing_period,
  sponsored_events_limit, guest_pass_limit, content_post_limit, speaker_nomination_limit, branding_level, priority_level, sort_order) values
  ('SUPPORTING', 'Supporting Sponsor', 'Low/medium visibility supporting package.', null, null, 'TRY', null, null, null, null, null, 'basic', 10, 10),
  ('CLUB_PARTNER', 'Club Partner', 'Regular club collaboration package.', null, null, 'TRY', null, null, null, null, null, 'enhanced', 20, 20),
  ('MAIN_SPONSOR', 'Main Sponsor', 'Club''ın ana sponsoru için yıllık yüksek görünürlük ve etkinlik/guest pass hakları içeren paket.',
   12, 150000.00, 'TRY', 'annual', 12, 50, 6, 4, 'main', 30, 30);

insert into financial_categories (category_code, category_name, direction, category_group, description, sort_order) values
  ('WORKSPACE_REVENUE', 'Workspace Revenue', 'income', 'operating_revenue', 'Community workspace session revenue.', 10),
  ('EVENT_REVENUE', 'Event Revenue', 'income', 'operating_revenue', 'Revenue generated from paid events, meetups, workshops and classes.', 20),
  ('MEETING_ROOM_REVENUE', 'Meeting Room Revenue', 'income', 'operating_revenue', 'Meeting room rentals.', 30),
  ('VIRTUAL_OFFICE_REVENUE', 'Virtual Office Revenue', 'income', 'operating_revenue', 'Virtual office services.', 40),
  ('MEMBERSHIP_REVENUE', 'Membership Revenue', 'income', 'membership', 'Paid membership fees, if memberships are sold.', 50),
  ('SPONSORSHIP_REVENUE', 'Sponsorship Revenue', 'income', 'sponsorship', 'Club and event sponsorship revenue.', 60),
  ('CAFETERIA_SALES', 'Cafeteria Sales', 'income', 'cafeteria', 'Cafeteria food and beverage sales.', 70),
  ('OTHER_INCOME', 'Other Income', 'income', 'other_income', 'Income not covered by other categories.', 90),
  ('TUTOR_EXPENSE', 'Tutor Expense', 'expense', 'people', 'Tutor and instructor costs directly related to events and clubs.', 110),
  ('SPEAKER_EVENT_EXPENSE', 'Speaker / Event Expense', 'expense', 'people', 'Speaker fees and event delivery costs.', 120),
  ('MARKETING_EXPENSE', 'Marketing Expense', 'expense', 'marketing', 'Advertising, campaigns, printing and promotion.', 130),
  ('FOOD_BEVERAGE_PURCHASES', 'Food & Beverage Purchases', 'expense', 'cafeteria_cost', 'Cafeteria food, beverage and consumable purchases.', 140),
  ('CLEANING_EXPENSE', 'Cleaning Expense', 'expense', 'facilities', 'Cleaning services and materials.', 150),
  ('UTILITIES', 'Utilities', 'expense', 'facilities', 'Electricity, water and internet.', 160),
  ('RENT', 'Rent', 'expense', 'facilities', 'Premises rent.', 170),
  ('SOFTWARE_IT', 'Software & IT', 'expense', 'technology', 'Software subscriptions, IT equipment and services.', 180),
  ('ACCOUNTING_LEGAL', 'Accounting & Legal', 'expense', 'administrative', 'Accounting, legal and bank fees.', 190),
  ('OFFICE_SUPPLIES', 'Office Supplies', 'expense', 'administrative', 'Office supplies.', 200),
  ('MAINTENANCE', 'Maintenance', 'expense', 'facilities', 'Repairs and maintenance.', 210),
  ('OTHER_EXPENSE', 'Other Expense', 'expense', 'other_expense', 'Expenses not covered by other categories.', 290);

insert into financial_centers (center_code, center_name, center_type, description, sort_order) values
  ('CAFETERIA', 'Cafeteria', 'cafeteria', 'Cafeteria sales and direct operating expenses.', 80),
  ('GENERAL', 'General', 'general', 'Shared Fikirhane overhead and expenses not directly attributable to another financial center.', 100);

insert into skills (skill_code, skill_name, category, sort_order) values
  ('SOFTWARE_DEVELOPMENT', 'Software Development', 'Technology', 10), ('PYTHON', 'Python', 'Technology', 20),
  ('JAVASCRIPT', 'JavaScript', 'Technology', 30), ('DATA_ANALYSIS', 'Data Analysis', 'Data', 40),
  ('MACHINE_LEARNING', 'Machine Learning', 'Data', 50), ('PROMPT_ENGINEERING', 'Prompt Engineering', 'Technology', 60),
  ('EXCEL', 'Excel', 'Data', 70), ('PROJECT_MANAGEMENT', 'Project Management', 'Management', 80),
  ('PRODUCT_MANAGEMENT', 'Product Management', 'Management', 90), ('SALES', 'Sales', 'Business', 100),
  ('NEGOTIATION', 'Negotiation', 'Business', 110), ('DIGITAL_MARKETING', 'Digital Marketing', 'Marketing', 120),
  ('CONTENT_CREATION', 'Content Creation', 'Marketing', 130), ('FINANCIAL_MODELING', 'Financial Modeling', 'Finance', 140),
  ('ACCOUNTING', 'Accounting', 'Finance', 150), ('INVESTING', 'Investing', 'Finance', 160),
  ('REAL_ESTATE_ANALYSIS', 'Real Estate Analysis', 'Finance', 170), ('SKETCHUP', 'SketchUp', 'Creative', 180),
  ('AUTOCAD', 'AutoCAD', 'Creative', 190), ('GRAPHIC_DESIGN', 'Graphic Design', 'Creative', 200),
  ('PHOTOGRAPHY', 'Photography', 'Creative', 210), ('CREATIVE_WRITING', 'Creative Writing', 'Creative', 215),
  ('ENGLISH', 'English', 'Language', 220), ('SPANISH', 'Spanish', 'Language', 230), ('RUSSIAN', 'Russian', 'Language', 240),
  ('PUBLIC_SPEAKING', 'Public Speaking', 'Communication', 250), ('FACILITATION', 'Facilitation', 'Communication', 260),
  ('TEACHING', 'Teaching', 'Communication', 270);

insert into interests (interest_code, interest_name, category, sort_order) values
  ('ARTIFICIAL_INTELLIGENCE', 'Artificial Intelligence', 'Technology', 10), ('ENTREPRENEURSHIP', 'Entrepreneurship', 'Business', 20),
  ('STARTUPS', 'Startups', 'Business', 30), ('MARKETING', 'Marketing', 'Business', 40),
  ('SOFTWARE_DEVELOPMENT', 'Software Development', 'Technology', 50), ('DATA_SCIENCE', 'Data Science', 'Technology', 60),
  ('CYBERSECURITY', 'Cybersecurity', 'Technology', 70), ('E_COMMERCE', 'E-commerce', 'Business', 80),
  ('DIGITAL_MARKETING', 'Digital Marketing', 'Business', 90), ('FINANCE', 'Finance', 'Finance', 100),
  ('INVESTING', 'Investing', 'Finance', 110), ('REAL_ESTATE', 'Real Estate', 'Finance', 120),
  ('ARCHITECTURE', 'Architecture', 'Professional', 130), ('INTERIOR_DESIGN', 'Interior Design', 'Creative', 140),
  ('DESIGN', 'Design', 'Creative', 150), ('WRITING', 'Writing', 'Creative', 155), ('LANGUAGES', 'Languages', 'Languages', 160),
  ('TRAVEL', 'Travel', 'Lifestyle', 170), ('SUSTAINABILITY', 'Sustainability', 'Society', 180);

-- Physical venue (LOCATIONS / SPACE_SETUPS / TABLES / SEATS docs).
insert into locations (location_code, location_name, location_type, description, max_capacity, floor, indoor_outdoor, reservable,
  default_price_adjustment, currency_code, sort_order) values
  ('FIKIRHANE', 'Fikirhane', 'workspace', 'Front community workspace area.', 16, 'Ground Floor', 'indoor', true, 0.00, 'TRY', 10),
  ('ATOLYE', 'Atölye', 'workspace', 'Back focus/workshop area with whiteboard and large display.', 12, 'Ground Floor', 'indoor', true, -50.00, 'TRY', 20),
  ('MEETING_ROOM', 'Toplantı Odası', 'meeting_room', 'Meeting room.', 8, 'Ground Floor', 'indoor', true, 0.00, 'TRY', 30);

insert into space_setups (id_location, setup_code, setup_name, setup_type, description, capacity, default_booking_unit, map_aspect_ratio, status, sort_order)
select l.id_location, s.code, s.name, 'cowork', s.descr, s.cap, 'seat', 1.60, 'active', s.ord
from (values
  ('FIKIRHANE', 'FIKIRHANE_COWORK_V1', 'Community Workspace — 4 Tables', '4 tables with 4 chairs each.', 16, 10),
  ('ATOLYE', 'ATOLYE_COWORK_V1', 'Focus Workspace — 3 Tables', '3 tables with 4 chairs each.', 12, 20)
) as s(loc, code, name, descr, cap, ord)
join locations l on l.location_code = s.loc;

-- Fikirhane: 2x2 grid of tables T01..T04; Atölye: a row of T01..T03. Seats F01..F16 / A01..A12, two above and two below each table.
insert into tables (id_space_setup, table_code, table_name, seat_capacity, reservable, position_x, position_y, width, height, shape, sort_order)
select s.id_space_setup, 'T' || lpad(t.n::text, 2, '0'), 'Masa ' || t.n, 4, false, t.x, t.y, 0.26, 0.14, 'rectangle', t.n * 10
from (values
  ('FIKIRHANE_COWORK_V1', 1, 0.28, 0.30), ('FIKIRHANE_COWORK_V1', 2, 0.72, 0.30),
  ('FIKIRHANE_COWORK_V1', 3, 0.28, 0.72), ('FIKIRHANE_COWORK_V1', 4, 0.72, 0.72),
  ('ATOLYE_COWORK_V1', 1, 0.20, 0.50), ('ATOLYE_COWORK_V1', 2, 0.50, 0.50), ('ATOLYE_COWORK_V1', 3, 0.80, 0.50)
) as t(setup, n, x, y)
join space_setups s on s.setup_code = t.setup;

insert into seats (id_space_setup, id_table, seat_code, seat_name, seat_type, reservable, position_x, position_y, rotation, sort_order)
select t.id_space_setup, t.id_table,
       (case s.setup_code when 'FIKIRHANE_COWORK_V1' then 'F' else 'A' end) || lpad(((tn - 1) * 4 + k)::text, 2, '0'),
       t.table_name || ' — Koltuk ' || k, 'standard', true,
       round(t.position_x + case when k in (1, 3) then -0.06 else 0.06 end, 3),
       round(t.position_y + case when k <= 2 then -0.12 else 0.12 end, 3),
       case when k <= 2 then 180 else 0 end,
       ((tn - 1) * 4 + k) * 10
from tables t
join space_setups s using (id_space_setup)
cross join lateral (select substr(t.table_code, 2)::int as tn) x
cross join generate_series(1, 4) as k;
