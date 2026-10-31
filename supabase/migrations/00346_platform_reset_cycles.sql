-- 00398-ج: فك الدورات القابلة للحل دون حذف خارج الاختيار واحتساب الحذف التتابعي.
create or replace function app.platform_reset_execute(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare q public.platform_reset_requests; tabs text[]; remaining text[]; nxt text[]; t text; r record; n bigint; deleted jsonb := '{}'::jsonb; total bigint := 0;
        protected uuid[]; pass int := 0; before_counts jsonb := '{}'::jsonb; changed bigint; k bigint; t0 timestamptz := clock_timestamp(); acct boolean; cols text; users_deleted int := 0; me uuid := auth.uid(); u uuid;
begin
  select * into q from public.platform_reset_requests where id = p_id for update;
  if q.id is null then raise exception 'RESET_NOT_FOUND'; end if;
  if q.status not in ('approved') then raise exception 'RESET_NOT_APPROVED'; end if;
  update public.platform_reset_requests set status = 'executing', executed_by = me, updated_at = now() where id = p_id;
  tabs := app.platform_reset_tables(q.categories);
  acct := 'accounts' = any(q.categories);
  select array_agg(distinct x) into protected from (select me x union select ur.user_id from public.user_roles ur where ur.role = 'super_admin') s where x is not null;
  -- الجداول الموجودة فعلاً فقط
  select array_agg(x) into tabs from unnest(tabs) x where exists (select 1 from pg_class k join pg_namespace ns on ns.oid = k.relnamespace where ns.nspname = 'public' and k.relname = x and k.relkind = 'r');
  if tabs is null then raise exception 'RESET_NOTHING_SELECTED'; end if;
  -- حراسة أخيرة: لا اعتمادية صلبة خارج الاختيار
  select string_agg(child || '→' || parent, '، ') into cols from app.platform_reset_hard_children(tabs);
  if cols is not null then raise exception 'RESET_DEPENDENCY: %', cols; end if;
  -- ① تعطيل المحفزات المخصصة (قفل الشهر، التدقيق…) أثناء التصفير فقط
  foreach t in array tabs loop execute format('alter table public.%I disable trigger user', t); end loop;
  -- ② إفراغ المراجع القابلة للإفراغ من الجداول الباقية إلى الجداول المحذوفة
  for r in select distinct c.relname child, a.attname col
           from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace cn on cn.oid = c.relnamespace
           join pg_class p on p.oid = k.confrelid join pg_namespace pn on pn.oid = p.relnamespace
           cross join lateral unnest(k.conkey) ck join pg_attribute a on a.attrelid = c.oid and a.attnum = ck
           where k.contype = 'f' and cn.nspname = 'public' and pn.nspname = 'public' and p.relname = any(tabs) and not (c.relname = any(tabs)) loop
    execute format('alter table public.%I disable trigger user', r.child);
    execute format('update public.%I set %I = null where %I is not null', r.child, r.col, r.col);
    execute format('alter table public.%I enable trigger user', r.child);
  end loop;
  -- إحصاء قبل الحذف لضمان احتساب الصفوف التي تحذفها المفاتيح الأجنبية تتابعياً أيضاً.
  foreach t in array tabs loop
    execute format('select count(*) from public.%I', t) into n;
    before_counts := before_counts || jsonb_build_object(t,n);
  end loop;
  -- ③ الحذف الفعلي، بلا TRUNCATE CASCADE: لا يجوز حذف جدول خارج الاختيار.
  remaining := tabs;
  while cardinality(remaining) > 0 loop
    pass := pass + 1; nxt := '{}';
    foreach t in array remaining loop
      begin
        if acct and t = any(app.platform_reset_tables(array['accounts'])) and exists (select 1 from pg_attribute a where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attname = 'user_id' and a.attnum > 0) then
          execute format('delete from public.%I where user_id is null or not (user_id = any($1))', t) using protected;
        else
          execute format('delete from public.%I where true', t);
        end if;
        get diagnostics n = row_count;
        deleted := deleted || jsonb_build_object(t, coalesce((deleted ->> t)::bigint, 0) + n); total := total + n;
      exception when foreign_key_violation or restrict_violation then nxt := nxt || t;
      end;
    end loop;
    if nxt = remaining then
      -- لا تقدم: فك المراجع الاختيارية بين الجداول المتعذرة فقط.
      -- عمود واحد قابل للإفراغ يكفي للمفتاح المركب. لا تغيّر صفوف الحسابات المحمية.
      changed := 0;
      for r in
        select distinct c.relname child, a.attname col
        from pg_constraint fk
        join pg_class c on c.oid=fk.conrelid join pg_namespace cn on cn.oid=c.relnamespace
        join pg_class p on p.oid=fk.confrelid join pg_namespace pn on pn.oid=p.relnamespace
        cross join lateral unnest(fk.conkey) ck
        join pg_attribute a on a.attrelid=c.oid and a.attnum=ck
        where fk.contype='f' and cn.nspname='public' and pn.nspname='public'
          and c.relname=any(nxt) and p.relname=any(nxt) and not a.attnotnull
      loop
        begin
          if acct and r.child=any(app.platform_reset_tables(array['accounts'])) and exists
            (select 1 from pg_attribute a where a.attrelid=('public.' || quote_ident(r.child))::regclass and a.attname='user_id' and a.attnum>0 and not a.attisdropped) then
            execute format('update public.%I set %I=null where %I is not null and (user_id is null or not (user_id=any($1)))', r.child,r.col,r.col) using protected;
          else
            execute format('update public.%I set %I=null where %I is not null', r.child,r.col,r.col);
          end if;
          get diagnostics k = row_count;
          changed := changed + k;
        exception when check_violation or not_null_violation or foreign_key_violation or restrict_violation then
          -- بعض الأعمدة الاختيارية تحكمها قيود أخرى؛ لا نخالفها ولا نحذف خارج الاختيار.
          null;
        end;
      end loop;
      if changed = 0 then
        raise exception 'RESET_CYCLE: %', array_to_string(nxt, '، ');
      end if;
    end if;
    remaining := nxt;
  end loop;
  -- الفرق قبل/بعد يشمل الحذف التتابعي ويستثني السجلات المحمية.
  deleted := '{}'::jsonb; total := 0;
  foreach t in array tabs loop
    execute format('select count(*) from public.%I', t) into n;
    k := (before_counts->>t)::bigint - n;
    if k < 0 then raise exception 'RESET_COUNT_INVALID: %', t; end if;
    deleted := deleted || jsonb_build_object(t,k); total := total + k;
  end loop;
  -- ④ حسابات الدخول: يبقى المنفِّذ والمدير المفوض فقط (وتبقى أدوارهم)
  if acct then
    for r in select distinct c.relname child, a.attname col, a.attnotnull nn
             from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace cn on cn.oid = c.relnamespace
             join pg_class p on p.oid = k.confrelid join pg_namespace pn on pn.oid = p.relnamespace
             cross join lateral unnest(k.conkey) ck join pg_attribute a on a.attrelid = c.oid and a.attnum = ck
             where k.contype = 'f' and cn.nspname = 'public' and pn.nspname = 'auth' and p.relname = 'users' and not (c.relname = any(tabs))
               and not (c.relname = any(app.platform_reset_never_tables())) and k.confdeltype not in ('c') loop
      if r.nn then raise exception 'RESET_ACCOUNTS_IN_USE: %.%', r.child, r.col; end if;
      execute format('update public.%I set %I = null where %I is not null and not (%I = any($1))', r.child, r.col, r.col, r.col) using protected;
    end loop;
    delete from auth.users where not (id = any(protected));
    get diagnostics users_deleted = row_count;
    total := total + users_deleted;
  end if;
  foreach t in array tabs loop execute format('alter table public.%I enable trigger user', t); end loop;
  -- ⑤ استرداد المساحة فعلياً (طابور الضغط 00370 — VACUUM FULL مجدول خلال دقيقة إن توفر pg_cron)
  begin
    perform app.space_reclaim_enqueue(tabs, 'platform_reset');
    perform app.space_reclaim_plan(now() + interval '1 minute');
  exception when others then null;
  end;
  update public.platform_reset_requests
     set status = 'done', executed_at = now(), updated_at = now(),
         result = jsonb_build_object('tables', cardinality(tabs), 'rows_deleted', total, 'users_deleted', users_deleted, 'protected_users', cardinality(protected),
                                     'passes', pass, 'per_table', deleted, 'duration_ms', (extract(epoch from clock_timestamp() - t0) * 1000)::int,
                                     'buckets', to_jsonb(q.storage_buckets), 'warehouse_wipe', 'gps_hotspots' = any(q.categories))
   where id = p_id;
  -- ⑥ السجل والإشعار (بعد الحذف كي يبقيا)
  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('platform_reset_requests', p_id::text, 'DELETE', jsonb_build_object('categories', q.categories, 'rows_deleted', total, 'users_deleted', users_deleted), me, 'it_admin');
  for u in select distinct ur.user_id from public.user_roles ur where ur.role in ('it_admin', 'super_admin') loop
    perform app.hr_notify(u, 'نُفِّذ تصفير المنصة', 'حُذف ' || total || ' سجل من ' || cardinality(tabs) || ' جدول (' || cardinality(q.categories) || ' فئة) · نفّذه ' || coalesce(app.user_display_name(me), 'IT'),
                          '/it/platform-reset', 'platform_reset_done:' || p_id::text, 'warning');
  end loop;
  return (select x.result from public.platform_reset_requests x where x.id = p_id);
end$$;
revoke all on function app.platform_reset_execute(uuid) from public, anon, authenticated;
