-- 00299: الساعات الإضافية المدفوعة — تصحيح النطاق: يسري فقط على موظفين يُدرجهم معاون المدير المفوض بالاسم.
-- غير المشمول يبقى على رصيد الإجازات (hr_overtime_credit / بنك الساعات) كما كان تماماً.

-- ── ① جدول المشمولين + سجل الإدراج/الإزالة
create table if not exists public.hr_overtime_members (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  active      boolean not null default true,
  note        text,
  since       date not null default current_date,
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table public.hr_overtime_members enable row level security;
create policy "hr_overtime_members: قراءة" on public.hr_overtime_members for select to authenticated
  using (app.has_role(array['deputy_director', 'finance_officer', 'super_admin']));
create table if not exists public.hr_overtime_member_events (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  action      text not null check (action in ('add', 'remove')),
  note        text,
  actor       uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_hr_overtime_member_events_at on public.hr_overtime_member_events (created_at desc);
alter table public.hr_overtime_member_events enable row level security;
create policy "hr_overtime_member_events: قراءة" on public.hr_overtime_member_events for select to authenticated
  using (app.has_role(array['deputy_director', 'super_admin']));

-- ── ② المسند: مفعّل من IT **و** الموظف مشمول
create or replace function app.paid_overtime_for(p_employee uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.paid_overtime_enabled() and exists (select 1 from public.hr_overtime_members m where m.employee_id = p_employee and m.active)
$$;

-- ── ④ أجر الساعة: ثابت (قرار المعاون) أو من الراتب (أجر اليوم ÷ دقائق الشفت × 60 — نفس حساب الراتب) ──

-- ── ③ احتساب الشهر مقصور على المشمولين
create or replace function app.paid_overtime_month(p_month date, p_employee uuid default null)
returns table(employee_id uuid, days_count int, early_minutes int, late_minutes int, counted_minutes int, payable_minutes int, hour_rate numeric, rate_source text, amount numeric, shift_minutes int)
language sql stable security definer set search_path = public, app as $$
  with s as (select app.paid_overtime_settings() j),
  d as (
    select a.employee_id, a.ot_early_minutes, a.ot_late_minutes,
           (case when (s.j ->> 'before_shift')::boolean then a.ot_early_minutes else 0 end) + (case when (s.j ->> 'after_shift')::boolean then a.ot_late_minutes else 0 end) as raw_min
    from public.hr_attendance_days a, s
    where a.work_date >= date_trunc('month', p_month)::date and a.work_date < (date_trunc('month', p_month) + interval '1 month')::date
      and (p_employee is null or a.employee_id = p_employee) and (a.ot_early_minutes > 0 or a.ot_late_minutes > 0)
      and exists (select 1 from public.hr_overtime_members mb where mb.employee_id = a.employee_id and mb.active)),
  agg as (
    select d.employee_id, count(*) filter (where d.raw_min >= (s.j ->> 'min_block_minutes')::int and d.raw_min > 0)::int as days_count,
           sum(d.ot_early_minutes)::int as early_minutes, sum(d.ot_late_minutes)::int as late_minutes,
           sum(case when d.raw_min >= (s.j ->> 'min_block_minutes')::int then d.raw_min else 0 end)::int as counted_minutes
    from d, s group by d.employee_id),
  calc as (
    select a.*, case when (s.j ->> 'unit') = 'hours' then (a.counted_minutes / 60) * 60 else a.counted_minutes end as payable_minutes,
           app.overtime_hour_rate(a.employee_id, p_month) as hr
    from agg a, s)
  select c.employee_id, c.days_count, c.early_minutes, c.late_minutes, c.counted_minutes, c.payable_minutes,
         (c.hr ->> 'hour_rate')::numeric, c.hr ->> 'source',
         round(c.payable_minutes::numeric / 60 * (c.hr ->> 'hour_rate')::numeric, 2), (c.hr ->> 'shift_minutes')::int
  from calc c
$$;

-- شهر الراتب الذي يُصرف فيه: شهر العمل إن لم تعتمده المالية بعد، وإلا أول شهر لاحق غير معتمد (حتى الشهر الحالي)

-- ── ④ رصيد الإجازات/بنك الساعات: يتوقف للمشمول فقط ويستمر لغيره
create or replace function app.hr_overtime_credit(p_month date) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; r record; n int := 0; per_day int; v_days numeric;
begin
  if not app.hr_policy_bool('overtime_enabled', true) then return 0; end if;
  for r in select employee_id, overtime_minutes, shift_minutes from app.hr_month_summary(m) where overtime_minutes > 0 loop
    -- 00353: المشمول بالصرف النقدي لا يأخذ رصيداً (وما سبق له في هذا الشهر غير المقفل يُحذف)
    if app.paid_overtime_for(r.employee_id) then delete from public.hr_leave_ledger l where l.employee_id = r.employee_id and l.period_month = m and l.kind = 'overtime'; continue; end if;
    if (select hb.enabled from app.hr_hour_bank(r.employee_id, m) hb) then continue; end if;
    per_day := coalesce(app.hr_policy_int('overtime_minutes_per_leave_day', 0), 0);
    if per_day <= 0 then per_day := r.shift_minutes; end if;
    v_days := round(r.overtime_minutes::numeric / per_day, 3);
    if v_days > 0 then
      insert into public.hr_leave_ledger (employee_id, year, kind, days, period_month, note)
      values (r.employee_id, extract(year from m)::int, 'overtime', v_days, m, 'دوام إضافي ' || r.overtime_minutes || ' دقيقة في ' || to_char(m, 'YYYY-MM'))
      on conflict (employee_id, period_month) where kind = 'overtime' do update set days = excluded.days, note = excluded.note;
      n := n + 1;
    end if;
  end loop;
  return n;
end$$;

create or replace function app.hr_hour_bank_credit(p_month date) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; r record; hb record; n int := 0;
begin
  for r in select s.employee_id from app.hr_month_summary(m) s loop
    select * into hb from app.hr_hour_bank(r.employee_id, m);
    if not hb.enabled then continue; end if;
    if app.paid_overtime_for(r.employee_id) then delete from public.hr_leave_ledger l where l.employee_id = r.employee_id and l.period_month = m and l.kind = 'overtime'; continue; end if;   -- 00353
    if hb.credit_days > 0 then
      insert into public.hr_leave_ledger (employee_id, year, kind, days, period_month, note)
      values (r.employee_id, extract(year from m)::int, 'overtime', hb.credit_days, m,
              'بنك الساعات ' || to_char(m, 'YYYY-MM') || ': فائض ' || hb.surplus_minutes || ' دقيقة = ' || hb.credit_days || ' يوم'
              || case when hb.credit_capped then ' (بلغ السقف الشهري ' || hb.credit_cap_days || ' يوم)' else '' end)
      on conflict (employee_id, period_month) where kind = 'overtime' do update set days = excluded.days, note = excluded.note;
      n := n + 1;
    else
      delete from public.hr_leave_ledger l where l.employee_id = r.employee_id and l.period_month = m and l.kind = 'overtime';
    end if;
  end loop;
  return n;
end$$;

-- ■ بنك الساعات في الكشف (نسخة 00225)
create or replace function app.hr_hour_bank_apply_export(p_export uuid, p_month date, p_employee uuid default null) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; n int := 0;
begin
  update public.hr_month_export_rows r set
    hour_bank_enabled = true, hour_bank_required_minutes = hb.required_minutes, hour_bank_credited_minutes = hb.credited_minutes,
    hour_bank_net_minutes = hb.net_minutes, hour_bank_credit_days = case when app.paid_overtime_for(r.employee_id) then 0 else hb.credit_days end,   -- 00353 shift_minutes = hb.shift_minutes,
    auto_deduction_basis = case when r.auto_deduction_basis = 'disabled' then 'disabled' else 'hour_bank' end
  from (select x.id, hb.* from public.hr_month_export_rows x cross join lateral app.hr_hour_bank(x.employee_id, m) hb
        where x.export_id = p_export and hb.enabled and (p_employee is null or x.employee_id = p_employee)) hb
  where r.id = hb.id;
  get diagnostics n = row_count;
  return n;
end$$;

-- ■ التصدير وتحديث الصف (نسخة 00251)

-- ── ⑤ وحدة المعاون: نظرة عامة (member/members_count)، الصرف يرفض غير المشمول، إدارة المشمولين، الأجر
create or replace function public.deputy_overtime_overview(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; s jsonb := app.paid_overtime_settings(); rows jsonb; pm date; v_locked boolean; x record;
begin
  perform app.overtime_require_deputy('view');
  begin pm := app.overtime_payroll_month(m); exception when others then pm := null; end;
  select * into x from public.hr_month_exports where period_month = m and status in ('exported', 'approved') order by version desc limit 1;
  v_locked := app.hr_month_locked(m);
  with calc as (select * from app.paid_overtime_month(m, null)),
  po as (select p.* from public.hr_overtime_payouts p where p.period_month = m and p.status in ('paid', 'rejected')),
  ids as (select employee_id from calc union select employee_id from po union select employee_id from public.hr_overtime_members where active)
  select coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', e.id, 'employee_number', e.employee_number, 'full_name', e.full_name, 'department_name', d.name, 'job_title', e.job_title,
      'days_count', coalesce(c.days_count, 0), 'early_minutes', coalesce(c.early_minutes, 0), 'late_minutes', coalesce(c.late_minutes, 0),
      'counted_minutes', coalesce(c.counted_minutes, 0), 'payable_minutes', coalesce(c.payable_minutes, 0),
      'hour_rate', coalesce(c.hour_rate, (hrj ->> 'hour_rate')::numeric, 0), 'rate_source', coalesce(c.rate_source, hrj ->> 'source', 'none'),
      'shift_minutes', coalesce(c.shift_minutes, (hrj ->> 'shift_minutes')::int, 480), 'day_rate', (hrj ->> 'day_rate')::numeric,
      'amount', coalesce(c.amount, 0),
      'fixed_rate', case when fr.employee_id is null then null else jsonb_build_object('enabled', fr.enabled, 'hourly_amount', fr.hourly_amount, 'note', fr.note) end,
      'member', coalesce(mb.active, false),
      'payout', case when p.id is null then null else jsonb_build_object('id', p.id, 'status', p.status, 'amount', p.amount, 'payable_minutes', p.payable_minutes, 'counted_minutes', p.counted_minutes,
          'hour_rate', p.hour_rate, 'rate_source', p.rate_source, 'unit', p.unit, 'payroll_month', p.payroll_month, 'note', p.note, 'decided_at', p.decided_at,
          'decided_by_name', app.manager_display_name(p.decided_by), 'settled', app.hr_month_locked(p.payroll_month),
          'changed_since', p.status = 'paid' and (coalesce(c.counted_minutes, 0) <> p.counted_minutes)) end
    ) order by d.name nulls last, app.hr_employee_sort_key(e.employee_number), e.full_name), '[]'::jsonb)
  into rows
  from ids i join public.employees e on e.id = i.employee_id
  left join public.departments d on d.id = e.department_id
  left join calc c on c.employee_id = e.id
  left join po p on p.employee_id = e.id
  left join public.hr_overtime_rates fr on fr.employee_id = e.id
  left join public.hr_overtime_members mb on mb.employee_id = e.id
  cross join lateral app.overtime_hour_rate(e.id, m) hrj;
  return jsonb_build_object('month', m, 'settings', s, 'payroll_month', pm, 'month_locked', v_locked, 'members_count', (select count(*) from public.hr_overtime_members where active),
    'export_status', x.status, 'export_review_status', x.review_status, 'employees', rows);
end$$;
grant execute on function public.deputy_overtime_overview(date) to authenticated;

create or replace function public.deputy_overtime_pay(p_employee uuid, p_month date, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; s jsonb := app.paid_overtime_settings(); c record; pm date; p public.hr_overtime_payouts;
begin
  perform app.overtime_require_deputy('decide');
  if not (s ->> 'enabled')::boolean then raise exception 'OVERTIME_DISABLED'; end if;
  if not exists (select 1 from public.hr_overtime_members mb where mb.employee_id = p_employee and mb.active) then raise exception 'OVERTIME_NOT_MEMBER'; end if;
  if m > date_trunc('month', app.hr_local_date(now()))::date then raise exception 'HR_MONTH_FUTURE'; end if;
  select * into c from app.paid_overtime_month(m, p_employee);
  if not found or c.payable_minutes <= 0 then raise exception 'OVERTIME_NOTHING_TO_PAY'; end if;
  if c.rate_source = 'none' or c.hour_rate <= 0 then raise exception 'OVERTIME_NO_RATE'; end if;
  if exists (select 1 from public.hr_overtime_payouts where employee_id = p_employee and period_month = m and status in ('paid', 'rejected')) then raise exception 'OVERTIME_ALREADY_DECIDED'; end if;
  pm := app.overtime_payroll_month(m);
  insert into public.hr_overtime_payouts (employee_id, period_month, payroll_month, status, early_minutes, late_minutes, counted_minutes, payable_minutes, unit, hour_rate, rate_source, amount, note, decided_by)
  values (p_employee, m, pm, 'paid', c.early_minutes, c.late_minutes, c.counted_minutes, c.payable_minutes, s ->> 'unit', c.hour_rate, c.rate_source, c.amount, nullif(trim(p_note), ''), auth.uid())
  returning * into p;
  perform app.overtime_sync_open_export(p_employee, pm);
  return to_jsonb(p);
end$$;
grant execute on function public.deputy_overtime_pay(uuid, date, text) to authenticated;

create or replace function public.deputy_overtime_member_set(p_employee uuid, p_active boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare r public.hr_overtime_members; cur boolean;
begin
  perform app.overtime_require_deputy('edit');
  if not exists (select 1 from public.employees where id = p_employee and archived_at is null) then raise exception 'HR_NOT_FOUND'; end if;
  select active into cur from public.hr_overtime_members where employee_id = p_employee;
  if coalesce(cur, false) = coalesce(p_active, false) then raise exception 'OVERTIME_MEMBER_UNCHANGED'; end if;
  if not p_active and coalesce(length(trim(p_note)), 0) < 3 then raise exception 'OVERTIME_REASON_REQUIRED'; end if;
  insert into public.hr_overtime_members (employee_id, active, note, since, updated_by, updated_at)
  values (p_employee, p_active, nullif(trim(p_note), ''), app.hr_local_date(now()), auth.uid(), now())
  on conflict (employee_id) do update set active = excluded.active, note = excluded.note, since = excluded.since, updated_by = excluded.updated_by, updated_at = now()
  returning * into r;
  insert into public.hr_overtime_member_events (employee_id, action, note, actor) values (p_employee, case when p_active then 'add' else 'remove' end, nullif(trim(p_note), ''), auth.uid());
  return to_jsonb(r);
end$$;
grant execute on function public.deputy_overtime_member_set(uuid, boolean, text) to authenticated;

-- سجل الإدراج/الإزالة
create or replace function public.deputy_overtime_member_events(p_limit int default 200)
returns table(id uuid, employee_id uuid, employee_number text, full_name text, action text, note text, actor_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.overtime_require_deputy('view');
  return query select ev.id, ev.employee_id, e.employee_number, e.full_name, ev.action, ev.note, app.manager_display_name(ev.actor), ev.created_at
  from public.hr_overtime_member_events ev join public.employees e on e.id = ev.employee_id order by ev.created_at desc limit greatest(coalesce(p_limit, 200), 1);
end$$;
grant execute on function public.deputy_overtime_member_events(int) to authenticated;

-- قائمة الموظفين الفعّالين: الشمول + أجر الساعة الثابت (إن وُجد) + أجر الساعة من الراتب للشهر الحالي
drop function if exists public.deputy_overtime_rates();
create or replace function public.deputy_overtime_rates()
returns table(employee_id uuid, employee_number text, full_name text, department_name text, job_title text, enabled boolean, hourly_amount numeric, note text, updated_at timestamptz, salary_hour_rate numeric, salary_source text,
              member boolean, member_since date, member_note text)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', app.hr_local_date(now()))::date;
begin
  perform app.overtime_require_deputy('view');
  return query
  select e.id, e.employee_number, e.full_name, d.name, e.job_title, coalesce(fr.enabled, false), coalesce(fr.hourly_amount, 0), fr.note, fr.updated_at,
         (hrj ->> 'hour_rate')::numeric, hrj ->> 'source', coalesce(mb.active, false), case when coalesce(mb.active, false) then mb.since end, case when coalesce(mb.active, false) then mb.note end
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.hr_overtime_rates fr on fr.employee_id = e.id
  left join public.hr_overtime_members mb on mb.employee_id = e.id
  cross join lateral app.overtime_hour_rate(e.id, m) hrj
  where e.archived_at is null
  order by coalesce(mb.active, false) desc, d.name nulls last, app.hr_employee_sort_key(e.employee_number), e.full_name;
end$$;
grant execute on function public.deputy_overtime_rates() to authenticated;

-- ── ⑥ كتالوج الاحتفاظ: الجدولان الجديدان (مولَّد بـ scripts/gen-retention-catalog.py)
create or replace function app.data_retention_catalog()
returns table (data_key text, portal_key text, label text, description text, table_name text, time_column text, keep_where text, safety_lock text,
               deletable boolean, default_months int, default_export_required boolean)
language sql immutable as $$
  values
    ('audit_logs', 'it', 'سجل التدقيق العام', 'كل تعديل على الجداول (قبل/بعد). يُستثنى ما يخص الرواتب والمالية.', 'audit_logs', 'created_at', 'table_name in (''payrolls'',''payslips'',''employee_salary_profiles'',''hr_month_exports'',''hr_month_export_rows'',''treasury_transactions'',''advances'',''advance_installments'',''hr_attendance_deductions'',''disclosures'')', 'سجلات التدقيق المتعلقة بالرواتب والمالية والخصومات محمية دائماً', true, 36, true),
    ('app_errors', 'it', 'أخطاء التطبيق', 'أخطاء الواجهة والخادم المسجَّلة تلقائياً.', 'app_errors', 'created_at', 'resolved is not true and archived_at is null', 'الأخطاء غير المحلولة وغير المؤرشفة محمية', true, 6, false),
    ('integration_logs', 'it', 'سجل التكاملات الخارجية', 'طلبات/ردود مزوّدي GPS والبريد وغيرها.', 'integration_logs', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('login_attempts', 'it', 'محاولات تسجيل الدخول', 'ناجحة وفاشلة، مع العنوان والوقت.', 'login_attempts', 'attempted_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 12, false),
    ('connection_samples', 'it', 'عينات جودة الاتصال', 'قياسات زمن الاستجابة من أجهزة المستخدمين.', 'connection_samples', 'sampled_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('biometric_pulls', 'it', 'سجل سحب البصمات من الأجهزة', 'كل عملية سحب يدوية/آلية ونتيجتها. البصمات نفسها نوع مستقل.', 'biometric_pulls', 'started_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('biometric_pushes', 'it', 'سجل دفع الموظفين إلى الأجهزة', 'كل عملية إرسال موظف لجهاز بصمة.', 'biometric_pushes', 'received_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('biometric_device_commands', 'it', 'أوامر أجهزة البصمة', 'الأوامر المرسلة للأجهزة (ADMS).', 'biometric_device_commands', 'created_at', 'acked_at is null', 'الأوامر التي لم يؤكدها الجهاز بعد محمية', true, 3, false),
    ('biometric_raw_punches', 'it', 'البصمات الخام من الأجهزة', 'كل لمسة إصبع كما وصلت من الجهاز. سجل الحضور المحسوب والخصومات لا يُمسّان.', 'biometric_punches', 'punched_at', null, 'لا تُحذف بصمات شهر لم تعتمده المالية (راتب معتمد أو مدفوع)', true, 6, true),
    ('biometric_devices', 'it', 'أجهزة البصمة', '', 'biometric_devices', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('biometric_device_users', 'it', 'موظفو أجهزة البصمة (المسجَّلون على كل جهاز)', '', 'biometric_device_users', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('biometric_adms_endpoints', 'it', 'نقاط ADMS', '', 'biometric_adms_endpoints', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('it_assets', 'it', 'أصول تقنية المعلومات', '', 'it_assets', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('it_tickets', 'it', 'تذاكر الدعم الفني', '', 'it_tickets', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('system_settings', 'it', 'إعدادات النظام', '', 'system_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('dynamic_portals', 'it', 'البوابات الديناميكية', '', 'dynamic_portals', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('portal_units', 'it', 'وحدات البوابات', '', 'portal_units', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('portal_hidden_units', 'it', 'الوحدات المخفية لكل مستخدم', '', 'portal_hidden_units', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('role_page_permissions', 'it', 'صلاحيات الصفحات حسب الدور', '', 'role_page_permissions', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('user_page_overrides', 'it', 'استثناءات صلاحيات المستخدمين', '', 'user_page_overrides', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_units', 'it', 'وحدات الصلاحيات (كتالوج 00350)', '', 'permission_units', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_portal_roles', 'it', 'دور كل بوابة (صلاحيات 00350)', '', 'permission_portal_roles', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_templates', 'it', 'قوالب الصلاحيات', '', 'permission_templates', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_template_rules', 'it', 'قواعد قوالب الصلاحيات', '', 'permission_template_rules', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('user_permission_template', 'it', 'قالب الصلاحيات لكل مستخدم', '', 'user_permission_template', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('user_permission_overrides', 'it', 'استثناءات الصلاحيات الفردية', '', 'user_permission_overrides', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_audit', 'it', 'سجل تدقيق الصلاحيات', '', 'permission_audit', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('permission_write_bindings', 'it', 'ربط دوال الكتابة بالصلاحيات (00350-B)', '', 'permission_write_bindings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('user_roles', 'it', 'أدوار المستخدمين', '', 'user_roles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('manager_profiles', 'it', 'ملفات المديرين', '', 'manager_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('documents', 'it', 'المستندات العامة', '', 'documents', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('notifications', 'notifications', 'الإشعارات', 'إشعارات الجرس لكل مستخدم.', 'notifications', 'created_at', 'is_read is not true and read_at is null and dismissed_at is null', 'الإشعارات غير المقروءة محمية', true, 6, false),
    ('notification_push_deliveries', 'notifications', 'سجل تسليم إشعارات الدفع', 'محاولات إرسال Push لكل اشتراك ونتيجتها.', 'notification_push_deliveries', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('notification_push_admin_actions', 'notifications', 'إجراءات IT على إشعارات الدفع', 'إعادة إرسال/إيقاف من بوابة IT.', 'notification_push_admin_actions', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 12, false),
    ('notification_push_subscriptions', 'notifications', 'اشتراكات Push للأجهزة', '', 'notification_push_subscriptions', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('notification_preferences', 'notifications', 'تفضيلات الإشعارات', '', 'notification_preferences', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('notification_workflow_policies', 'notifications', 'سياسات إشعارات سير العمل', '', 'notification_workflow_policies', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('announcements', 'notifications', 'التعميمات', '', 'announcements', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('announcement_receipts', 'notifications', 'إيصالات قراءة التعميمات', '', 'announcement_receipts', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('gps_position_history', 'gps', 'نقاط GPS التفصيلية للآليات', 'إحداثيات كل آلية كل ثوانٍ. ملخصات الرحلات والتنبيهات تبقى.', 'gps_device_position_history', 'fix_time', null, 'لا تُحذف نقاط رحلة عليها تحقيق مفتوح', true, 3, false),
    ('vehicle_positions', 'gps', 'مواقع المركبات (النظام القديم)', 'نقاط موقع من التكامل الأول قبل مزوّدي GPS.', 'vehicle_positions', 'fix_time', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('gps_events', 'gps', 'أحداث GPS العامة', 'تشغيل/إطفاء/سرعة وغيرها كما وصلت.', 'gps_events', 'occurred_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('gps_vendor_events', 'gps', 'أحداث مزوّد GPS الخام', 'الأحداث كما أرسلها المزوّد.', 'gps_vendor_events', 'occurred_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('gps_zone_events', 'gps', 'أحداث دخول/خروج المناطق', 'دخول وخروج الآليات من المناطق الجغرافية.', 'gps_zone_events', 'occurred_at', 'departure_id in (select ti.departure_id from public.gps_trip_investigations ti where ti.status <> ''resolved'')', 'أحداث رحلة عليها تحقيق مفتوح محمية', true, 6, false),
    ('gps_sync_runs', 'gps', 'سجل مزامنات GPS', 'كل دورة مزامنة مع المزوّد ونتيجتها.', 'gps_sync_runs', 'started_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('gps_history_import_runs', 'gps', 'سجل استيراد تاريخ GPS', 'عمليات استيراد المسارات القديمة.', 'gps_history_import_runs', 'started_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('gps_operational_alerts', 'gps', 'تنبيهات GPS التشغيلية', 'توقف طويل، خروج عن المسار… المحلولة فقط.', 'gps_operational_alerts', 'opened_at', 'resolved_at is null', 'التنبيهات غير المحلولة محمية', true, 12, false),
    ('live_track_points', 'gps', 'نقاط المشاركة الحية للموظفين', 'إحداثيات مشاركة الموقع من هواتف الميدان.', 'live_track_points', 'recorded_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('live_track_sessions', 'gps', 'جلسات المشاركة الحية', 'كل جلسة مشاركة موقع (بداية/نهاية/عدد النقاط).', 'live_track_sessions', 'started_at', 'ended_at is null', 'الجلسات الجارية محمية', true, 12, false),
    ('trip_route_points', 'gps', 'نقاط مسارات الانطلاقيات', 'النقاط المنظَّفة لكل انطلاقية (00342). ملخص المسار والتوقفات تبقى.', 'trip_route_points', 'fix_time', 'departure_id in (select ti.departure_id from public.gps_trip_investigations ti where ti.status <> ''resolved'')', 'نقاط انطلاقية عليها تحقيق مفتوح محمية', true, 12, false),
    ('trip_route_gaps', 'gps', 'فجوات GPS في مسارات الانطلاقيات', 'فترات انقطاع الإشارة لكل انطلاقية.', 'trip_route_gaps', 'started_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 24, false),
    ('trip_routes', 'gps', 'ملخصات مسارات الانطلاقيات', '', 'trip_routes', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('trip_route_stops', 'gps', 'توقفات مسارات الانطلاقيات', '', 'trip_route_stops', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('trip_route_settings', 'gps', 'إعدادات محرّك المسار', '', 'trip_route_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_devices', 'gps', 'أجهزة GPS', '', 'gps_devices', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_providers', 'gps', 'مزوّدو GPS', '', 'gps_providers', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_device_positions', 'gps', 'آخر موقع لكل جهاز', '', 'gps_device_positions', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('gps_geofences', 'gps', 'المناطق الجغرافية', '', 'gps_geofences', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_vehicle_geofences', 'gps', 'ربط الآليات بالمناطق', '', 'gps_vehicle_geofences', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_vehicle_bindings', 'gps', 'ربط الأجهزة بالآليات', '', 'gps_vehicle_bindings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_map_landmarks', 'gps', 'معالم الخريطة', '', 'gps_map_landmarks', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_route_deviation_settings', 'gps', 'إعدادات الانحراف عن المسار', '', 'gps_route_deviation_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_route_presence_state', 'gps', 'حالة التواجد على المسار', '', 'gps_route_presence_state', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('gps_zone_presence_state', 'gps', 'حالة التواجد في المناطق', '', 'gps_zone_presence_state', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('gps_alert_notification_policies', 'gps', 'سياسات إشعارات تنبيهات GPS', '', 'gps_alert_notification_policies', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_trip_investigations', 'gps', 'تحقيقات الرحلات', '', 'gps_trip_investigations', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('live_track_settings', 'gps', 'إعدادات المشاركة الحية', '', 'live_track_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_attendance_audit', 'hr', 'سجل تدقيق تعديلات الحضور', 'من عدّل ماذا ولماذا في أيام الحضور.', 'hr_attendance_audit', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('hr_deduction_review_audit', 'hr', 'سجل مراجعة الخصومات', 'قرارات نائب المدير على الخصومات.', 'hr_deduction_review_audit', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('hr_deduction_rule_audit', 'hr', 'سجل تعديل قواعد الخصم', 'تاريخ تغيير قواعد الخصم.', 'hr_deduction_rule_audit', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('rented_vehicle_tax_audit', 'hr', 'سجل تدقيق ضريبة المركبات المستأجرة', 'تعديلات إعدادات/استثناءات الضريبة.', 'rented_vehicle_tax_audit', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('hr_alerts', 'hr', 'تنبيهات الموارد البشرية', 'تنبيهات تجاوز العتبات (غياب/تأخير). المؤكَّدة فقط.', 'hr_alerts', 'created_at', 'acknowledged_at is null', 'التنبيهات غير المؤكَّدة محمية', true, 24, false),
    ('finance_hr_notices', 'hr', 'إشعارات HR إلى المالية', 'تبليغات تغيّر الراتب/الإنهاء. المنجَزة فقط.', 'finance_hr_notices', 'created_at', 'is_done is not true', 'الإشعارات غير المنجَزة محمية', true, 24, false),
    ('employees', 'hr', 'الموظفون', '', 'employees', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('departments', 'hr', 'الأقسام', '', 'departments', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('branches', 'hr', 'الفروع', '', 'branches', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('employee_documents', 'hr', 'وثائق الموظفين', '', 'employee_documents', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('hr_shifts', 'hr', 'الورديات', '', 'hr_shifts', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('employee_shift_assignments', 'hr', 'تعيين الورديات', '', 'employee_shift_assignments', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('hr_leave_types', 'hr', 'أنواع الإجازات', '', 'hr_leave_types', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_leaves', 'hr', 'الإجازات', '', 'hr_leaves', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('hr_leave_ledger', 'hr', 'رصيد الإجازات', '', 'hr_leave_ledger', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('termination_requests', 'hr', 'طلبات إنهاء الخدمة', '', 'termination_requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('hire_requests', 'hr', 'طلبات تعيين الموظفين (00348)', '', 'hire_requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('requests', 'hr', 'الطلبات العامة للموظفين', '', 'requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('attendance_records', 'hr', 'سجلات الحضور (القديمة)', '', 'attendance_records', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_attendance_days', 'hr', 'أيام الحضور المحسوبة', '', 'hr_attendance_days', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_attendance_confirmations', 'hr', 'تأكيدات شهر الحضور', '', 'hr_attendance_confirmations', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_attendance_pending_auto', 'hr', 'الخصومات الآلية بانتظار التأكيد', '', 'hr_attendance_pending_auto', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_attendance_deductions', 'hr', 'خصومات الحضور', '', 'hr_attendance_deductions', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_deduction_rules', 'hr', 'قواعد الخصم', '', 'hr_deduction_rules', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_deduction_rule_targets', 'hr', 'نطاق قواعد الخصم', '', 'hr_deduction_rule_targets', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_deduction_exemptions', 'hr', 'إعفاءات الخصم', '', 'hr_deduction_exemptions', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_month_exports', 'hr', 'تصدير الشهر إلى المالية', '', 'hr_month_exports', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_month_export_rows', 'hr', 'صفوف تصدير الشهر', '', 'hr_month_export_rows', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_policy', 'hr', 'سياسة الموارد البشرية', '', 'hr_policy', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_settings', 'hr', 'إعدادات الموارد البشرية', '', 'hr_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('rented_vehicle_tax_settings', 'hr', 'إعدادات ضريبة المركبات المستأجرة', '', 'rented_vehicle_tax_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('rented_vehicle_tax_overrides', 'hr', 'استثناءات ضريبة المركبات المستأجرة', '', 'rented_vehicle_tax_overrides', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_overtime_rates', 'hr', 'أجر الساعة الثابت للإضافي المدفوع', '', 'hr_overtime_rates', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_overtime_payouts', 'hr', 'صرف الساعات الإضافية', '', 'hr_overtime_payouts', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_overtime_members', 'hr', 'الموظفون المشمولون بالإضافي المدفوع', '', 'hr_overtime_members', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_overtime_member_events', 'hr', 'سجل إدراج/إزالة المشمولين بالإضافي المدفوع', '', 'hr_overtime_member_events', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('advance_events', 'finance', 'سجل أحداث السلف', 'مسار كل سلفة (طلب/موافقة/تسليم/تسديد). السلف غير المسدَّدة محمية.', 'advance_events', 'created_at', 'advance_id in (select a.id from public.advances a where a.settled_at is null and a.cancelled_at is null)', 'أحداث السلف غير المسدَّدة محمية', true, 36, true),
    ('disclosure_events', 'finance', 'سجل أحداث الكشوفات', 'مسار كل كشف (إرسال/موافقة/إرجاع). الكشوفات غير المنتهية محمية.', 'disclosure_events', 'created_at', 'disclosure_id in (select d.id from public.disclosures d where d.approved_at is null and d.cancelled_at is null)', 'أحداث الكشوفات غير المنتهية محمية', true, 36, true),
    ('payrolls', 'finance', 'الرواتب الشهرية', '', 'payrolls', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('payslips', 'finance', 'قسائم الرواتب', '', 'payslips', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('employee_salary_profiles', 'finance', 'ملفات الرواتب', '', 'employee_salary_profiles', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('advances', 'finance', 'السلف', '', 'advances', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('advance_installments', 'finance', 'أقساط السلف', '', 'advance_installments', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('advance_types', 'finance', 'أنواع السلف', '', 'advance_types', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('budget_allocations', 'finance', 'مخصصات الموازنة', '', 'budget_allocations', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('treasury_transactions', 'finance', 'حركات الخزينة', '', 'treasury_transactions', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('treasury_receivable_types', 'finance', 'أنواع المقبوضات', '', 'treasury_receivable_types', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('disclosures', 'finance', 'الكشوفات', '', 'disclosures', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('disclosure_types', 'finance', 'أنواع الكشوفات', '', 'disclosure_types', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('approval_delegations', 'approvals', 'تفويضات الموافقة', 'تفويض مؤقت لصلاحية الموافقة. السارية محمية.', 'approval_delegations', 'created_at', 'cancelled_at is null and ends_on >= current_date', 'التفويضات السارية محمية', true, 24, false),
    ('approval_chains', 'approvals', 'سلاسل الموافقات', '', 'approval_chains', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('approval_chain_versions', 'approvals', 'تاريخ تعديل سلاسل الموافقات', '', 'approval_chain_versions', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('approval_tasks', 'approvals', 'مهام الموافقة', '', 'approval_tasks', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('sector_notices', 'ops', 'بلاغات غرفة العمليات للقطاعات', 'رسائل مرسلة من غرفة العمليات إلى مديري القطاعات.', 'sector_notices', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 12, false),
    ('deputy_daily_reports', 'ops', 'التقارير اليومية لنائب المدير', 'لقطة التقرير اليومي المرسَل.', 'deputy_daily_reports', 'sent_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 24, true),
    ('gbs_container_updates', 'ops', 'طلبات تحديث الحاويات', 'طلبات تغيير حالة/موقع حاوية. غير المراجَعة محمية.', 'gbs_container_updates', 'created_at', 'reviewed_at is null', 'الطلبات غير المراجَعة محمية', true, 12, false),
    ('vehicles', 'ops', 'المركبات (الأسطول)', '', 'vehicles', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('vehicle_categories', 'ops', 'فئات المركبات', '', 'vehicle_categories', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('garage_vehicles', 'ops', 'آليات الكراج', '', 'garage_vehicles', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('garage_departures', 'ops', 'خروج ورجوع الآليات', '', 'garage_departures', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('garage_driver_assignments', 'ops', 'تعيين السائقين', '', 'garage_driver_assignments', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('garage_vehicle_shift_assignments', 'ops', 'ورديات الآليات', '', 'garage_vehicle_shift_assignments', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('garage_tanks', 'ops', 'خزانات الوقود', '', 'garage_tanks', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('garage_inventory_movements', 'ops', 'حركات الوقود والمخزون', '', 'garage_inventory_movements', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('garage_tank_zero_requests', 'ops', 'طلبات تصفير الخزان', '', 'garage_tank_zero_requests', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('garage_user_profiles', 'ops', 'حسابات الكراج', '', 'garage_user_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('vehicle_trip_legs', 'ops', 'أرجل الرحلات', '', 'vehicle_trip_legs', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ops_store_items', 'ops', 'مواد مخزن العمليات', '', 'ops_store_items', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('ops_store_movements', 'ops', 'حركات مخزن العمليات', '', 'ops_store_movements', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('gbs_containers', 'ops', 'الحاويات', '', 'gbs_containers', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('follow_up_profiles', 'ops', 'حسابات المتابعة الميدانية', '', 'follow_up_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('sectors', 'ops', 'القطاعات', '', 'sectors', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('vehicle_maintenance_updates', 'maintenance', 'تحديثات حالات الصيانة', 'التحديثات التفصيلية (تشخيص/عمل). الحالات غير المكتملة محمية.', 'vehicle_maintenance_updates', 'created_at', 'case_id in (select c.id from public.vehicle_maintenance_cases c where c.completed_at is null)', 'تحديثات الحالات غير المكتملة محمية', true, 24, false),
    ('vehicle_maintenance_stages', 'maintenance', 'مراحل حالات الصيانة', 'مراحل الوصول/التشخيص/الإصلاح/الفحص/التسليم. الحالات غير المكتملة محمية.', 'vehicle_maintenance_stages', 'created_at', 'case_id in (select c.id from public.vehicle_maintenance_cases c where c.completed_at is null)', 'مراحل الحالات غير المكتملة محمية', true, 24, false),
    ('vehicle_maintenance_cases', 'maintenance', 'حالات الصيانة', '', 'vehicle_maintenance_cases', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('vehicle_maintenance_parts', 'maintenance', 'قطع الغيار المستخدمة', '', 'vehicle_maintenance_parts', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('vehicle_maintenance_attachments', 'maintenance', 'مرفقات الصيانة', '', 'vehicle_maintenance_attachments', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('vehicle_maintenance_case_technicians', 'maintenance', 'فنيو الحالات', '', 'vehicle_maintenance_case_technicians', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('maintenance_workshops', 'maintenance', 'الورش', '', 'maintenance_workshops', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('maintenance_workshop_accounts', 'maintenance', 'حسابات الورش', '', 'maintenance_workshop_accounts', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('maintenance_inventory_items', 'maintenance', 'مواد مخزن الصيانة', '', 'maintenance_inventory_items', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('maintenance_inventory_movements', 'maintenance', 'حركات مخزن الصيانة', '', 'maintenance_inventory_movements', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('maintenance_purchase_orders', 'maintenance', 'أوامر الشراء', '', 'maintenance_purchase_orders', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('maintenance_purchase_items', 'maintenance', 'بنود أوامر الشراء', '', 'maintenance_purchase_items', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('complaint_email_events', 'complaints', 'أحداث البريد الإلكتروني للشكاوى', 'إشعارات المزوّد (تسليم/فتح/ارتداد).', 'complaint_email_events', 'event_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 12, false),
    ('complaint_media_revisions', 'complaints', 'سجل استبدال صور الشكاوى', 'من استبدل أي صورة ولماذا.', 'complaint_media_revisions', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 24, false),
    ('complaint_inbox_messages', 'complaints', 'رسائل صندوق وارد الشكاوى', 'الرسائل الواردة بالبريد. المؤرشفة فقط.', 'complaint_inbox_messages', 'received_at', 'archived_at is null', 'الرسائل غير المؤرشفة محمية', true, 12, false),
    ('complaints', 'complaints', 'الشكاوى', '', 'complaints', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_items', 'complaints', 'بنود الشكاوى', '', 'complaint_items', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_status_history', 'complaints', 'تاريخ حالات الشكاوى', '', 'complaint_status_history', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_media', 'complaints', 'صور الشكاوى', '', 'complaint_media', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('complaint_reports', 'complaints', 'تقارير الشكاوى', '', 'complaint_reports', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_report_items', 'complaints', 'بنود تقارير الشكاوى', '', 'complaint_report_items', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_templates', 'complaints', 'قوالب الشكاوى', '', 'complaint_templates', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_settings', 'complaints', 'إعدادات الشكاوى', '', 'complaint_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_contacts', 'complaints', 'جهات اتصال الشكاوى', '', 'complaint_contacts', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_neighborhoods', 'complaints', 'الأحياء', '', 'complaint_neighborhoods', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_sender_rules', 'complaints', 'قواعد المرسلين', '', 'complaint_sender_rules', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_archive_folders', 'complaints', 'مجلدات أرشيف الشكاوى', '', 'complaint_archive_folders', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_deletion_requests', 'complaints', 'طلبات حذف الشكاوى', '', 'complaint_deletion_requests', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('complaint_email_deliveries', 'complaints', 'إرسالات البريد للتقارير', '', 'complaint_email_deliveries', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('citizen_complaint_events', 'citizen', 'أحداث شكاوى المواطنين', 'مسار كل شكوى مواطن. الشكاوى غير المحلولة محمية.', 'citizen_complaint_events', 'created_at', 'complaint_id in (select c.id from public.citizen_complaints c where c.resolved_at is null)', 'أحداث الشكاوى غير المحلولة محمية', true, 24, false),
    ('citizen_chat_messages', 'citizen', 'رسائل محادثات المواطنين', 'نصوص المحادثة. الجلسات المفتوحة محمية.', 'citizen_chat_messages', 'created_at', 'session_id in (select s.id from public.citizen_chat_sessions s where s.closed_at is null)', 'رسائل الجلسات المفتوحة محمية', true, 12, false),
    ('citizen_chat_sessions', 'citizen', 'جلسات محادثات المواطنين', 'جلسة المحادثة (طلب/قبول/إغلاق/تقييم). المفتوحة محمية.', 'citizen_chat_sessions', 'requested_at', 'closed_at is null', 'الجلسات المفتوحة محمية', true, 12, false),
    ('citizen_accounts', 'citizen', 'حسابات المواطنين', '', 'citizen_accounts', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('citizen_complaints', 'citizen', 'شكاوى المواطنين', '', 'citizen_complaints', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('citizen_complaint_photos', 'citizen', 'صور شكاوى المواطنين', '', 'citizen_complaint_photos', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('citizen_portal_settings', 'citizen', 'إعدادات بوابة المواطن', '', 'citizen_portal_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('contractor_audit_log', 'contractors', 'سجل تدقيق المقاولين', 'تعديلات العمال/الأعداد وأسبابها.', 'contractor_audit_log', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('contractor_checkins', 'contractors', 'تسجيلات حضور المقاولين الميدانية', 'موقع + سيلفي + صورة الفريق عند الحضور. الأشهر غير المعتمدة مالياً محمية.', 'contractor_checkins', 'checked_at', 'not exists (select 1 from public.contractor_month_approvals a where a.month = date_trunc(''month'', log_date)::date and a.approved_at is not null)', 'تسجيلات شهر لم تعتمده المالية محمية', true, 24, true),
    ('contractor_profiles', 'contractors', 'حسابات المقاولين', '', 'contractor_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('contractor_workers', 'contractors', 'عمال المقاولين', '', 'contractor_workers', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('contractor_worker_attendance', 'contractors', 'حضور عمال المقاولين', '', 'contractor_worker_attendance', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('contractor_daily_counts', 'contractors', 'الأعداد اليومية', '', 'contractor_daily_counts', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('contractor_rates', 'contractors', 'أجور المقاولين', '', 'contractor_rates', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('contractor_worker_wages', 'contractors', 'أجور العمال', '', 'contractor_worker_wages', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('contractor_month_approvals', 'contractors', 'اعتماد أشهر المقاولين', '', 'contractor_month_approvals', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('sector_manager_profiles', 'sectors', 'حسابات مديري القطاعات', '', 'sector_manager_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('sector_workers', 'sectors', 'عمال القطاعات', '', 'sector_workers', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('sector_vehicles', 'sectors', 'آليات القطاعات', '', 'sector_vehicles', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('sector_attendance', 'sectors', 'حضور عمال القطاعات', '', 'sector_attendance', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('sector_photos', 'sectors', 'صور القطاعات', '', 'sector_photos', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('sector_breakdowns', 'sectors', 'أعطال القطاعات', '', 'sector_breakdowns', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('sector_supply_requests', 'sectors', 'طلبات التجهيز', '', 'sector_supply_requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('sector_support_requests', 'sectors', 'طلبات الإسناد', '', 'sector_support_requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('sector_support_assignments', 'sectors', 'تعيينات الإسناد', '', 'sector_support_assignments', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_attendance_records', 'station', 'حضور المحطة التحويلية', '', 'ts_attendance_records', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('ts_carrier_records', 'station', 'سجلات الناقلات', '', 'ts_carrier_records', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_saksat_records', 'station', 'سجلات السكسات', '', 'ts_saksat_records', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_trips_records', 'station', 'سجلات رحلات المحطة', '', 'ts_trips_records', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_weight_records', 'station', 'سجلات الوزن', '', 'ts_weight_records', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_visit_weighing_steps', 'station', 'خطوات الوزن', '', 'ts_visit_weighing_steps', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_violations', 'station', 'مخالفات الحد الأدنى', '', 'ts_violations', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_unit_capacities', 'station', 'سعات الوحدات', '', 'ts_unit_capacities', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('station_destinations', 'station', 'وجهات المحطة', '', 'station_destinations', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('station_external_drivers', 'station', 'السائقون الخارجيون', '', 'station_external_drivers', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('media_submissions', 'media', 'إرسالات الإعلام', '', 'media_submissions', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('media_submission_photos', 'media', 'صور الإرسالات', '', 'media_submission_photos', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('media_designs', 'media', 'تصاميم التقارير', '', 'media_designs', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('media_design_sheets', 'media', 'صفحات التصاميم', '', 'media_design_sheets', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('media_design_photos', 'media', 'صور التصاميم', '', 'media_design_photos', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('media_design_templates', 'media', 'قوالب التصاميم', '', 'media_design_templates', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('media_covers', 'media', 'أغلفة التقارير', '', 'media_covers', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('cold_archive_settings', 'archive', 'إعدادات الأرشيف البارد', '', 'cold_archive_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('cold_archive_packages', 'archive', 'حزم الأرشيف البارد', '', 'cold_archive_packages', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('cold_archive_items', 'archive', 'عناصر الأرشيف البارد', '', 'cold_archive_items', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('cold_archive_copies', 'archive', 'النسخ الموثَّقة', '', 'cold_archive_copies', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('cold_archive_events', 'archive', 'سجل أحداث الأرشيف البارد', '', 'cold_archive_events', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('data_retention_policies', 'archive', 'سياسات الاحتفاظ', '', 'data_retention_policies', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('data_retention_requests', 'archive', 'طلبات حذف الاحتفاظ', '', 'data_retention_requests', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('data_retention_events', 'archive', 'سجل أحداث الاحتفاظ', '', 'data_retention_events', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false)
$$;
