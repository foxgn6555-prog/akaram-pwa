-- ═══════════════════════════════════════════════════════════════
-- 00166 · ثلاث مهام للتطوير المركزية
--  1) اسم المنصة: «جزيرة الأكارم» في كل النصوص المخزنة (قوالب الشكاوى، ملخصات التصاميم)
--  2) حذف وحدة «مصمم التدفقات» (FlowBridge) نهائياً: المحفّزات، الجداول، الدوال
--  3) وحدة Console: رصد حي لأخطاء وتنبيهات المنصة من كل البوابات
--     · أي مستخدم مصادق يبلّغ (دفعة) عبر console_report — محدود المعدل خادمياً
--     · التجميع ببصمة: نفس الخطأ يزيد occurrences بدل صف جديد (خلال 24 ساعة)
--     · القراءة/الحل/الإحصاء: it_admin / super_admin فقط
-- ═══════════════════════════════════════════════════════════════

-- ─── 1) اسم المنصة في البيانات المخزنة ───
update public.complaint_templates
   set layout = jsonb_set(layout, '{contractorLine}',
         to_jsonb(replace(replace(replace(layout->>'contractorLine', 'الأكرام', 'الأكارم'), 'الاكرام', 'الأكارم'), 'الاكارم', 'الأكارم')))
 where layout ? 'contractorLine'
   and (layout->>'contractorLine' like '%الأكرام%' or layout->>'contractorLine' like '%الاكرام%' or layout->>'contractorLine' like '%الاكارم%');

update public.complaint_reports
   set layout = jsonb_set(layout, '{contractorLine}',
         to_jsonb(replace(replace(replace(layout->>'contractorLine', 'الأكرام', 'الأكارم'), 'الاكرام', 'الأكارم'), 'الاكارم', 'الأكارم')))
 where layout ? 'contractorLine'
   and (layout->>'contractorLine' like '%الأكرام%' or layout->>'contractorLine' like '%الاكرام%' or layout->>'contractorLine' like '%الاكارم%');

update public.media_designs
   set summary = (
     select jsonb_object_agg(k, case when jsonb_typeof(v) = 'string'
       then to_jsonb(replace(replace(replace(v #>> '{}', 'الأكرام', 'الأكارم'), 'الاكرام', 'الأكارم'), 'الاكارم', 'الأكارم'))
       else v end)
     from jsonb_each(summary) as e(k, v))
 where summary is not null and jsonb_typeof(summary) = 'object'
   and (summary::text like '%الأكرام%' or summary::text like '%الاكرام%' or summary::text like '%الاكارم%');

-- ─── 2) حذف FlowBridge ───
drop trigger if exists trg_flowbridge_relay_audit on public.audit_logs;
drop trigger if exists trg_flowbridge_relay_integration on public.integration_logs;
drop function if exists app.flowbridge_relay_audit();
drop function if exists app.flowbridge_relay_integration();
drop trigger if exists trg_audit_flowbridge_state on public.flowbridge_state;
drop function if exists app.audit_flowbridge_state();
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'flowbridge_state') then
      execute 'alter publication supabase_realtime drop table public.flowbridge_state';
    end if;
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'flowbridge_events') then
      execute 'alter publication supabase_realtime drop table public.flowbridge_events';
    end if;
  end if;
end $$;
drop table if exists public.flowbridge_event_bindings cascade;
drop table if exists public.flowbridge_events cascade;
drop table if exists public.flowbridge_state cascade;
delete from public.role_page_permissions where page_key = 'it.flowbridge';
delete from public.user_page_overrides where page_key = 'it.flowbridge';

-- ─── 3) Console ───
-- 3.a توسيع سجل الأخطاء الحالي بدل جدول جديد (السجل القديم يبقى مقروءاً)
alter table public.app_errors
  add column if not exists level        text not null default 'error' check (level in ('error', 'warn')),
  add column if not exists source       text not null default 'logger'
    check (source in ('logger', 'window', 'promise', 'console', 'boundary', 'sdk', 'network', 'asset')),
  add column if not exists portal       text not null default 'unknown',
  add column if not exists kind         text not null default 'unknown',
  add column if not exists fingerprint  text,
  add column if not exists occurrences  integer not null default 1 check (occurrences >= 1),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists resolved_at  timestamptz,
  add column if not exists resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000);

create index if not exists idx_app_errors_fingerprint on public.app_errors (fingerprint, last_seen_at desc) where fingerprint is not null;
create index if not exists idx_app_errors_portal_kind on public.app_errors (portal, kind, last_seen_at desc);
create index if not exists idx_app_errors_level_open  on public.app_errors (level, last_seen_at desc) where not resolved;

-- 3.b التبليغ على دفعات (أي مصادق) — بصمة + حد معدل خادمي 120 حدثاً/ساعة لكل مستخدم
create or replace function public.console_report(p_events jsonb)
returns integer
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  u uuid := auth.uid();
  ev jsonb;
  v_fp text;
  v_level text;
  v_source text;
  v_kind text;
  v_portal text;
  v_msg text;
  v_count integer := 0;
  v_recent integer;
  v_id bigint;
begin
  if u is null then
    raise exception 'CONSOLE_FORBIDDEN';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 then
    raise exception 'CONSOLE_EVENTS_INVALID';
  end if;
  if jsonb_array_length(p_events) > 50 then
    raise exception 'CONSOLE_BATCH_TOO_LARGE';
  end if;
  select coalesce(sum(occurrences), 0) into v_recent
    from public.app_errors
   where user_id = u and last_seen_at > now() - interval '1 hour';
  if v_recent >= 120 then
    return 0; -- صمت: لا نكسر عميلاً مضطرباً، ولا نغرق السجل
  end if;

  for ev in select * from jsonb_array_elements(p_events) loop
    v_msg := left(coalesce(ev->>'message', ''), 500);
    if length(trim(v_msg)) = 0 then continue; end if;
    v_level  := case when ev->>'level' = 'warn' then 'warn' else 'error' end;
    v_source := case when ev->>'source' in ('logger', 'window', 'promise', 'console', 'boundary', 'sdk', 'network', 'asset') then ev->>'source' else 'logger' end;
    v_kind   := left(coalesce(nullif(trim(ev->>'kind'), ''), 'unknown'), 40);
    v_portal := left(coalesce(nullif(trim(ev->>'portal'), ''), 'unknown'), 40);
    v_fp     := left(coalesce(nullif(trim(ev->>'fingerprint'), ''), md5(v_level || '|' || v_kind || '|' || v_portal || '|' || v_msg)), 64);

    select id into v_id from public.app_errors
     where fingerprint = v_fp and not resolved and last_seen_at > now() - interval '24 hours'
     order by last_seen_at desc limit 1;
    if v_id is not null then
      update public.app_errors
         set occurrences = occurrences + greatest(1, least(coalesce((ev->>'count')::int, 1), 1000)),
             last_seen_at = now(),
             url = left(coalesce(ev->>'url', url), 500),
             context = coalesce(ev->'context', context)
       where id = v_id;
    else
      insert into public.app_errors
        (error_type, message, stack, url, user_agent, user_id, context, level, source, portal, kind, fingerprint, occurrences, last_seen_at)
      values (
        case when ev->>'error_type' in ('runtime', 'network', 'validation', 'auth') then ev->>'error_type' else 'runtime' end,
        v_msg, left(ev->>'stack', 4000), left(ev->>'url', 500), left(ev->>'user_agent', 200), u,
        coalesce(ev->'context', '{}'::jsonb), v_level, v_source, v_portal, v_kind, v_fp,
        greatest(1, least(coalesce((ev->>'count')::int, 1), 1000)), now()
      );
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.console_report(jsonb) to authenticated;

-- 3.c الخلاصة الحية (IT): بحسب المستوى/البوابة/النوع/الحالة/البحث/المدة
create or replace function public.console_feed(
  p_level text default null,
  p_portal text default null,
  p_kind text default null,
  p_resolved boolean default false,
  p_since timestamptz default null,
  p_q text default null,
  p_limit integer default 200
)
returns setof public.app_errors
language sql stable security definer
set search_path = public, app
as $$
  select e.*
    from public.app_errors e
   where app.has_role(array['it_admin', 'super_admin'])
     and (p_level is null or e.level = p_level)
     and (p_portal is null or e.portal = p_portal)
     and (p_kind is null or e.kind = p_kind)
     and (p_resolved is null or e.resolved = p_resolved)
     and (p_since is null or e.last_seen_at >= p_since)
     and (p_q is null or length(trim(p_q)) = 0 or e.message ilike '%' || trim(p_q) || '%' or coalesce(e.url, '') ilike '%' || trim(p_q) || '%')
   order by e.last_seen_at desc
   limit greatest(1, least(coalesce(p_limit, 200), 500))
$$;
grant execute on function public.console_feed(text, text, text, boolean, timestamptz, text, integer) to authenticated;

-- 3.d إحصاءات آخر 24 ساعة (IT)
create or replace function public.console_stats(p_since timestamptz default now() - interval '24 hours')
returns jsonb
language sql stable security definer
set search_path = public, app
as $$
  select case when app.has_role(array['it_admin', 'super_admin']) then jsonb_build_object(
    'open_errors', (select coalesce(sum(occurrences), 0) from public.app_errors where level = 'error' and not resolved and last_seen_at >= p_since),
    'open_warnings', (select coalesce(sum(occurrences), 0) from public.app_errors where level = 'warn' and not resolved and last_seen_at >= p_since),
    'resolved', (select count(*) from public.app_errors where resolved and coalesce(resolved_at, last_seen_at) >= p_since),
    'affected_users', (select count(distinct user_id) from public.app_errors where not resolved and last_seen_at >= p_since),
    'by_portal', coalesce((select jsonb_object_agg(portal, n) from (select portal, sum(occurrences) n from public.app_errors where not resolved and last_seen_at >= p_since group by portal) s), '{}'::jsonb),
    'by_kind', coalesce((select jsonb_object_agg(kind, n) from (select kind, sum(occurrences) n from public.app_errors where not resolved and last_seen_at >= p_since group by kind) s), '{}'::jsonb)
  ) else null end
$$;
grant execute on function public.console_stats(timestamptz) to authenticated;

-- 3.e الحل مع ملاحظة (IT) — لا حذف أبداً
create or replace function public.console_resolve(p_id bigint, p_resolved boolean, p_note text default null)
returns public.app_errors
language plpgsql volatile security definer
set search_path = public, app
as $$
declare r public.app_errors;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then
    raise exception 'CONSOLE_FORBIDDEN';
  end if;
  update public.app_errors
     set resolved = p_resolved,
         resolved_by = case when p_resolved then auth.uid() else null end,
         resolved_at = case when p_resolved then now() else null end,
         resolution_note = case when p_resolved then left(nullif(trim(coalesce(p_note, '')), ''), 1000) else null end
   where id = p_id
   returning * into r;
  if not found then
    raise exception 'CONSOLE_EVENT_NOT_FOUND';
  end if;
  return r;
end;
$$;
grant execute on function public.console_resolve(bigint, boolean, text) to authenticated;

-- 3.f البث الحي للـ IT (الصفوف محمية بـ RLS الحالية: القراءة لـ IT فقط)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'app_errors') then
    execute 'alter publication supabase_realtime add table public.app_errors';
  end if;
end $$;
