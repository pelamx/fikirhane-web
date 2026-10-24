-- Reconciliation (account.reconcile): a posted money movement is ticked off once it has been matched with the bank or
-- cash statement. The mark is bookkeeping on top of the frozen transaction, so it may change after posting.

alter table transactions
  add column reconciliation_status text not null default 'unreconciled' check (reconciliation_status in ('unreconciled', 'reconciled')),
  add column reconciled_at timestamptz,
  add column reconciled_by_user_id uuid references users,
  add constraint transactions_reconciled check (reconciliation_status <> 'reconciled' or reconciled_at is not null);
