-- Catalog, documents, money ledger and stock ledger
-- (ITEMS, DOCUMENTS, DOCUMENT_ITEMS, TRANSACTIONS, TRANSACTION_ALLOCATIONS, STOCK_MOVEMENTS).
-- STOCK_COUNTS / STOCK_COUNT_ITEMS are referenced by STOCK_MOVEMENTS but undocumented; minimal versions here.

create table items (
  id_item uuid primary key default gen_random_uuid(),
  item_code text not null unique check (item_code ~ '^[A-Z0-9_]+$'),
  item_name text not null,
  item_type text not null check (item_type in ('stock_item', 'nonstock_item', 'service')),
  item_category text check (item_category in
    ('beverage', 'food', 'ingredient', 'consumable', 'workspace_service', 'event_service', 'membership', 'sponsorship', 'administrative')),
  unit text not null check (unit in ('piece', 'kg', 'gram', 'liter', 'ml', 'pack', 'session', 'hour', 'month', 'year')),
  stock_behavior text check (stock_behavior in ('resale', 'ingredient', 'consumable', 'prepared')),
  is_sellable boolean not null default false,
  is_purchasable boolean not null default false,
  is_stock_tracked boolean not null default false,
  default_selling_price numeric(12,2) check (default_selling_price >= 0),
  currency_code char(3) check (currency_code ~ '^[A-Z]{3}$'),
  default_tax_rate numeric(5,2) check (default_tax_rate between 0 and 100),
  default_financial_center_id uuid references financial_centers,
  default_revenue_category_id uuid references financial_categories,
  default_expense_category_id uuid references financial_categories,
  current_stock numeric(14,3),
  reorder_level numeric(14,3),
  target_stock numeric(14,3),
  storage_area text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (item_type <> 'service' or (not is_stock_tracked and stock_behavior is null))
);
create trigger items_code_fixed before update on items for each row execute function forbid_code_change('item_code');

create table documents (
  id_document uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('sale', 'purchase')),
  document_type text not null check (document_type in ('invoice', 'receipt', 'internal')),
  document_number text,
  document_date date not null default current_date,
  id_user uuid references users,
  id_organization uuid references organizations,
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  subtotal_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  reference_number text,
  description text,
  billing_name text,
  billing_tax_number text,
  billing_tax_office text,
  billing_address text,
  posted_at timestamptz,
  posted_by_user_id uuid references users,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references users,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (not (id_user is not null and id_organization is not null)),
  check (grand_total = subtotal_amount - discount_amount + tax_amount),
  check (status <> 'posted' or (posted_at is not null and document_number is not null)),
  check (status <> 'cancelled' or cancelled_at is not null)
);
-- Internal sale numbering is global; supplier numbers are unique per supplier.
create unique index documents_sale_number_uq on documents (document_number) where direction = 'sale' and document_number is not null;
create unique index documents_purchase_number_uq on documents (id_organization, document_number)
  where direction = 'purchase' and document_number is not null;

create table document_items (
  id_document_item uuid primary key default gen_random_uuid(),
  id_document uuid not null references documents,
  line_no int not null check (line_no > 0),
  id_item uuid references items,
  id_booking uuid references bookings,
  id_financial_center uuid not null references financial_centers,
  id_financial_category uuid not null references financial_categories,
  description text not null check (btrim(description) <> ''),
  quantity numeric(14,3) not null check (quantity > 0),
  unit text,
  unit_price numeric(14,2) not null check (unit_price >= 0),
  gross_amount numeric(14,2) not null,
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  net_amount numeric(14,2) not null,
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  line_total numeric(14,2) not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  unique (id_document, line_no),
  check (gross_amount = round(quantity * unit_price, 2)),
  check (net_amount = gross_amount - discount_amount),
  check (net_amount >= 0),
  check (line_total = net_amount + tax_amount)
);
create index document_items_booking_idx on document_items (id_booking);
create index document_items_center_idx on document_items (id_financial_center);
create index document_items_category_idx on document_items (id_financial_category);

-- DITEM-D05/D10, DOC-D06: lines change only while the document is a draft; category direction follows document direction.
create function document_items_guard() returns trigger language plpgsql as $$
declare doc record; target uuid := coalesce(new.id_document, old.id_document);
begin
  select status, direction into doc from documents where id_document = target;
  if doc.status <> 'draft' then
    raise exception 'Lines of a % document cannot be changed', doc.status using errcode = 'check_violation';
  end if;
  if tg_op <> 'DELETE' then
    if (select direction from financial_categories where id_financial_category = new.id_financial_category)
       <> (case doc.direction when 'sale' then 'income' else 'expense' end) then
      raise exception 'Category direction does not match document direction' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from financial_centers where id_financial_center = new.id_financial_center and status = 'active')
       or not exists (select 1 from financial_categories where id_financial_category = new.id_financial_category and status = 'active') then
      raise exception 'Financial center and category must be active' using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger document_items_guard before insert or update or delete on document_items
  for each row execute function document_items_guard();

-- Posting requires lines whose totals match the header; posted documents keep their commercial fields (DOC-D04/D06).
create function documents_guard() returns trigger language plpgsql as $$
declare line_sum numeric; line_count int;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Posted or cancelled documents cannot be deleted' using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if old.status = 'cancelled' then
    raise exception 'Cancelled documents are final' using errcode = 'check_violation';
  end if;
  if old.status = 'posted' then
    if new.status not in ('posted', 'cancelled')
       or (new.direction, new.document_type, new.document_number, new.document_date, new.id_user, new.id_organization,
           new.currency_code, new.subtotal_amount, new.discount_amount, new.tax_amount, new.grand_total)
          is distinct from
          (old.direction, old.document_type, old.document_number, old.document_date, old.id_user, old.id_organization,
           old.currency_code, old.subtotal_amount, old.discount_amount, old.tax_amount, old.grand_total) then
      raise exception 'Posted documents are locked; cancel and re-issue instead' using errcode = 'check_violation';
    end if;
  end if;
  if new.status = 'posted' and old.status = 'draft' then
    select count(*), coalesce(sum(line_total), 0) into line_count, line_sum from document_items where id_document = new.id_document;
    if line_count = 0 then
      raise exception 'A document cannot be posted without lines' using errcode = 'check_violation';
    end if;
    if line_sum <> new.grand_total then
      raise exception 'Document total % does not match lines %', new.grand_total, line_sum using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger documents_guard before update or delete on documents for each row execute function documents_guard();

create table transactions (
  id_transaction uuid primary key default gen_random_uuid(),
  transaction_at timestamptz not null default now(),
  transaction_type text not null check (transaction_type in ('collection', 'expense_payment', 'transfer', 'refund', 'adjustment')),
  from_account_id uuid references accounts on delete restrict,
  to_account_id uuid references accounts on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  payment_method text check (payment_method in ('cash', 'credit_card', 'debit_card', 'bank_transfer', 'online_payment', 'other')),
  status text not null default 'pending' check (status in ('pending', 'posted', 'failed', 'cancelled', 'reversed')),
  reference_number text,
  provider_name text,
  provider_transaction_id text,
  description text,
  posted_at timestamptz,
  reversed_at timestamptz,
  reversed_by_user_id uuid references users,
  reversal_reason text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (from_account_id is distinct from to_account_id),
  check (transaction_type <> 'collection' or (from_account_id is null and to_account_id is not null)),
  check (transaction_type not in ('expense_payment', 'refund') or (from_account_id is not null and to_account_id is null)),
  check (transaction_type <> 'transfer' or (from_account_id is not null and to_account_id is not null)),
  check (transaction_type <> 'adjustment' or ((from_account_id is null) <> (to_account_id is null))),
  check (transaction_type <> 'adjustment' or description is not null),
  check (status <> 'posted' or posted_at is not null),
  check (status <> 'reversed' or (reversed_at is not null and reversal_reason is not null))
);
create unique index transactions_provider_uq on transactions (provider_name, provider_transaction_id) where provider_transaction_id is not null;
create index transactions_from_idx on transactions (from_account_id, status);
create index transactions_to_idx on transactions (to_account_id, status);

-- ACC-D09/D10, TRX-D11/D12: active accounts in the same currency; posted money movements are frozen and kept.
create function transactions_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'pending' then
      raise exception 'Only pending transactions can be deleted' using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' or (new.from_account_id, new.to_account_id, new.currency_code) is distinct from (old.from_account_id, old.to_account_id, old.currency_code) then
    if exists (select 1 from accounts where id_account in (new.from_account_id, new.to_account_id)
               and (status <> 'active' or currency_code <> new.currency_code)) then
      raise exception 'Accounts must be active and in the transaction currency' using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.status in ('posted', 'reversed', 'failed', 'cancelled') then
    if (new.amount, new.currency_code, new.from_account_id, new.to_account_id, new.transaction_type, new.transaction_at)
       is distinct from (old.amount, old.currency_code, old.from_account_id, old.to_account_id, old.transaction_type, old.transaction_at) then
      raise exception 'Finalized transactions cannot be edited; reverse and re-enter' using errcode = 'check_violation';
    end if;
    if old.status = 'posted' and new.status not in ('posted', 'reversed') then
      raise exception 'A posted transaction can only be reversed' using errcode = 'check_violation';
    end if;
    if old.status <> 'posted' and new.status <> old.status then
      raise exception 'Transaction status % is final', old.status using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger transactions_guard before insert or update or delete on transactions for each row execute function transactions_guard();

create table transaction_allocations (
  id_transaction_allocation uuid primary key default gen_random_uuid(),
  id_transaction uuid not null references transactions on delete restrict,
  id_document uuid not null references documents on delete restrict,
  allocated_amount numeric(14,2) not null check (allocated_amount > 0),
  allocation_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'reversed')),
  reversed_at timestamptz,
  reversed_by_user_id uuid references users,
  reversal_reason text,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (status <> 'reversed' or (reversed_at is not null and reversal_reason is not null))
);
create unique index transaction_allocations_active_uq on transaction_allocations (id_transaction, id_document) where status = 'active';
create index transaction_allocations_document_idx on transaction_allocations (id_document);

-- TALLOC-D03/D04/D06/D07/D10.
create function transaction_allocations_guard() returns trigger language plpgsql as $$
declare trx record; doc record; trx_used numeric; doc_used numeric;
begin
  if new.status <> 'active' then return new; end if;
  select * into trx from transactions where id_transaction = new.id_transaction for update;
  select * into doc from documents where id_document = new.id_document for update;
  if trx.transaction_type = 'transfer' then
    raise exception 'Transfers are never allocated to documents' using errcode = 'check_violation';
  end if;
  if trx.status <> 'posted' then
    raise exception 'Only posted transactions can be allocated' using errcode = 'check_violation';
  end if;
  if doc.status <> 'posted' then
    raise exception 'Only posted documents can receive allocations' using errcode = 'check_violation';
  end if;
  if trx.currency_code <> doc.currency_code then
    raise exception 'Transaction and document currencies differ' using errcode = 'check_violation';
  end if;
  select coalesce(sum(allocated_amount), 0) into trx_used from transaction_allocations
    where id_transaction = new.id_transaction and status = 'active' and id_transaction_allocation <> new.id_transaction_allocation;
  select coalesce(sum(allocated_amount), 0) into doc_used from transaction_allocations
    where id_document = new.id_document and status = 'active' and id_transaction_allocation <> new.id_transaction_allocation;
  if trx_used + new.allocated_amount > trx.amount then
    raise exception 'Allocations exceed transaction amount' using errcode = 'check_violation';
  end if;
  if doc_used + new.allocated_amount > doc.grand_total then
    raise exception 'Allocations exceed document total' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger transaction_allocations_guard before insert or update of status, allocated_amount on transaction_allocations
  for each row execute function transaction_allocations_guard();

create table stock_counts (
  id_stock_count uuid primary key default gen_random_uuid(),
  count_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'completed', 'approved', 'posted', 'cancelled')),
  notes text,
  approved_at timestamptz,
  approved_by_user_id uuid references users,
  posted_at timestamptz,
  posted_by_user_id uuid references users,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);

create table stock_count_items (
  id_stock_count_item uuid primary key default gen_random_uuid(),
  id_stock_count uuid not null references stock_counts,
  id_item uuid not null references items,
  system_quantity numeric(14,3) not null,
  counted_quantity numeric(14,3) check (counted_quantity >= 0),
  variance_quantity numeric(14,3) generated always as (counted_quantity - system_quantity) stored,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  unique (id_stock_count, id_item)
);

create table stock_movements (
  id_stock_movement uuid primary key default gen_random_uuid(),
  id_item uuid not null references items,
  movement_at timestamptz not null default now(),
  movement_type text not null check (movement_type in
    ('purchase_receive', 'sale', 'consumption', 'waste', 'count_adjustment', 'manual_adjustment', 'return_in', 'return_out', 'opening_balance')),
  quantity numeric(14,3) not null check (quantity <> 0),
  unit_cost numeric(14,2) check (unit_cost >= 0),
  id_document_item uuid references document_items,
  id_stock_count_item uuid references stock_count_items,
  reason_code text check (reason_code in ('expired', 'damaged', 'spillage', 'staff_use', 'count_variance', 'data_correction', 'theft_loss', 'other')),
  notes text,
  reversed_movement_id uuid references stock_movements,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  -- SMOV-D03/D04/D05 (a reversal movement carries the opposite sign of the movement it reverses).
  check (
    reversed_movement_id is not null or
    (movement_type in ('purchase_receive', 'return_in', 'opening_balance') and quantity > 0) or
    (movement_type in ('sale', 'consumption', 'waste', 'return_out') and quantity < 0) or
    movement_type in ('count_adjustment', 'manual_adjustment')),
  check (movement_type not in ('waste', 'manual_adjustment') or reason_code is not null)
);
create index stock_movements_item_idx on stock_movements (id_item, movement_at);
create index stock_movements_document_item_idx on stock_movements (id_document_item);

-- SMOV-D01 and the current_stock cache maintained in the same transaction (ITEM-D09, SMOV-D10).
create function stock_movements_apply() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from items where id_item = new.id_item and is_stock_tracked) then
    raise exception 'Stock movements require a stock-tracked item' using errcode = 'check_violation';
  end if;
  update items set current_stock = coalesce(current_stock, 0) + new.quantity where id_item = new.id_item;
  return new;
end $$;
create trigger stock_movements_apply after insert on stock_movements for each row execute function stock_movements_apply();
create trigger stock_movements_append_only before update or delete on stock_movements for each row execute function forbid_change();

create trigger items_no_delete before delete on items for each row execute function forbid_delete();
create trigger transaction_allocations_no_delete before delete on transaction_allocations for each row execute function forbid_delete();
create trigger stock_counts_no_delete before delete on stock_counts for each row execute function forbid_delete();

select attach_updated_at_triggers();
