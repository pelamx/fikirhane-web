-- Foundation: extensions and shared trigger functions.
-- Naming: doc table/field names mapped to snake_case (ID_EventOption -> id_event_option).
-- Enumerations are text + CHECK so value lists can evolve without enum migrations.

create extension if not exists btree_gist;

-- Maintains updated_at on every UPDATE (USR-D09 and the shared audit column standard).
create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- History tables are never hard deleted; records are closed via status / end dates.
create function forbid_delete() returns trigger language plpgsql as $$
begin
  raise exception 'Hard delete is not allowed on %; close the record via status instead', tg_table_name
    using errcode = 'restrict_violation';
end $$;

-- Append-only ledgers and the audit log can be neither updated nor deleted.
create function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'restrict_violation';
end $$;

-- Called at the end of each migration to attach set_updated_at to every table with an updated_at column.
create function attach_updated_at_triggers() returns void language plpgsql as $$
declare t record;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_name = c.table_name and tb.table_schema = c.table_schema
    where c.table_schema = current_schema() and c.column_name = 'updated_at' and tb.table_type = 'BASE TABLE'
      and not exists (
        select 1 from pg_trigger tr join pg_class cl on cl.oid = tr.tgrelid
        where cl.relname = c.table_name and tr.tgname = c.table_name || '_set_updated_at')
  loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()',
      t.table_name || '_set_updated_at', t.table_name);
  end loop;
end $$;
