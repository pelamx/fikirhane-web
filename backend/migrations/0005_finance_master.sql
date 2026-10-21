-- Finance master data (FINANCIAL_CENTERS, FINANCIAL_CATEGORIES, ACCOUNTS). Created before CLUBS,
-- because every club owns exactly one financial center.

create table financial_centers (
  id_financial_center uuid primary key default gen_random_uuid(),
  center_code text not null unique check (center_code ~ '^[A-Z0-9_]+$'),
  center_name text not null,
  center_type text not null check (center_type in ('club', 'cafeteria', 'general', 'other')),
  description text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);

create table financial_categories (
  id_financial_category uuid primary key default gen_random_uuid(),
  category_code text not null unique check (category_code ~ '^[A-Z0-9_]+$'),
  category_name text not null,
  direction text not null check (direction in ('income', 'expense')),
  category_group text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (
    (direction = 'income' and category_group in ('operating_revenue', 'sponsorship', 'membership', 'cafeteria', 'other_income')) or
    (direction = 'expense' and category_group in ('people', 'marketing', 'facilities', 'technology', 'cafeteria_cost', 'administrative', 'other_expense'))
  )
);

create table accounts (
  id_account uuid primary key default gen_random_uuid(),
  account_code text not null unique check (account_code ~ '^[A-Z0-9_]+$'),
  account_name text not null,
  account_type text not null check (account_type in ('bank', 'cash', 'pos', 'clearing', 'other')),
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  opening_balance numeric(14,2) not null default 0,
  opening_balance_date date not null,
  current_balance numeric(14,2),
  bank_name text,
  account_reference text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  sort_order int,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);

-- Codes and IDs are technical identity and never change (FC-D01/02, FCAT-D01/02, ACC-D01/02).
create function forbid_code_change() returns trigger language plpgsql as $$
declare col text := tg_argv[0];
begin
  if to_jsonb(new) ->> col is distinct from to_jsonb(old) ->> col then
    raise exception '%.% cannot be changed', tg_table_name, col using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger financial_centers_code_fixed before update on financial_centers for each row execute function forbid_code_change('center_code');
create trigger financial_categories_code_fixed before update on financial_categories for each row execute function forbid_code_change('category_code');
create trigger accounts_code_fixed before update on accounts for each row execute function forbid_code_change('account_code');
create trigger accounts_currency_fixed before update on accounts for each row execute function forbid_code_change('currency_code');

create trigger financial_centers_no_delete before delete on financial_centers for each row execute function forbid_delete();
create trigger financial_categories_no_delete before delete on financial_categories for each row execute function forbid_delete();
create trigger accounts_no_delete before delete on accounts for each row execute function forbid_delete();

select attach_updated_at_triggers();
