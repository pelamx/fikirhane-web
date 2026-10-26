-- Kitchen self-service (mutfak): the cafeteria open-tab model of DOCUMENTS rule 16. A customer's tab is a draft sale
-- receipt with their id_user, lines added as they scan product labels; paying it online posts the receipt, the
-- payment and the allocation together. Supporting tables, not in the design docs.

-- One open tab per person (the description marks kitchen tabs, as 'Kafeterya satışı' marks counter sales).
create unique index documents_kitchen_tab_uq on documents (id_user) where status = 'draft' and description = 'Mutfak hesabı';

-- One online payment attempt for a tab. While one is open the tab is locked, so the amount paid is the amount charged.
create table kitchen_checkouts (
  id_kitchen_checkout uuid primary key default gen_random_uuid(),
  id_document uuid not null references documents,
  id_transaction uuid not null references transactions,
  amount numeric(14,2) not null check (amount > 0),
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  provider text not null,
  provider_token text unique,
  status text not null default 'open' check (status in ('open', 'paid', 'failed', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index kitchen_checkouts_open_uq on kitchen_checkouts (id_document) where status = 'open';

-- Where online card payments land until the provider pays them out to the bank.
insert into accounts (account_code, account_name, account_type, currency_code, opening_balance, opening_balance_date, account_reference, sort_order)
values ('ONLINE_PAYMENTS', 'Online ödemeler', 'clearing', 'TRY', 0, current_date, 'Ödeme sağlayıcısının bankaya aktaracağı tutarlar', 30)
on conflict (account_code) do nothing;

select attach_updated_at_triggers();
