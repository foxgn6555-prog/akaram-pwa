-- 00349 (الجولة A) · حماية الكتابة من التكرار والتزامن — على مستوى الخادم (الضمان الحقيقي، لا الواجهة)
-- ① app.guard_duplicate: الاستدعاء نفسه (المستخدم نفسه + الدالة نفسها + المعاملات نفسها) خلال نافذة قصيرة (افتراضي 8 ثوانٍ) يُرفض بـ DUPLICATE_SUBMIT.
--    قفل استشاري على بصمة الاستدعاء يجعل النقرتين المتزامنتين تتسلسلان: الأولى تُنفَّذ وتُسجَّل، الثانية تنتظر ثم ترى السجل فتُرفض. فشل الدالة يُلغي التسجيل (إعادة المحاولة مسموحة).
-- ② قفل لكل سجل: أي دالة كتابة معاملُها الأول uuid تأخذ pg_advisory_xact_lock على ذلك المعرّف — شخصان يقرران/يسلّمان/يعتمدان السجل نفسه معاً ⇒ يتسلسلان، والثاني يرى الحالة الجديدة ويحصل على رسالة «نُفِّذ سابقاً» من منطق الدالة نفسه.
-- ③ التطبيق موحّد بلا إعادة كتابة: كل دالة كتابة حساسة تُنقل كما هي إلى app.<الاسم>__raw (غير مكشوفة لواجهة API) ويُنشأ غلاف public بالتوقيع نفسه يستدعي الحارس ثم الأصل. التواقيع والصلاحيات والسلوك محفوظة.
-- النافذة قابلة للضبط بالإعداد app.dedup_window_seconds (0 = تعطيل — للاختبارات فقط).

create table if not exists app.recent_writes (
  fp         text primary key,
  user_id    uuid,
  fn         text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists recent_writes_created_idx on app.recent_writes (created_at);
revoke all on app.recent_writes from public, anon, authenticated;

create or replace function app.dedup_window() returns interval language sql stable as $$
  select make_interval(secs => coalesce(nullif(current_setting('app.dedup_window_seconds', true), '')::numeric, 8))
$$;

create or replace function app.guard_duplicate(p_fn text, p_args jsonb) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_fp text; v_prev timestamptz; v_win interval := app.dedup_window();
begin
  if v_win <= interval '0' then return; end if;
  v_fp := md5(coalesce(auth.uid()::text, 'anon') || '|' || p_fn || '|' || coalesce(p_args::text, ''));
  perform pg_advisory_xact_lock(hashtextextended(v_fp, 0));
  select w.created_at into v_prev from app.recent_writes w where w.fp = v_fp;
  if v_prev is not null and v_prev > clock_timestamp() - v_win then raise exception 'DUPLICATE_SUBMIT'; end if;
  insert into app.recent_writes (fp, user_id, fn) values (v_fp, auth.uid(), p_fn)
  on conflict (fp) do update set created_at = clock_timestamp(), user_id = excluded.user_id;
  if random() < 0.005 then delete from app.recent_writes w where w.created_at < clock_timestamp() - interval '1 day'; end if;
end$$;
revoke all on function app.guard_duplicate(text, jsonb) from public, anon, authenticated;

create or replace function app.guard_record_lock(p_id uuid) returns void language sql as $$
  select pg_advisory_xact_lock(hashtextextended(p_id::text, 42)) where p_id is not null
$$;

-- ④ مولّد الأغلفة
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
    v_sec := case when r.prosecdef then 'security definer' else 'security invoker' end;
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

-- ⑤ قائمة دوال الكتابة الحساسة (إنشاء/تسجيل/قرار/تسليم/اعتماد/إقفال) — المصدر الوحيد: app.guarded_write_functions()
create or replace function app.guarded_write_functions() returns text[] language sql immutable as $$
  select array[
    -- موافقات وقرارات
    'approval_decide_request','hr_leave_decide','hr_leave_request','hr_leave_cancel','supply_request_decide','supply_request_deliver','supply_request_create',
    'termination_request_create','termination_request_decide','disclosure_submit','disclosure_decide','advance_request_create','advance_decide','advance_deliver','advance_settle_cash',
    'hire_request_create','hire_request_decide','hire_request_cancel','hire_request_complete','hr_employee_create','hr_employee_terminate',
    'cold_archive_package_create','cold_archive_purge_request','cold_archive_purge_decide','cold_archive_purge_approve','cold_archive_purge_confirm',
    'complaint_report_decide','complaint_approve_report','complaint_decide_deletion','complaint_create_item_from_inbox','complaint_batch_create_items_from_inbox',
    'complaint_start_item','complaint_complete_item','complaint_start_assignment_ticket','complaint_complete_assignment_ticket',
    -- مالية ورواتب وحضور
    'finance_payroll_approve','finance_payroll_adjust','finance_payroll_reconcile','finance_treasury_confirm','exec_treasury_record','deputy_payroll_approve',
    'ops_attendance_confirm','ops_contractor_month_approve','ops_deduction_add','it_deduction_exemption_add','contractor_checkin',
    -- حركة الآليات والمحطة والصيانة
    'garage_record_departure','garage_record_return','garage_record_shift_departure','garage_decide_maintenance_dispatch','garage_decide_tank_zero',
    'sector_confirm_vehicle_arrival','sector_confirm_vehicle_site_return','sector_submit_breakdown','sector_submit_supply','sector_supply_submit','sector_support_request_create',
    'station_confirm_vehicle_arrival','station_record_exit','ts_record_weighing','ts_complete_weighing',
    'maintenance_approve_readiness','maintenance_complete_case','maintenance_confirm_arrival','maintenance_inventory_create','maintenance_purchase_create',
    -- الإعلام والمواطن
    'media_design_create','media_design_complete','media_template_create','citizen_complaint_submit','citizen_chat_request'
  ]
$$;

do $$ declare f text; total int := 0; begin
  foreach f in array app.guarded_write_functions() loop total := total + app.wrap_write_guard(f); end loop;
  raise notice 'write guards installed: % functions', total;
end $$;

-- ⑥ فحص ذاتي: كل دالة في القائمة محمية فعلاً (يُستخدم في الاختبارات ولمنع التراجع عند استبدال دالة لاحقاً)
create or replace function app.write_guard_audit() returns table(fn text, guarded boolean)
language sql stable security definer set search_path = public, app as $$
  select g.fn, exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                      where ns.nspname = 'public' and p.proname = g.fn and p.prosrc like '%app.guard_duplicate(%')
  from unnest(app.guarded_write_functions()) g(fn)
$$;
