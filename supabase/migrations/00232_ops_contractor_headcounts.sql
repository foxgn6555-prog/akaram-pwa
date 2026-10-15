-- 00232 · غرفة العمليات — وحدة «حضوريات العمال» (00262)
--   · الكشف الشهري: لكل متعهد ثلاثة أعمدة (قاطع/متعهد/متابعة) × أيام الشهر، مع مجاميع الشفت الصباحي/المسائي.
--   · فلاتر: المصدر (في الواجهة)، القاطع الأم، الشهر.
--   · تصحيح رقم من غرفة العمليات بعد انتهاء نافذة اليوم: بسبب إلزامي + تدقيق (contractor_audit_log) + تبليغ.
--   · اعتماد الشهر: جهة واحدة تسري على كل المتعهدين ⇒ قفل الشهر؛ إعادة فتح بسبب (تُسجَّل).
--   · لا بيانات مالية هنا؛ المالية تحسب لاحقاً من الجهة المعتمدة.

-- يُستخدم app.require_ops_room() الموجود (00162).

-- ① الكشف: صف لكل (متعهد × يوم من أول الشهر حتى آخره أو اليوم)
create or replace function public.ops_contractor_headcounts_sheet(p_month date default null, p_parent text default null)
returns table(contractor_user_id uuid, contractor_name text, sector_id smallint, area_name text, parent_sector text, shift text, is_active boolean,
              log_date date, checked_in boolean, in_zone boolean,
              contractor_headcount int, follow_up_headcount int, sector_manager_headcount int,
              contractor_edit_reason text, follow_up_edit_reason text, sector_manager_edit_reason text)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, app.baghdad_today()))::date; last_d date;
begin
  perform app.require_ops_room();
  if p_parent is not null and p_parent not in ('karrada','zaafaraniya') then raise exception 'PARENT_SECTOR_INVALID'; end if;
  last_d := least((m + interval '1 month' - interval '1 day')::date, app.baghdad_today());
  return query
  with cs as (
    select cp.user_id, cp.sector_id, cp.shift, cp.is_active from public.contractor_profiles cp
    where (cp.is_active or exists (select 1 from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date between m and last_d))
  )
  select cs.user_id, app.manager_display_name(cs.user_id), cs.sector_id, s.name, s.parent_sector, cs.shift, cs.is_active,
    g.d::date, c.id is not null, c.in_zone,
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cs.user_id and x.log_date = g.d::date and x.source = 'contractor'),
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cs.user_id and x.log_date = g.d::date and x.source = 'follow_up'),
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cs.user_id and x.log_date = g.d::date and x.source = 'sector_manager'),
    (select x.edit_reason from public.contractor_daily_counts x where x.contractor_user_id = cs.user_id and x.log_date = g.d::date and x.source = 'contractor'),
    (select x.edit_reason from public.contractor_daily_counts x where x.contractor_user_id = cs.user_id and x.log_date = g.d::date and x.source = 'follow_up'),
    (select x.edit_reason from public.contractor_daily_counts x where x.contractor_user_id = cs.user_id and x.log_date = g.d::date and x.source = 'sector_manager')
  from cs
  join public.sectors s on s.id = cs.sector_id
  cross join generate_series(m, last_d, interval '1 day') g(d)
  left join public.contractor_checkins c on c.contractor_user_id = cs.user_id and c.log_date = g.d::date
  where (p_parent is null or s.parent_sector = p_parent)
  order by s.parent_sector, cs.shift, s.id, cs.user_id, g.d;
end$$;

-- ② حالة اعتماد الشهر
create or replace function public.ops_contractor_month_status(p_month date default null)
returns table(month date, approved boolean, approved_source text, approved_by_name text, approved_at timestamptz, is_locked boolean,
              reopened_by_name text, reopened_at timestamptz, reopen_reason text, month_ended boolean,
              contractors int, days_with_contractor int, days_with_follow_up int, days_with_sector_manager int)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, app.baghdad_today()))::date;
begin
  perform app.require_ops_room();
  return query
  select m, a.month is not null, a.approved_source, app.manager_display_name(a.approved_by), a.approved_at, coalesce(a.is_locked, false),
         app.manager_display_name(a.reopened_by), a.reopened_at, a.reopen_reason,
         (m + interval '1 month')::date <= app.baghdad_today(),
         (select count(distinct x.contractor_user_id)::int from public.contractor_daily_counts x where x.log_date >= m and x.log_date < (m + interval '1 month')::date),
         (select count(*)::int from public.contractor_daily_counts x where x.log_date >= m and x.log_date < (m + interval '1 month')::date and x.source = 'contractor'),
         (select count(*)::int from public.contractor_daily_counts x where x.log_date >= m and x.log_date < (m + interval '1 month')::date and x.source = 'follow_up'),
         (select count(*)::int from public.contractor_daily_counts x where x.log_date >= m and x.log_date < (m + interval '1 month')::date and x.source = 'sector_manager')
  from (select 1) z left join public.contractor_month_approvals a on a.month = m;
end$$;

-- ③ تصحيح رقم (أي يوم ≤ اليوم، أي جهة) — سبب إلزامي + تدقيق + تبليغ صاحب الرقم
create or replace function public.ops_contractor_count_correct(p_contractor uuid, p_date date, p_source text, p_headcount int, p_reason text)
returns public.contractor_daily_counts language plpgsql security definer set search_path = public, app as $$
declare u uuid; cp public.contractor_profiles; old public.contractor_daily_counts; r public.contractor_daily_counts; src_ar text;
begin
  perform app.require_ops_room(); u := auth.uid();
  if p_source not in ('contractor','follow_up','sector_manager') then raise exception 'CONTRACTOR_SOURCE_INVALID'; end if;
  if p_headcount is null or p_headcount < 0 or p_headcount > 1000 then raise exception 'CONTRACTOR_COUNT_INVALID'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'CONTRACTOR_REASON_REQUIRED'; end if;
  if p_date is null or p_date > app.baghdad_today() then raise exception 'CONTRACTOR_DATE_INVALID'; end if;
  if app.contractor_month_locked(p_date) then raise exception 'CONTRACTOR_MONTH_LOCKED'; end if;
  select * into cp from public.contractor_profiles where user_id = p_contractor;
  if cp.user_id is null then raise exception 'CONTRACTOR_NOT_ASSIGNED'; end if;
  select * into old from public.contractor_daily_counts where contractor_user_id = p_contractor and log_date = p_date and source = p_source;
  insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by, edited_by, edited_at, edit_reason)
  values (cp.user_id, cp.sector_id, p_date, p_source, p_headcount, u, u, now(), trim(p_reason))
  on conflict (contractor_user_id, log_date, source) do update
    set headcount = excluded.headcount, edited_by = u, edited_at = now(), edit_reason = trim(p_reason), updated_at = now()
  returning * into r;
  insert into public.contractor_audit_log(actor_id, action, contractor_user_id, sector_id, log_date, before_data, after_data, reason)
  values (u, 'ops_correct_' || p_source, cp.user_id, cp.sector_id, p_date,
          case when old.id is null then null else jsonb_build_object('headcount', old.headcount, 'entered_by', old.entered_by) end,
          jsonb_build_object('headcount', p_headcount), trim(p_reason));
  src_ar := case p_source when 'contractor' then 'المتعهد' when 'follow_up' then 'المتابعة' else 'مسؤول القاطع' end;
  if old.id is not null and old.entered_by <> u then
    insert into public.notifications(user_id, title, body, type, link, dedupe_key)
    values (old.entered_by, 'صحّحت غرفة العمليات عدداً سجّلته',
            format('%s · %s · عدد %s: %s ← %s · السبب: %s', app.manager_display_name(cp.user_id), to_char(p_date, 'YYYY-MM-DD'), src_ar, old.headcount, p_headcount, trim(p_reason)),
            'warning', null, 'contractor_count_correct:' || r.id::text || ':' || extract(epoch from now())::bigint)
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return r;
end$$;

-- ④ اعتماد الشهر: جهة واحدة لكل المتعهدين ⇒ قفل
create or replace function public.ops_contractor_month_approve(p_month date, p_source text)
returns public.contractor_month_approvals language plpgsql security definer set search_path = public, app as $$
declare u uuid; m date := date_trunc('month', p_month)::date; a public.contractor_month_approvals; src_ar text;
begin
  perform app.require_ops_room(); u := auth.uid();
  if p_source not in ('contractor','follow_up','sector_manager') then raise exception 'CONTRACTOR_SOURCE_INVALID'; end if;
  if m > app.baghdad_today() then raise exception 'CONTRACTOR_MONTH_FUTURE'; end if;
  if exists (select 1 from public.contractor_month_approvals x where x.month = m and x.is_locked) then raise exception 'CONTRACTOR_MONTH_LOCKED'; end if;
  insert into public.contractor_month_approvals (month, approved_source, approved_by, approved_at, is_locked, reopened_by, reopened_at, reopen_reason)
  values (m, p_source, u, now(), true, null, null, null)
  on conflict (month) do update set approved_source = excluded.approved_source, approved_by = u, approved_at = now(), is_locked = true
  returning * into a;
  src_ar := case p_source when 'contractor' then 'المتعهد' when 'follow_up' then 'المتابعة' else 'مسؤول القاطع' end;
  insert into public.contractor_audit_log(actor_id, action, log_date, after_data)
  values (u, 'month_approve', m, jsonb_build_object('approved_source', p_source));
  insert into public.notifications(user_id, title, body, type, link, dedupe_key)
  select ur.user_id, 'اعتُمدت حضوريات عمال المتعهدين لشهر ' || to_char(m, 'YYYY-MM'),
         format('الجهة المعتمدة لكل المتعهدين: %s · اعتمدها %s', src_ar, app.manager_display_name(u)),
         'success', '/finance/contractor-wages', 'contractor_month_approve:' || to_char(m, 'YYYY-MM') || ':' || extract(epoch from now())::bigint
  from public.user_roles ur where ur.role in ('finance_officer','deputy_director')
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return a;
end$$;

-- ⑤ إعادة فتح شهر مقفل بسبب
create or replace function public.ops_contractor_month_reopen(p_month date, p_reason text)
returns public.contractor_month_approvals language plpgsql security definer set search_path = public, app as $$
declare u uuid; m date := date_trunc('month', p_month)::date; a public.contractor_month_approvals;
begin
  perform app.require_ops_room(); u := auth.uid();
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'CONTRACTOR_REASON_REQUIRED'; end if;
  update public.contractor_month_approvals set is_locked = false, reopened_by = u, reopened_at = now(), reopen_reason = trim(p_reason)
  where month = m and is_locked returning * into a;
  if a.month is null then raise exception 'CONTRACTOR_MONTH_NOT_LOCKED'; end if;
  insert into public.contractor_audit_log(actor_id, action, log_date, reason) values (u, 'month_reopen', m, trim(p_reason));
  return a;
end$$;

-- ⑥ سجل التدقيق للشهر (تصحيحات/اعتماد/إعادة فتح)
create or replace function public.ops_contractor_audit(p_month date default null)
returns table(id uuid, actor_name text, action text, contractor_name text, log_date date, before_data jsonb, after_data jsonb, reason text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, app.baghdad_today()))::date;
begin
  perform app.require_ops_room();
  return query
  select l.id, app.manager_display_name(l.actor_id), l.action, app.manager_display_name(l.contractor_user_id), l.log_date, l.before_data, l.after_data, l.reason, l.created_at
  from public.contractor_audit_log l
  where l.log_date >= m and l.log_date < (m + interval '1 month')::date
    and (l.action like 'ops_correct_%' or l.action in ('month_approve','month_reopen'))
  order by l.created_at desc;
end$$;

revoke all on function
  public.ops_contractor_headcounts_sheet(date, text), public.ops_contractor_month_status(date),
  public.ops_contractor_count_correct(uuid, date, text, int, text), public.ops_contractor_month_approve(date, text),
  public.ops_contractor_month_reopen(date, text), public.ops_contractor_audit(date)
from public, anon;
grant execute on function
  public.ops_contractor_headcounts_sheet(date, text), public.ops_contractor_month_status(date),
  public.ops_contractor_count_correct(uuid, date, text, int, text), public.ops_contractor_month_approve(date, text),
  public.ops_contractor_month_reopen(date, text), public.ops_contractor_audit(date)
to authenticated;
