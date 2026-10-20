-- 00306: لا جدول في public بلا RLS، وorkshops/overrides محميان
do $$
declare n int; t text;
begin
  select count(*), string_agg(c.relname, ', ') into n, t from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n > 0 then raise exception 'FAIL tables without RLS: %', t; end if;
  if not exists (select 1 from pg_policies where tablename = 'maintenance_workshops' and cmd = 'SELECT') then raise exception 'FAIL workshops read policy missing'; end if;
  if exists (select 1 from pg_policies where tablename = 'maintenance_workshops' and cmd <> 'SELECT') then raise exception 'FAIL workshops must be written via functions only'; end if;
  if exists (select 1 from pg_policies where tablename = 'user_page_overrides' and cmd = 'SELECT' and qual = 'true') then raise exception 'FAIL overrides still world-readable'; end if;
  if has_table_privilege('anon', 'public.maintenance_workshops', 'select') then raise exception 'FAIL anon can read workshops'; end if;
  raise notice 'security rls hardening test ok';
end$$;
