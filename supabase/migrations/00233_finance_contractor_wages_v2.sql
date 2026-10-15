-- 00233 · المالية — أجور المتعهدين (00263) بالعدد المعتمد بدل قائمة العمال
--   · لكل متعهد شهرياً: أجر المتعهد اليومي + أجر العامل اليومي (تُحدَّد من المالية فقط، نسخ من الشهر السابق، تدقيق قبل/بعد).
--   · الحساب من الجهة المعتمدة في غرفة العمليات (contractor_month_approvals): لكل يوم عدده المعتمد > 0:
--       عمال اليوم = العدد − 1 ⇒ أجر العمال = الأيام الموزونة × أجر العامل، وأجر المتعهد × عدد تلك الأيام.
--     مثال: 16 معتمد × 30 يوماً ⇒ 450 عامل/يوم × 8,000 = 3,600,000 + 15,000 × 30 = 450,000.
--   · الأيام بلا عدد أو بعدد 0 ⇒ لا أجر. الشهر غير المعتمد ⇒ لا مستحق (يُعرض كـ «بانتظار اعتماد غرفة العمليات»).
--   · دوال العمال القديمة (00188) تُحذف؛ جدول contractor_worker_wages يبقى أرشيفاً.

create table if not exists public.contractor_rates (
  id uuid primary key default gen_random_uuid(),
  contractor_user_id uuid not null references public.contractor_profiles(user_id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  contractor_daily_wage numeric(14,2) not null default 0 check (contractor_daily_wage >= 0),
  worker_daily_wage numeric(14,2) not null default 0 check (worker_daily_wage >= 0),
  note text check (note is null or length(note) <= 300),
  set_by uuid not null references auth.users(id),
  set_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contractor_user_id, month)
);
alter table public.contractor_rates enable row level security;
drop policy if exists "contractor_rates: finance" on public.contractor_rates;
create policy "contractor_rates: finance" on public.contractor_rates for select to authenticated
  using (app.has_role(array['finance_officer','super_admin']));

drop function if exists public.finance_contractor_wages_sheet(date);
drop function if exists public.finance_contractor_wage_set(uuid, date, text, numeric, text);
drop function if exists public.finance_contractor_wages_copy_previous(date);

-- ① حالة اعتماد الشهر (للمالية)
create or replace function public.finance_contractor_month_status(p_month date default null)
returns table(month date, approved boolean, approved_source text, approved_by_name text, approved_at timestamptz, is_locked boolean, month_ended boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, app.baghdad_today()))::date;
begin
  if not app.has_role(array['finance_officer','super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  return query
  select m, a.month is not null and a.is_locked, a.approved_source, app.manager_display_name(a.approved_by), a.approved_at, coalesce(a.is_locked, false),
         (m + interval '1 month')::date <= app.baghdad_today()
  from (select 1) z left join public.contractor_month_approvals a on a.month = m;
end$$;

-- ② الكشف: صف لكل متعهد مع الأجور والأعداد المعتمدة والمستحق
create or replace function public.finance_contractor_wages_sheet(p_month date default null)
returns table(contractor_user_id uuid, contractor_name text, contractor_phone text, sector_id smallint, area_name text, parent_sector text, shift text, is_active boolean,
              approved boolean, approved_source text,
              paid_days int, worker_days int, headcount_total int,
              contractor_daily_wage numeric, worker_daily_wage numeric, rates_set boolean,
              contractor_pay numeric, workers_pay numeric, total_pay numeric,
              note text, set_by_name text, set_at timestamptz)
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
    r.note, case when r.id is null then null else app.manager_display_name(r.set_by) end, r.set_at
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
  where cp.is_active or r.id is not null
     or exists (select 1 from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date >= m and x.log_date < (m + interval '1 month')::date)
  order by s.parent_sector, s.id, app.manager_display_name(cp.user_id);
end$$;

-- ③ تفصيل أيام متعهد (للتدقيق/الدرل داون): اليوم، العدد المعتمد، العمال، أجر اليوم
create or replace function public.finance_contractor_wage_days(p_contractor uuid, p_month date default null)
returns table(log_date date, headcount int, workers int, contractor_pay numeric, workers_pay numeric, day_pay numeric, edit_reason text)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, app.baghdad_today()))::date; a public.contractor_month_approvals; r public.contractor_rates; last_d date;
begin
  if not app.has_role(array['finance_officer','super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  select * into a from public.contractor_month_approvals x where x.month = m and x.is_locked;
  select * into r from public.contractor_rates x where x.contractor_user_id = p_contractor and x.month = m;
  last_d := least((m + interval '1 month' - interval '1 day')::date, app.baghdad_today());
  return query
  select g.d::date, x.headcount,
    case when x.headcount > 0 then greatest(0, x.headcount - 1) else null end,
    case when a.month is null or r.id is null or coalesce(x.headcount, 0) = 0 then null else r.contractor_daily_wage end,
    case when a.month is null or r.id is null or coalesce(x.headcount, 0) = 0 then null else round(r.worker_daily_wage * greatest(0, x.headcount - 1), 2) end,
    case when a.month is null or r.id is null or coalesce(x.headcount, 0) = 0 then null else round(r.contractor_daily_wage + r.worker_daily_wage * greatest(0, x.headcount - 1), 2) end,
    x.edit_reason
  from generate_series(m, last_d, interval '1 day') g(d)
  left join public.contractor_daily_counts x on x.contractor_user_id = p_contractor and x.log_date = g.d::date and a.month is not null and x.source = a.approved_source
  order by g.d;
end$$;

-- ④ تحديد الأجور (المالية فقط) + تدقيق قبل/بعد
create or replace function public.finance_contractor_rates_set(p_contractor uuid, p_month date, p_contractor_daily numeric, p_worker_daily numeric, p_note text default null)
returns public.contractor_rates language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; before_j jsonb; r public.contractor_rates;
begin
  if not app.has_role(array['finance_officer','super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  if p_contractor_daily is null or p_worker_daily is null or p_contractor_daily < 0 or p_worker_daily < 0 then raise exception 'CONTRACTOR_WAGE_INVALID'; end if;
  if length(coalesce(p_note, '')) > 300 then raise exception 'CONTRACTOR_NOTE_INVALID'; end if;
  if not exists (select 1 from public.contractor_profiles cp where cp.user_id = p_contractor) then raise exception 'CONTRACTOR_NOT_ASSIGNED'; end if;
  select to_jsonb(x) - 'id' into before_j from public.contractor_rates x where x.contractor_user_id = p_contractor and x.month = m;
  insert into public.contractor_rates (contractor_user_id, month, contractor_daily_wage, worker_daily_wage, note, set_by)
  values (p_contractor, m, p_contractor_daily, p_worker_daily, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (contractor_user_id, month) do update
    set contractor_daily_wage = excluded.contractor_daily_wage, worker_daily_wage = excluded.worker_daily_wage, note = excluded.note, set_by = auth.uid(), set_at = now(), updated_at = now()
  returning * into r;
  insert into public.contractor_audit_log(actor_id, action, contractor_user_id, sector_id, log_date, before_data, after_data)
  values (auth.uid(), 'finance_rates_set', p_contractor, (select cp.sector_id from public.contractor_profiles cp where cp.user_id = p_contractor), m, before_j, to_jsonb(r) - 'id');
  return r;
end$$;

-- ⑤ نسخ أجور الشهر السابق لمن لا أجر له
create or replace function public.finance_contractor_rates_copy_previous(p_month date)
returns int language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; n int;
begin
  if not app.has_role(array['finance_officer','super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  insert into public.contractor_rates (contractor_user_id, month, contractor_daily_wage, worker_daily_wage, note, set_by)
  select p.contractor_user_id, m, p.contractor_daily_wage, p.worker_daily_wage, p.note, auth.uid()
  from public.contractor_rates p
  join public.contractor_profiles cp on cp.user_id = p.contractor_user_id and cp.is_active
  where p.month = (m - interval '1 month')::date
    and not exists (select 1 from public.contractor_rates c where c.contractor_user_id = p.contractor_user_id and c.month = m);
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.contractor_audit_log(actor_id, action, log_date, after_data) values (auth.uid(), 'finance_rates_copy_previous', m, jsonb_build_object('copied', n));
  end if;
  return n;
end$$;

revoke all on function
  public.finance_contractor_month_status(date), public.finance_contractor_wages_sheet(date), public.finance_contractor_wage_days(uuid, date),
  public.finance_contractor_rates_set(uuid, date, numeric, numeric, text), public.finance_contractor_rates_copy_previous(date)
from public, anon;
grant execute on function
  public.finance_contractor_month_status(date), public.finance_contractor_wages_sheet(date), public.finance_contractor_wage_days(uuid, date),
  public.finance_contractor_rates_set(uuid, date, numeric, numeric, text), public.finance_contractor_rates_copy_previous(date)
to authenticated;
