-- Growth & sponsorship (CAMPAIGNS, INVITATIONS, FREEPASSES, USER_ACQUISITIONS,
-- SPONSORSHIP_PLANS, CLUB_SPONSORSHIPS, SPONSORSHIP_USAGE). FREEPASS_REDEMPTIONS lives with BOOKINGS (0011).

create table campaigns (
  id_campaign uuid primary key default gen_random_uuid(),
  campaign_code text not null unique check (campaign_code ~ '^[A-Z0-9_]+$'),
  campaign_name text not null,
  campaign_type text not null check (campaign_type in
    ('acquisition', 'freepass', 'referral', 'invitation', 'promotion', 'partnership', 'retention', 'reactivation')),
  description text,
  start_at timestamptz,
  end_at timestamptz,
  target_audience text,
  default_freepass_usage_limit int check (default_freepass_usage_limit > 0),
  default_freepass_valid_days int check (default_freepass_valid_days > 0),
  default_booking_unit_grant text check (default_booking_unit_grant in ('location', 'table', 'seat')),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled', 'archived')),
  budget_amount numeric(14,2) check (budget_amount >= 0),
  currency_code char(3) check (currency_code ~ '^[A-Z]{3}$'),
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (end_at is null or start_at is null or end_at >= start_at)
);

create table invitations (
  id_invitation uuid primary key default gen_random_uuid(),
  id_campaign uuid references campaigns,
  id_event uuid references events,
  id_club uuid references clubs,
  invited_by_user_id uuid references users,
  invited_by_organization_id uuid references organizations,
  invited_user_id uuid references users,
  guest_first_name text,
  guest_last_name text,
  guest_email text check (guest_email = lower(btrim(guest_email))),
  guest_phone text,
  invitation_code text not null unique check (length(invitation_code) >= 8),
  invitation_type text not null check (invitation_type in
    ('general', 'event', 'bring_a_guest', 'campaign', 'organization_guest', 'club_invitation', 'membership_invitation')),
  source text check (source in
    ('email', 'sms', 'whatsapp', 'qr', 'physical_card', 'instagram', 'linkedin', 'staff', 'partner', 'web', 'mobile_app')),
  status text not null default 'draft' check (status in ('draft', 'sent', 'opened', 'accepted', 'expired', 'cancelled', 'declined')),
  sent_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  claimed_by_user_id uuid references users,
  cancelled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  -- INV-D05: invitee identified by a user or by guest contact info.
  check (invited_user_id is not null or guest_email is not null or guest_phone is not null),
  check (invited_by_user_id is not null or invited_by_organization_id is not null or id_campaign is not null),
  check (status <> 'cancelled' or cancelled_at is not null)
);
create unique index invitations_open_guest_uq on invitations (id_campaign, guest_email)
  where guest_email is not null and id_campaign is not null and status in ('draft', 'sent', 'opened');

create table freepasses (
  id_freepass uuid primary key default gen_random_uuid(),
  id_campaign uuid references campaigns,
  id_invitation uuid references invitations,
  id_user uuid references users,
  issued_to_name text,
  issued_to_email text check (issued_to_email = lower(btrim(issued_to_email))),
  issued_to_phone text,
  freepass_code text not null unique check (length(freepass_code) >= 8),
  freepass_type text not null check (freepass_type in
    ('trial', 'campaign', 'referral', 'guest', 'sponsor_guest', 'compensation', 'vip', 'manual')),
  distribution_source text check (distribution_source in
    ('instagram', 'linkedin', 'email', 'university_partner', 'gym_partner', 'physical_card', 'admin', 'referral', 'sponsor', 'other')),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  usage_limit int not null default 1 check (usage_limit > 0),
  booking_unit_grant text check (booking_unit_grant in ('location', 'table', 'seat')),
  id_event uuid references events,
  id_club uuid references clubs,
  event_type text check (event_type in ('workspace', 'meetup', 'workshop', 'talk', 'class', 'social')),
  status text not null default 'active' check (status in ('active', 'cancelled', 'expired')),
  issued_at timestamptz not null default now(),
  issued_by_user_id uuid references users,
  claimed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references users,
  cancellation_reason text,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (valid_until > valid_from),
  check (status <> 'cancelled' or cancelled_at is not null)
);
create index freepasses_user_idx on freepasses (id_user);
create index freepasses_status_idx on freepasses (status, valid_until);

create table user_acquisitions (
  id_user_acquisition uuid primary key default gen_random_uuid(),
  id_user uuid not null unique references users,
  source text not null check (source in
    ('organic', 'instagram', 'linkedin', 'google', 'email', 'referral', 'invitation', 'freepass', 'partner',
     'university', 'corporate', 'walk_in', 'event', 'other')),
  medium text,
  id_campaign uuid references campaigns,
  id_invitation uuid references invitations,
  id_freepass uuid references freepasses,
  referrer_user_id uuid references users,
  referrer_organization_id uuid references organizations,
  landing_source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  first_touch_at timestamptz,
  converted_at timestamptz,
  conversion_type text check (conversion_type in
    ('account_created', 'first_booking', 'first_attendance', 'first_paid_booking', 'membership_approved')),
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (referrer_user_id is distinct from id_user)
);

create table sponsorship_plans (
  id_sponsorship_plan uuid primary key default gen_random_uuid(),
  plan_code text not null unique check (plan_code ~ '^[A-Z0-9_]+$'),
  plan_name text not null,
  description text,
  default_duration_months int check (default_duration_months > 0),
  default_fee_amount numeric(14,2) check (default_fee_amount >= 0),
  currency_code char(3) check (currency_code ~ '^[A-Z]{3}$'),
  billing_period text check (billing_period in ('one_time', 'monthly', 'quarterly', 'annual', 'custom')),
  sponsored_events_limit int check (sponsored_events_limit >= 0),
  guest_pass_limit int check (guest_pass_limit >= 0),
  content_post_limit int check (content_post_limit >= 0),
  speaker_nomination_limit int check (speaker_nomination_limit >= 0),
  branding_level text check (branding_level in ('basic', 'standard', 'enhanced', 'main')),
  priority_level int,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);

create table club_sponsorships (
  id_club_sponsorship uuid primary key default gen_random_uuid(),
  id_club uuid not null references clubs,
  id_organization uuid not null references organizations,
  id_sponsorship_plan uuid references sponsorship_plans,
  sponsorship_name text,
  start_date date not null,
  end_date date,
  status text not null default 'draft' check (status in ('draft', 'pending', 'active', 'expired', 'cancelled', 'terminated')),
  fee_amount numeric(14,2) check (fee_amount >= 0),
  currency_code char(3) check (currency_code ~ '^[A-Z]{3}$'),
  billing_period text check (billing_period in ('one_time', 'monthly', 'quarterly', 'annual', 'custom')),
  is_primary_sponsor boolean not null default false,
  contract_reference text,
  -- Agreed entitlement snapshot (SPLAN-D06, SUSE-D10); plan changes never alter these.
  agreed_event_limit int check (agreed_event_limit >= 0),
  agreed_guest_pass_limit int check (agreed_guest_pass_limit >= 0),
  agreed_content_post_limit int check (agreed_content_post_limit >= 0),
  agreed_speaker_nomination_limit int check (agreed_speaker_nomination_limit >= 0),
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (end_date is null or end_date >= start_date),
  -- CSPON-D06: at most one active primary sponsor per club in overlapping periods.
  exclude using gist (id_club with =, daterange(start_date, coalesce(end_date, 'infinity'::date), '[]') with &&)
    where (is_primary_sponsor and status = 'active')
);

-- CSPON-D02 / SPLAN-D07: active sponsor organization and active plan for new sponsorships.
create function club_sponsorships_validate() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from organizations where id_organization = new.id_organization and status = 'active') then
    raise exception 'Sponsor organization must be active' using errcode = 'check_violation';
  end if;
  if new.id_sponsorship_plan is not null and not exists (
      select 1 from sponsorship_plans where id_sponsorship_plan = new.id_sponsorship_plan and status = 'active') then
    raise exception 'Sponsorship plan must be active' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger club_sponsorships_validate before insert on club_sponsorships for each row execute function club_sponsorships_validate();

create table sponsorship_usage (
  id_sponsorship_usage uuid primary key default gen_random_uuid(),
  id_club_sponsorship uuid not null references club_sponsorships,
  usage_type text not null check (usage_type in ('sponsored_event', 'guest_pass', 'content_post', 'speaker_nomination', 'branding', 'other')),
  quantity int not null default 1 check (quantity > 0),
  usage_date timestamptz not null default now(),
  id_event uuid references events,
  id_user uuid references users,
  reference_type text check (reference_type in ('freepass', 'invitation')),
  reference_id uuid,
  status text not null default 'active' check (status in ('active', 'reversed', 'cancelled')),
  description text,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check ((reference_type is null) = (reference_id is null))
);
create index sponsorship_usage_rights_idx on sponsorship_usage (id_club_sponsorship, usage_type, status);
create index sponsorship_usage_reference_idx on sponsorship_usage (reference_type, reference_id);

create trigger campaigns_no_delete before delete on campaigns for each row execute function forbid_delete();
create trigger invitations_no_delete before delete on invitations for each row execute function forbid_delete();
create trigger freepasses_no_delete before delete on freepasses for each row execute function forbid_delete();
create trigger user_acquisitions_no_delete before delete on user_acquisitions for each row execute function forbid_delete();
create trigger sponsorship_plans_no_delete before delete on sponsorship_plans for each row execute function forbid_delete();
create trigger club_sponsorships_no_delete before delete on club_sponsorships for each row execute function forbid_delete();
create trigger sponsorship_usage_no_delete before delete on sponsorship_usage for each row execute function forbid_delete();

select attach_updated_at_triggers();
