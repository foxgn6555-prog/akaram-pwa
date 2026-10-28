-- 00306 (00361) · إصلاح «permission denied for function guard_duplicate» في المحطة التحويلية (كتابة الوزن / إكمال الوزن)
--   السبب: غلافا 00291 لدالتي ts_record_weighing وts_complete_weighing وُلِّدا security invoker (لأن الأصل كان كذلك)،
--   بينما app.guard_duplicate ممنوعة على authenticated ⇒ الاستدعاء من حساب المحطة يفشل قبل الوصول للأصل.
--   الحل الجذري: كل غلاف حارس يعمل security definer (الصلاحية تُفحص داخل الحارس والأصل)، وفحص ذاتي يمنع التراجع.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosrc like '%app.guard_duplicate(%' and not p.prosecdef loop
    execute format('alter function %s security definer', r.sig);
    execute format('alter function %s set search_path = public, app', r.sig);
    raise notice 'guard wrapper → security definer: %', r.sig;
  end loop;
end $$;

-- الفحص الذاتي: محمية + security definer
create or replace function app.write_guard_audit() returns table(fn text, guarded boolean)
language sql stable security definer set search_path = public, app as $$
  select g.fn, exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                      where ns.nspname = 'public' and p.proname = g.fn and p.prosrc like '%app.guard_duplicate(%' and p.prosecdef)
  from unnest(app.guarded_write_functions()) g(fn)
$$;

-- المولّد نفسه: أي غلاف يُنشأ لاحقاً يكون security definer
create or replace function app.wrap_write_guard(p_name text) returns int
language plpgsql security definer set search_path = public, app as $wrap$
declare r record; n int := 0; v_in_names text[]; v_call text; v_json text; v_body text; v_sec text; v_lock text; v_raw text;
begin
  for r in
    select p.oid, p.proname, p.prorettype, p.proretset, p.prosecdef, p.proargnames, p.proargmodes, p.proargtypes,
           pg_get_function_arguments(p.oid) as args_full, pg_get_function_identity_arguments(p.oid) as args_ident, pg_get_function_result(p.oid) as result
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = p_name and p.prokind = 'f'
  loop
    v_raw := r.proname || '__raw';
    if exists (select 1 from pg_proc q join pg_namespace qn on qn.oid = q.pronamespace where qn.nspname = 'app' and q.proname = v_raw
               and pg_get_function_identity_arguments(q.oid) = r.args_ident) then continue; end if;
    -- أسماء معاملات الإدخال فقط (بدون OUT/TABLE)
    select coalesce(array_agg(nm order by ord), '{}') into v_in_names
    from unnest(r.proargnames) with ordinality a(nm, ord)
    where r.proargmodes is null or r.proargmodes[ord] in ('i', 'b', 'v');
    if r.proargnames is null then
      select coalesce(array_agg('a' || i::text), '{}') into v_in_names from generate_series(1, coalesce(array_length(r.proargtypes::oid[], 1), 0)) i;
    end if;
    if cardinality(v_in_names) > 0 and r.proargnames is null then
      raise exception 'WRAP_UNNAMED_ARGS: %', r.proname;
    end if;
    v_call := (select coalesce(string_agg(quote_ident(x), ', '), '') from unnest(v_in_names) x);
    v_json := case when cardinality(v_in_names) = 0 then '''{}''::jsonb'
                   else 'jsonb_build_object(' || (select string_agg(quote_literal(x) || ', ' || quote_ident(x), ', ') from unnest(v_in_names) x) || ')' end;
    -- قفل السجل إذا كان المعامل الأول uuid
    v_lock := case when cardinality(v_in_names) > 0 and format_type(r.proargtypes[0], null) = 'uuid' then format('perform app.guard_record_lock(%I);', v_in_names[1]) else '' end;
    v_sec := 'security definer';   -- 00306: الغلاف دائماً security definer كي يصل إلى app.guard_duplicate؛ الأصل يحتفظ بوضعه وفحوصه
    v_body := case when r.proretset then format('return query select * from app.%I(%s);', v_raw, v_call)
                   when r.result = 'void' then format('perform app.%I(%s);', v_raw, v_call)
                   else format('return app.%I(%s);', v_raw, v_call) end;
    execute format('alter function public.%I(%s) rename to %I', r.proname, r.args_ident, v_raw);
    execute format('alter function public.%I(%s) set schema app', v_raw, r.args_ident);
    execute format('revoke all on function app.%I(%s) from public, anon', v_raw, r.args_ident);
    execute format('grant execute on function app.%I(%s) to authenticated', v_raw, r.args_ident);
    execute format($f$create function public.%I(%s) returns %s language plpgsql %s set search_path = public, app as $w$
begin
  -- 00291: حارس التكرار/التزامن ثم الأصل (app.%I)
  perform app.guard_duplicate(%L, %s);
  %s
  %s
end$w$
$f$, r.proname, r.args_full, r.result, v_sec, v_raw, r.proname, v_json, v_lock, v_body);
    execute format('revoke all on function public.%I(%s) from public, anon', r.proname, r.args_ident);
    execute format('grant execute on function public.%I(%s) to authenticated', r.proname, r.args_ident);
    n := n + 1;
  end loop;
  if n = 0 and not exists (select 1 from pg_proc q join pg_namespace qn on qn.oid = q.pronamespace where qn.nspname = 'app' and q.proname = p_name || '__raw') then
    raise exception 'WRAP_FUNCTION_NOT_FOUND: %', p_name;
  end if;
  return n;
end$wrap$;
revoke all on function app.wrap_write_guard(text) from public, anon, authenticated;
