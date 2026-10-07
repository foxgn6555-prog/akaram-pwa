-- 00193 — وحدة الحضوريات في غرفة العمليات بمرحلتين:
--   ① التدقيق التفصيلي (الأوقات، التعديلات بسبب) → «اعتماد حضورية الشهر»
--   ② الكشف المعتمد (حاضر / غائب / مجاز فقط + ملخص لكل موظف) → «تصدير بيانات الشهر إلى المالية»
-- الترتيب إلزامي: لا تصدير للمالية قبل الاعتماد (سياسة require_attendance_confirmation، افتراضياً مفعّلة).
-- بعد الاعتماد: أي تعديل يدوي ممنوع (HR_ATTENDANCE_CONFIRMED) حتى «إعادة الفتح» بسبب يُسجَّل ويُبلَّغ التطوير المركزية؛
-- التغييرات التلقائية (بصمة متأخرة، إجازة اعتُمدت لاحقاً) لا تُطبَّق صامتةً بل تُعلَّق كـ«auto_blocked» وتظهر للمدقق حتى يعيد الفتح ثم الاعتماد.

-- ═══════════════ ① الجدول ═══════════════
create table if not exists public.hr_attendance_confirmations (
  period_month date primary key,
  status text not null check (status in ('confirmed', 'reopened')),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  confirm_count int not null default 0,
  reopened_by uuid references auth.users(id),
  reopened_at timestamptz,
  reopen_reason text,
  employees_count int,
  days_evaluated int,
  snapshot jsonb not null default '{}'::jsonb,
  deductions_after int not null default 0,    -- استقطاعات كشوفات وصلت بعد الاعتماد
  updated_at timestamptz not null default now()
);
-- الأيام التي وصلها تغيير تلقائي بعد الاعتماد (بصمة متأخرة / إجازة اعتُمدت لاحقاً) — تُعرض للمدقق وتُصفَّر عند إعادة الاعتماد/الفتح
create table if not exists public.hr_attendance_pending_auto (
  period_month date not null references public.hr_attendance_confirmations(period_month) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  would_be_status text,
  first_seen_at timestamptz not null default now(),
  primary key (period_month, employee_id, work_date)
);
alter table public.hr_attendance_pending_auto enable row level security;
drop policy if exists hr_att_pending_select on public.hr_attendance_pending_auto;
create policy hr_att_pending_select on public.hr_attendance_pending_auto for select
  using (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'it_admin', 'super_admin']));
alter table public.hr_attendance_confirmations enable row level security;
drop policy if exists hr_att_conf_select on public.hr_attendance_confirmations;
create policy hr_att_conf_select on public.hr_attendance_confirmations for select
  using (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'it_admin', 'super_admin']));

create or replace function app.hr_month_confirmed(p_month date) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.hr_attendance_confirmations where period_month = date_trunc('month', p_month)::date and status = 'confirmed') $$;

-- إجراءات التدقيق الجديدة: confirm / reopen / auto_blocked
alter table public.hr_attendance_audit drop constraint if exists hr_attendance_audit_action_check;
alter table public.hr_attendance_audit add constraint hr_attendance_audit_action_check
  check (action in ('edit', 'reset_auto', 'deduction_add', 'deduction_delete', 'export', 'approve', 'waive', 'unwaive', 'confirm', 'reopen', 'auto_blocked'));

-- ═══════════════ ② حارس ما بعد الاعتماد ═══════════════
create or replace function app.hr_attendance_confirmed_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare d date := coalesce(new.work_date, old.work_date); manual boolean; o jsonb; n jsonb; cur public.hr_attendance_days;
begin
  if current_setting('app.attendance_confirming', true) = 'on' then return case when tg_op = 'DELETE' then old else new end; end if;
  if not app.hr_month_confirmed(d) then return case when tg_op = 'DELETE' then old else new end; end if;
  manual := (tg_op = 'DELETE' and old.source = 'manual') or (tg_op <> 'DELETE' and new.source = 'manual')
            or (tg_op = 'UPDATE' and (new.deduction_waived is distinct from old.deduction_waived or new.source is distinct from old.source));
  if manual then raise exception 'HR_ATTENDANCE_CONFIRMED'; end if;
  -- تغيير تلقائي: إن لم يتغيّر شيء جوهري (إعادة احتساب بالنتيجة نفسها) فتجاهله بصمت، وإلا علِّقه
  if tg_op = 'UPDATE' then
    o := to_jsonb(old) - 'updated_at'; n := to_jsonb(new) - 'updated_at';
    if o = n then return null; end if;
  elsif tg_op = 'INSERT' then
    -- الإدراج يسبق احتساب المشتقات (hr_compute_day_metrics) ⇒ نقارن الحقول الأساسية فقط
    select * into cur from public.hr_attendance_days where employee_id = new.employee_id and work_date = new.work_date;
    if found then
      o := to_jsonb(cur) - array['updated_at', 'id', 'required_minutes', 'shortfall_minutes', 'overtime_minutes', 'permit_minutes', 'proposed_deduction_minutes', 'proposed_deduction_days', 'deduction_reason', 'deduction_waived', 'waive_reason', 'waived_by'];
      n := to_jsonb(new) - array['updated_at', 'id', 'required_minutes', 'shortfall_minutes', 'overtime_minutes', 'permit_minutes', 'proposed_deduction_minutes', 'proposed_deduction_days', 'deduction_reason', 'deduction_waived', 'waive_reason', 'waived_by'];
      if o = n then return null; end if;
    end if;
  end if;
  insert into public.hr_attendance_audit (employee_id, work_date, action, before, after, reason, actor)
  values (coalesce(new.employee_id, old.employee_id), d, 'auto_blocked', case when tg_op = 'INSERT' then to_jsonb(cur) else to_jsonb(old) end, case when tg_op = 'DELETE' then null else to_jsonb(new) end,
          'تغيير تلقائي بعد اعتماد حضورية الشهر — مُعلَّق حتى إعادة الاعتماد', auth.uid());
  insert into public.hr_attendance_pending_auto (period_month, employee_id, work_date, would_be_status)
  values (date_trunc('month', d)::date, coalesce(new.employee_id, old.employee_id), d, case when tg_op = 'DELETE' then null else new.status end)
  on conflict (period_month, employee_id, work_date) do update set would_be_status = excluded.would_be_status;
  return null;
end$$;
drop trigger if exists trg_hr_attendance_confirmed_guard on public.hr_attendance_days;
create trigger trg_hr_attendance_confirmed_guard before insert or update or delete on public.hr_attendance_days
  for each row execute function app.hr_attendance_confirmed_guard();

create or replace function app.hr_deduction_confirmed_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare m date := coalesce(new.period_month, old.period_month);
begin
  if current_setting('app.attendance_confirming', true) = 'on' then return case when tg_op = 'DELETE' then old else new end; end if;
  if not app.hr_month_confirmed(m) then return case when tg_op = 'DELETE' then old else new end; end if;
  -- استقطاع كشف معتمد يُسمح به (يصل من سلسلة الكشوفات) ويظهر كتغيير بعد الاعتماد؛ اليدوي ممنوع
  if tg_op = 'INSERT' and new.source_disclosure_id is not null then
    update public.hr_attendance_confirmations set deductions_after = deductions_after + 1, updated_at = now() where period_month = date_trunc('month', m)::date;
    return new;
  end if;
  raise exception 'HR_ATTENDANCE_CONFIRMED';
end$$;
drop trigger if exists trg_hr_deduction_confirmed_guard on public.hr_attendance_deductions;
create trigger trg_hr_deduction_confirmed_guard before insert or update or delete on public.hr_attendance_deductions
  for each row execute function app.hr_deduction_confirmed_guard();

-- إعادة الاحتساب اليدوي تحذف صفاً تلقائياً ثم تعيد بناءه؛ بعد الاعتماد تُرفض صراحةً (الحارس وحده كان سيعلّق الحذف بصمت)
create or replace function public.ops_attendance_reset(p_employee uuid, p_date date, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare b jsonb;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  if app.hr_month_locked(p_date) then raise exception 'HR_MONTH_LOCKED'; end if;
  if app.hr_month_confirmed(p_date) then raise exception 'HR_ATTENDANCE_CONFIRMED'; end if;
  select to_jsonb(d) into b from public.hr_attendance_days d where d.employee_id = p_employee and d.work_date = p_date;
  delete from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  perform app.hr_evaluate_day(p_employee, p_date);
  insert into public.hr_attendance_audit (employee_id, work_date, action, before, after, reason, actor)
  values (p_employee, p_date, 'reset_auto', b, (select to_jsonb(d) from public.hr_attendance_days d where d.employee_id = p_employee and d.work_date = p_date), trim(p_reason), auth.uid());
end$$;

-- ═══════════════ ③ حالة الاعتماد ═══════════════
create or replace function app.hr_attendance_confirmation(p_month date) returns jsonb
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t),
  c as (select * from public.hr_attendance_confirmations, m where period_month = m.f),
  s as (select coalesce(sum(unevaluated_days), 0)::int as unevaluated, count(*)::int as employees from app.hr_month_summary((select f from m)) x),
  x as (select hr_month_export_status as st from app.hr_month_export_status((select f from m)))
  select jsonb_build_object(
    'month', m.f,
    'status', coalesce(c.status, 'open'),
    'confirmed', coalesce(c.status = 'confirmed', false),
    'confirmed_at', c.confirmed_at, 'confirmed_by_name', case when c.confirmed_by is null then null else app.manager_display_name(c.confirmed_by) end,
    'confirm_count', coalesce(c.confirm_count, 0),
    'reopened_at', c.reopened_at, 'reopened_by_name', case when c.reopened_by is null then null else app.manager_display_name(c.reopened_by) end, 'reopen_reason', c.reopen_reason,
    'pending_auto', case when c.status = 'confirmed' then (select count(*) from public.hr_attendance_pending_auto p where p.period_month = m.f) else 0 end,
    'pending_days', case when c.status = 'confirmed' then (select coalesce(jsonb_agg(jsonb_build_object('employee_id', p.employee_id, 'full_name', e.full_name, 'work_date', p.work_date, 'would_be', p.would_be_status) order by e.full_name, p.work_date), '[]'::jsonb)
                                                           from public.hr_attendance_pending_auto p join public.employees e on e.id = p.employee_id where p.period_month = m.f) else '[]'::jsonb end,
    'deductions_after', case when c.status = 'confirmed' then coalesce(c.deductions_after, 0) else 0 end,
    'unevaluated_days', s.unevaluated, 'employees', s.employees,
    'locked', app.hr_month_locked(m.f),
    'required', app.hr_policy_bool('require_attendance_confirmation', true),
    'export', x.st,
    'snapshot', coalesce(c.snapshot, '{}'::jsonb),
    'can_export', not app.hr_month_locked(m.f) and (not app.hr_policy_bool('require_attendance_confirmation', true)
                    or (coalesce(c.status = 'confirmed', false) and not exists (select 1 from public.hr_attendance_pending_auto p where p.period_month = m.f))))
  from m left join c on true, s, x
$$;

create or replace function public.ops_attendance_confirmation(p_month date) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'it_admin', 'super_admin']) then app.hr_attendance_confirmation(p_month) else '{}'::jsonb end $$;
grant execute on function public.ops_attendance_confirmation(date) to authenticated;

-- ═══════════════ ④ الاعتماد / إعادة الفتح ═══════════════
-- الاعتماد يُعاد استدعاؤه بحرية (إعادة اعتماد): يطبّق التغييرات التلقائية المعلّقة ويصفّر العدّادات. التعديل اليدوي يحتاج إعادة فتح.
create or replace function public.ops_attendance_confirm(p_month date) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; n int; unev int; snap jsonb; emp int;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
  if m > date_trunc('month', current_date)::date then raise exception 'HR_MONTH_FUTURE'; end if;
  perform set_config('app.attendance_confirming', 'on', true);
  n := app.hr_evaluate_month(m);
  select coalesce(sum(unevaluated_days), 0), count(*),
         jsonb_build_object('days_present', coalesce(sum(days_present), 0), 'days_late', coalesce(sum(days_late), 0), 'days_absent', coalesce(sum(days_absent), 0),
                            'days_incomplete', coalesce(sum(days_incomplete), 0), 'days_leave', coalesce(sum(days_leave), 0), 'auto_minutes', coalesce(sum(auto_minutes), 0), 'auto_days', coalesce(sum(auto_days), 0))
    into unev, emp, snap from app.hr_month_summary(m);
  if unev > 0 then raise exception 'HR_ATTENDANCE_UNEVALUATED'; end if;
  insert into public.hr_attendance_confirmations as c (period_month, status, confirmed_by, confirmed_at, confirm_count, employees_count, days_evaluated, snapshot)
  values (m, 'confirmed', auth.uid(), now(), 1, emp, n, snap)
  on conflict (period_month) do update set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(), confirm_count = c.confirm_count + 1,
    employees_count = excluded.employees_count, days_evaluated = excluded.days_evaluated, snapshot = excluded.snapshot, deductions_after = 0, updated_at = now();
  delete from public.hr_attendance_pending_auto where period_month = m;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select s.employee_id, m, 'confirm', jsonb_build_object('month', m, 'days_evaluated', n) || snap, 'اعتماد حضورية الشهر من غرفة العمليات', auth.uid()
  from app.hr_month_summary(m) s;
  perform set_config('app.attendance_confirming', 'off', true);
  return app.hr_attendance_confirmation(m);
end$$;
grant execute on function public.ops_attendance_confirm(date) to authenticated;

create or replace function public.ops_attendance_reopen(p_month date, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; c record; n int; v_actor text;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' or length(trim(p_reason)) < 3 then raise exception 'HR_REASON_REQUIRED'; end if;
  if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
  select * into c from public.hr_attendance_confirmations where period_month = m;
  if not found or c.status <> 'confirmed' then raise exception 'HR_ATTENDANCE_NOT_CONFIRMED'; end if;
  update public.hr_attendance_confirmations set status = 'reopened', reopened_by = auth.uid(), reopened_at = now(), reopen_reason = trim(p_reason), deductions_after = 0, updated_at = now() where period_month = m;
  delete from public.hr_attendance_pending_auto where period_month = m;
  -- تُطبَّق الآن التغييرات التلقائية التي عُلِّقت أثناء الاعتماد (إجازات/بصمات متأخرة)
  n := app.hr_evaluate_month(m);
  insert into public.hr_attendance_audit (employee_id, work_date, action, before, after, reason, actor)
  select s.employee_id, m, 'reopen', jsonb_build_object('confirmed_at', c.confirmed_at), jsonb_build_object('days_reevaluated', n), trim(p_reason), auth.uid()
  from app.hr_month_summary(m) s;
  v_actor := app.manager_display_name(auth.uid());
  insert into public.notifications (user_id, title, body, type, category, priority, link, entity_type, entity_id, action_label, dedupe_key)
  select distinct ur.user_id, 'إعادة فتح حضورية شهر ' || to_char(m, 'YYYY-MM') || ' من غرفة العمليات',
         left(format('أُعيد فتح حضورية الشهر بعد اعتمادها · السبب: %s · بواسطة %s', trim(p_reason), coalesce(v_actor, '—')), 1000),
         'warning', 'hr', 'high', '/it/integrations/biometric/attendance-audit', 'hr_attendance_confirmations', null::uuid, 'فتح سجل التدقيق', 'hr_att_reopen:' || m::text || ':' || extract(epoch from now())::bigint::text
  from public.user_roles ur where ur.role in ('it_admin', 'super_admin') and ur.user_id is distinct from auth.uid()
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return app.hr_attendance_confirmation(m);
end$$;
grant execute on function public.ops_attendance_reopen(date, text) to authenticated;

-- ═══════════════ ⑤ شبكة الشهر (موظف × أيام) للمرحلتين ═══════════════
create or replace function public.ops_attendance_month_grid(p_month date, p_branch uuid default null, p_department uuid default null, p_search text default null)
returns table (
  employee_id uuid, employee_number text, full_name text, job_title text, department_id uuid, department_name text, branch_name text, contract_type text,
  days jsonb, present_days int, late_days int, early_days int, incomplete_days int, absent_days int, leave_days int, rest_days int, unevaluated_days int,
  worked_minutes int, late_minutes int, early_minutes int, shortfall_minutes int, overtime_minutes int, permit_minutes int, proposed_minutes int, proposed_days numeric
) language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t, app.hr_local_date(now()) as today),
  deps as (select id from public.departments where p_department is null or id = p_department or parent_id = p_department),
  emp as (
    select e.id, e.employee_number, e.full_name, e.job_title, e.department_id, d.name as department_name, b.name as branch_name, e.contract_type, e.hire_date, e.terminated_at
    from public.employees e cross join m
    left join public.departments d on d.id = e.department_id
    left join public.branches b on b.id = e.branch_id
    where e.archived_at is null and e.biometric_pin is not null and e.hire_date <= m.t and (e.terminated_at is null or e.terminated_at >= m.f)
      and (p_branch is null or e.branch_id = p_branch)
      and (p_department is null or e.department_id in (select id from deps))
      and (p_search is null or e.full_name ilike '%' || p_search || '%' or e.employee_number ilike '%' || p_search || '%')
      and app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'it_admin', 'super_admin'])),
  cal as (select e.id as employee_id, g::date as d from emp e, m, generate_series(m.f, m.t, interval '1 day') g),
  cell as (
    select c.employee_id, c.d, a.status,
           coalesce(a.is_rest_day, sh.shift_id is not null and not (extract(dow from c.d)::smallint = any (sh.work_days))) as is_rest_day, a.source, a.check_in, a.check_out, a.worked_minutes, a.late_minutes, a.early_minutes, a.shortfall_minutes, a.overtime_minutes, a.permit_minutes,
           a.proposed_deduction_minutes, a.proposed_deduction_days, a.deduction_waived, a.edit_reason,
           (a.id is null and c.d >= e.hire_date and c.d <= coalesce(e.terminated_at, c.d) and c.d < m.today
              and not (sh.shift_id is not null and not (extract(dow from c.d)::smallint = any (sh.work_days)))) as unevaluated,
           (c.d < e.hire_date or (e.terminated_at is not null and c.d > e.terminated_at)) as out_of_service
    from cal c join emp e on e.id = c.employee_id cross join m
    left join public.hr_attendance_days a on a.employee_id = c.employee_id and a.work_date = c.d
    left join lateral app.hr_effective_shift(c.employee_id, c.d) sh on a.id is null)
  select e.id, e.employee_number, e.full_name, e.job_title, e.department_id, e.department_name, e.branch_name, e.contract_type,
    (select jsonb_agg(jsonb_build_object('d', c.d, 's', case when c.out_of_service then 'none' when c.unevaluated then 'pending' when c.status is null and c.is_rest_day and c.d < (select today from m) then 'rest' when c.status is null then 'future' else c.status end,
        'rest', coalesce(c.is_rest_day, false), 'src', c.source,
        'in', case when c.check_in is null then null else to_char(c.check_in + app.hr_tz(), 'HH24:MI') end,
        'out', case when c.check_out is null then null else to_char(c.check_out + app.hr_tz(), 'HH24:MI') end,
        'w', coalesce(c.worked_minutes, 0), 'late', coalesce(c.late_minutes, 0), 'early', coalesce(c.early_minutes, 0), 'short', coalesce(c.shortfall_minutes, 0), 'ot', coalesce(c.overtime_minutes, 0), 'permit', coalesce(c.permit_minutes, 0),
        'pm', coalesce(c.proposed_deduction_minutes, 0), 'pd', coalesce(c.proposed_deduction_days, 0), 'waived', coalesce(c.deduction_waived, false), 'note', c.edit_reason) order by c.d)
     from cell c where c.employee_id = e.id),
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'present')::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'late')::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'early_leave')::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'incomplete')::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'absent')::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status in ('leave', 'time_permit'))::int,
    (select count(*) from cell c where c.employee_id = e.id and coalesce(c.is_rest_day, false))::int,
    (select count(*) from cell c where c.employee_id = e.id and c.unevaluated)::int,
    (select coalesce(sum(c.worked_minutes), 0) from cell c where c.employee_id = e.id)::int,
    (select coalesce(sum(c.late_minutes), 0) from cell c where c.employee_id = e.id)::int,
    (select coalesce(sum(c.early_minutes), 0) from cell c where c.employee_id = e.id)::int,
    (select coalesce(sum(c.shortfall_minutes), 0) from cell c where c.employee_id = e.id)::int,
    (select coalesce(sum(c.overtime_minutes), 0) from cell c where c.employee_id = e.id)::int,
    (select coalesce(sum(c.permit_minutes), 0) from cell c where c.employee_id = e.id)::int,
    (select coalesce(sum(c.proposed_deduction_minutes), 0) from cell c where c.employee_id = e.id and not coalesce(c.deduction_waived, false))::int,
    (select coalesce(sum(c.proposed_deduction_days), 0) from cell c where c.employee_id = e.id and not coalesce(c.deduction_waived, false))
  from emp e
  order by e.department_name nulls last, e.full_name
$$;
grant execute on function public.ops_attendance_month_grid(date, uuid, uuid, text) to authenticated;

-- ═══════════════ ⑥ البوابة: لا تصدير للمالية قبل الاعتماد (إعادة تعريف ops_month_export كاملة — نسخة 00192 + البوابة) ═══════════════
create or replace function public.ops_month_export(p_month date)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; v_id uuid; v_ver int; n int; n_eval int;
        v_basis text := coalesce(app.hr_policy() ->> 'salary_day_basis', 'fixed_30');
        v_prorate boolean := app.hr_policy_bool('prorate_partial_month', true);
        v_prorate_allow boolean := app.hr_policy_bool('prorate_allowances', true);
        v_cap numeric := app.hr_policy_num('auto_deduction_cap_ratio', 1);
        v_auto_on boolean := app.hr_policy_bool('auto_deduction_enabled', true);
        v_mode text := coalesce(app.hr_policy() ->> 'auto_deduction_amount_mode', 'salary');
        v_fix_day numeric := app.hr_policy_num('fixed_absent_day_amount', 0);
        v_fix_min numeric := app.hr_policy_num('fixed_shortfall_minute_amount', 0);
        v_max_days numeric := app.hr_policy_num('max_auto_deduction_days_per_month', 0);
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
  if m > date_trunc('month', current_date)::date then raise exception 'HR_MONTH_FUTURE'; end if;
  if not coalesce((app.hr_attendance_confirmation(m) ->> 'can_export')::boolean, false) then raise exception 'HR_ATTENDANCE_NOT_CONFIRMED'; end if;
  n_eval := app.hr_evaluate_month(m);
  update public.hr_month_exports set status = 'superseded' where period_month = m and status = 'exported';
  select coalesce(max(version), 0) + 1 into v_ver from public.hr_month_exports where period_month = m;
  insert into public.hr_month_exports (period_month, version, exported_by) values (m, v_ver, auth.uid()) returning id into v_id;
  perform app.hr_overtime_credit(m);

  insert into public.hr_month_export_rows (export_id, employee_id, employee_number, full_name, department_name, branch_name, job_title, contract_type,
    working_days, days_present, days_late, days_absent, days_incomplete, days_leave, late_minutes, early_minutes,
    ops_deduction_amount, ops_deduction_days, ops_deduction_reasons,
    auto_deduction_minutes, auto_deduction_days, shift_minutes, overtime_minutes, shortfall_minutes, auto_deduction_amount,
    days_leave_paid, days_leave_unpaid, auto_absence_days, auto_shortfall_days, ops_deduction_days_amount, payable_days, gross_amount, deductions_total,
    scheduled_days, unevaluated_days, period_from, period_to, covered_days, days_in_month, day_rate, proration_ratio, auto_deduction_capped,
    auto_deduction_basis, auto_deduction_days_capped,
    pay_type, base_salary, daily_rate, allowances_total, fixed_deductions_total, proposed_net, final_net)
  select v_id, e.id, e.employee_number, e.full_name, d.name, b.name, e.job_title, e.contract_type,
    s.working_days, s.days_present, s.days_late, s.days_absent, s.days_incomplete, s.days_leave, s.late_minutes, s.early_minutes,
    s.ded_amount, s.ded_days, s.ded_reasons,
    s.auto_minutes, case when sp.pay_type = 'daily' then s.auto_days_shortfall else s.auto_days end, s.shift_minutes, s.overtime_minutes, s.shortfall_minutes, calc.auto_amount,
    s.days_leave_paid, s.days_leave_unpaid, s.auto_days_absence, s.auto_days_shortfall, calc.ops_days_amount, calc.payable_days, calc.gross, calc.deductions,
    s.scheduled_days, s.unevaluated_days, per.period_from, per.period_to, per.covered_days, per.days_in_month, calc.day_rate, calc.ratio, calc.capped,
    case when not v_auto_on then 'disabled' else v_mode end, calc.days_capped,
    sp.pay_type, sp.base_salary, sp.daily_rate, calc.allow, fd.total, calc.net, calc.net
  from public.employees e
  join app.hr_month_summary(m) s on s.employee_id = e.id
  join app.hr_month_period(m) per on per.employee_id = e.id
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  left join public.employee_salary_profiles sp on sp.employee_id = e.id and sp.status = 'defined'
  cross join lateral (select coalesce(sum((v.value)::numeric), 0) as total from jsonb_each_text(coalesce(sp.allowances, '{}'::jsonb)) v where v.value ~ '^\d+(\.\d+)?$') al
  cross join lateral (select coalesce(sum((v.value)::numeric), 0) as total from jsonb_each_text(coalesce(sp.fixed_deductions, '{}'::jsonb)) v where v.value ~ '^\d+(\.\d+)?$') fd
  cross join lateral (
    select y.*,
      case when sp.employee_id is null then null else greatest(0, round(y.gross - y.deductions, 2)) end as net
    from (
      select x.day_rate, x.ratio, x.payable_days, x.ops_days_amount, x.allow, x.auto_days_eff, x.days_capped,
        x.auto_raw > x.auto_cap as capped,
        least(x.auto_raw, x.auto_cap) as auto_amount,
        x.gross,
        case when sp.employee_id is null then null else round(fd.total + s.ded_amount + x.ops_days_amount + least(x.auto_raw, x.auto_cap), 2) end as deductions
      from (
        select r.*,
          case when sp.employee_id is null then null
               when sp.pay_type = 'daily' then round(sp.daily_rate * r.payable_days + r.allow, 2)
               else round(r.base_due + r.allow, 2) end as gross,
          case when sp.employee_id is null then 0
               when sp.pay_type = 'daily' then round(v_cap * (sp.daily_rate * r.payable_days + r.allow), 2)
               else round(v_cap * (r.base_due + r.allow), 2) end as auto_cap
        from (
          select rates.day_rate, rates.ratio, dd.auto_days_eff, dd.days_capped,
            case when sp.pay_type = 'daily' then (s.days_present + s.days_leave_paid)::numeric else null end as payable_days,
            case when sp.pay_type = 'daily' then 0
                 when per.full_month or not v_prorate then sp.base_salary
                 else least(sp.base_salary, round(rates.day_rate * per.covered_days, 2)) end as base_due,
            case when sp.pay_type = 'monthly' and v_prorate and v_prorate_allow and not per.full_month then round(al.total * rates.ratio, 2) else al.total end as allow,
            -- مبلغ الاستقطاع التلقائي: متوقف ⇒ 0 · salary ⇒ أجر الدقيقة/اليوم من الراتب · fixed ⇒ مبالغ ثابتة من السياسة
            case when not v_auto_on then 0
                 when v_mode = 'fixed' then round(v_fix_min * s.auto_minutes + v_fix_day * dd.auto_days_eff, 2)
                 else round(rates.minute_rate * s.auto_minutes + rates.day_rate * dd.auto_days_eff, 2) end as auto_raw,
            round(rates.day_rate * s.ded_days, 2) as ops_days_amount
          from (
            select dr.day_rate,
              case when sp.employee_id is null then 0 when sp.pay_type = 'daily' then round(sp.daily_rate / greatest(s.shift_minutes, 1), 4) else round(dr.day_rate / greatest(s.shift_minutes, 1), 4) end as minute_rate,
              case when per.full_month or not v_prorate or sp.pay_type = 'daily' or sp.employee_id is null or sp.base_salary = 0 then 1
                   else least(1, round(least(sp.base_salary, dr.day_rate * per.covered_days) / sp.base_salary, 6)) end as ratio
            from (select case when sp.employee_id is null then 0
                              when sp.pay_type = 'daily' then sp.daily_rate
                              when v_basis = 'calendar_days' then round(sp.base_salary / per.days_in_month, 4)
                              else round(sp.base_salary / 30, 4) end as day_rate) dr
          ) rates,
          lateral (
            -- أيام الاستقطاع المؤثرة: اليومي لا يُخصم غيابه (غير مدفوع أصلاً)؛ سقف أيام شهري اختياري
            select case when v_max_days > 0 then least(base_days, v_max_days) else base_days end as auto_days_eff,
                   v_max_days > 0 and base_days > v_max_days as days_capped
            from (select case when sp.pay_type = 'daily' then s.auto_days_shortfall else s.auto_days end as base_days) bd
          ) dd) r) x) y) calc;
  get diagnostics n = row_count;
  update public.hr_month_exports set rows_count = n where id = v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver, 'days_evaluated', n_eval, 'salary_day_basis', v_basis, 'prorate', v_prorate, 'auto_deduction', case when v_auto_on then v_mode else 'disabled' end), 'تصدير الشهر إلى المالية', auth.uid()
  from public.hr_month_export_rows e where e.export_id = v_id;
  perform app.advance_apply_to_export(v_id, m);
  return v_id;
end$$;
