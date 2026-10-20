-- 00259 · تدقيق المقاولين: اعتماد الشهر على جهة لا تغطي كل الأيام كان يُسقط أجور تلك الأيام صامتاً
--   مثال مؤكد: المتعهد سجّل حضوره يومين، المتابعة سجّلت يوماً واحداً؛ اعتماد «المتابعة» ⇒ المالية تدفع يوماً واحداً بلا أي تنبيه.
--   الحل: (1) دالة فجوات التغطية (متعهد × يوم فيه رقم من جهة أخرى ولا رقم من الجهة المختارة)؛
--         (2) الاعتماد يُرفض عند وجود فجوات CONTRACTOR_SOURCE_COVERAGE_GAP:n إلا بإقرار صريح p_force (يُسجَّل في التدقيق والإشعار)؛
--         (3) كشف المالية يعرض «أيام غير مغطاة» لكل متعهد. التصحيح نفسه عبر ops_contractor_count_correct (أي يوم، أي جهة، بسبب) كما هو.

create or replace function public.ops_contractor_coverage_gaps(p_month date default null, p_source text default null)
returns table(contractor_user_id uuid, contractor_name text, area_name text, log_date date, contractor_count int, follow_up_count int, sector_manager_count int)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, app.baghdad_today()))::date;
begin
  perform app.require_ops_room();
  if p_source is null or p_source not in ('contractor','follow_up','sector_manager') then raise exception 'CONTRACTOR_SOURCE_INVALID'; end if;
  return query
  select x.contractor_user_id, app.manager_display_name(x.contractor_user_id), (select s.name from public.contractor_profiles cp join public.sectors s on s.id = cp.sector_id where cp.user_id = x.contractor_user_id limit 1),
         x.log_date,
         max(x.headcount) filter (where x.source = 'contractor')::int, max(x.headcount) filter (where x.source = 'follow_up')::int, max(x.headcount) filter (where x.source = 'sector_manager')::int
  from public.contractor_daily_counts x
  where x.log_date >= m and x.log_date < (m + interval '1 month')::date
  group by x.contractor_user_id, x.log_date
  having bool_or(x.headcount > 0 and x.source <> p_source) and not bool_or(x.source = p_source)
  order by x.log_date, 2;
end$$;
revoke all on function public.ops_contractor_coverage_gaps(date, text) from public, anon;
grant execute on function public.ops_contractor_coverage_gaps(date, text) to authenticated;

drop function if exists public.ops_contractor_month_approve(date, text);
create or replace function public.ops_contractor_month_approve(p_month date, p_source text, p_force boolean default false)
returns public.contractor_month_approvals language plpgsql security definer set search_path = public, app as $$
declare u uuid; m date := date_trunc('month', p_month)::date; a public.contractor_month_approvals; src_ar text; gaps int;
begin
  perform app.require_ops_room(); u := auth.uid();
  if p_source not in ('contractor','follow_up','sector_manager') then raise exception 'CONTRACTOR_SOURCE_INVALID'; end if;
  if m > app.baghdad_today() then raise exception 'CONTRACTOR_MONTH_FUTURE'; end if;
  if exists (select 1 from public.contractor_month_approvals x where x.month = m and x.is_locked) then raise exception 'CONTRACTOR_MONTH_LOCKED'; end if;
  select count(*) into gaps from public.ops_contractor_coverage_gaps(m, p_source);
  if gaps > 0 and not p_force then raise exception 'CONTRACTOR_SOURCE_COVERAGE_GAP:%', gaps; end if;
  insert into public.contractor_month_approvals (month, approved_source, approved_by, approved_at, is_locked, reopened_by, reopened_at, reopen_reason)
  values (m, p_source, u, now(), true, null, null, null)
  on conflict (month) do update set approved_source = excluded.approved_source, approved_by = u, approved_at = now(), is_locked = true
  returning * into a;
  src_ar := case p_source when 'contractor' then 'المتعهد' when 'follow_up' then 'المتابعة' else 'مسؤول القاطع' end;
  insert into public.contractor_audit_log(actor_id, action, log_date, after_data)
  values (u, 'month_approve', m, jsonb_build_object('approved_source', p_source, 'coverage_gaps', gaps, 'forced', p_force and gaps > 0));
  insert into public.notifications(user_id, title, body, type, link, dedupe_key)
  select ur.user_id, 'اعتُمدت حضوريات عمال المتعهدين لشهر ' || to_char(m, 'YYYY-MM'),
         format('الجهة المعتمدة لكل المتعهدين: %s · اعتمدها %s', src_ar, app.manager_display_name(u)) || case when gaps > 0 then format(' · تنبيه: %s يوم/متعهد بلا رقم من هذه الجهة لن تُدفع', gaps) else '' end,
         'success', '/finance/contractor-wages', 'contractor_month_approve:' || to_char(m, 'YYYY-MM') || ':' || extract(epoch from now())::bigint
  from public.user_roles ur where ur.role in ('finance_officer','deputy_director')
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return a;
end$$;
revoke all on function public.ops_contractor_month_approve(date, text, boolean) from public, anon;
grant execute on function public.ops_contractor_month_approve(date, text, boolean) to authenticated;

drop function if exists public.finance_contractor_wages_sheet(date);
create function public.finance_contractor_wages_sheet(p_month date default null)
returns table(contractor_user_id uuid, contractor_name text, contractor_phone text, sector_id smallint, area_name text, parent_sector text, shift text, is_active boolean,
              approved boolean, approved_source text,
              paid_days int, worker_days int, headcount_total int,
              contractor_daily_wage numeric, worker_daily_wage numeric, rates_set boolean,
              contractor_pay numeric, workers_pay numeric, total_pay numeric,
              note text, set_by_name text, set_at timestamptz,
              uncovered_days int)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, app.baghdad_today()))::date; a public.contractor_month_approvals;
begin
  if not app.has_role(array['finance_officer','super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  select * into a from public.contractor_month_approvals x where x.month = m and x.is_locked;
  return query
  select cp.user_id, app.manager_display_name(cp.user_id), (select e.phone from public.employees e where e.user_id = cp.user_id limit 1),
    s.id, s.name, s.parent_sector, cp.shift, cp.is_active,
    a.month is not null, a.approved_source,
    d.paid_days, d.worker_days, d.headcount_total,
    coalesce(r.contractor_daily_wage, 0), coalesce(r.worker_daily_wage, 0), r.id is not null,
    case when a.month is null or r.id is null then null else round(r.contractor_daily_wage * d.paid_days, 2) end,
    case when a.month is null or r.id is null then null else round(r.worker_daily_wage * d.worker_days, 2) end,
    case when a.month is null or r.id is null then null else round(r.contractor_daily_wage * d.paid_days + r.worker_daily_wage * d.worker_days, 2) end,
    r.note, case when r.id is null then null else app.manager_display_name(r.set_by) end, r.set_at,
    g.uncovered_days
  from public.contractor_profiles cp
  join public.sectors s on s.id = cp.sector_id
  left join public.contractor_rates r on r.contractor_user_id = cp.user_id and r.month = m
  cross join lateral (
    select count(*) filter (where x.headcount > 0)::int as paid_days,
           coalesce(sum(greatest(0, x.headcount - 1)) filter (where x.headcount > 0), 0)::int as worker_days,
           coalesce(sum(x.headcount), 0)::int as headcount_total
    from public.contractor_daily_counts x
    where x.contractor_user_id = cp.user_id and x.log_date >= m and x.log_date < (m + interval '1 month')::date
      and a.month is not null and x.source = a.approved_source) d
  cross join lateral (
    select count(distinct x.log_date)::int as uncovered_days
    from public.contractor_daily_counts x
    where a.month is not null and x.contractor_user_id = cp.user_id and x.log_date >= m and x.log_date < (m + interval '1 month')::date
      and x.headcount > 0 and x.source <> a.approved_source
      and not exists (select 1 from public.contractor_daily_counts y where y.contractor_user_id = x.contractor_user_id and y.log_date = x.log_date and y.source = a.approved_source)) g
  where cp.is_active or r.id is not null
     or exists (select 1 from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date >= m and x.log_date < (m + interval '1 month')::date)
  order by s.parent_sector, s.id, app.manager_display_name(cp.user_id);
end$$;
revoke all on function public.finance_contractor_wages_sheet(date) from public, anon;
grant execute on function public.finance_contractor_wages_sheet(date) to authenticated;
