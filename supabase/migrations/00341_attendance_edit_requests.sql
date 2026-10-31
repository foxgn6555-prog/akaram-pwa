-- ═══════════════════════════════════════════════════════════════
-- 00341 · الجولة 00397-أ — «طلب تعديل بيانات الحضور» (غرفة العمليات ← الحضوريات) + سجل تعديل الحضور
--   المشكلة: تصحيح أيام الحضور كان يوماً بيوم لموظف واحد (ops_attendance_edit) — لا نطاق، لا طلب إلى الموارد البشرية،
--            لا سجل مجمّع للمعاون/المدير المفوض، ولا تراجع. (مثال: أيام تجربة البصمة 1 و5 بقيت نقصاً على موظفي قسم كامل.)
--   التصميم:
--   ① جدولان: attendance_edit_requests (الطلب: النطاق × الأيام × نوع التعديل × السبب × الوضع) و attendance_edit_items (موظف × يوم: قبل/مقترح/بعد).
--   ② النطاق: موظف/مجموعة موظفين، فرع، قسم (مع أو بدون أقسامه الفرعية). الأيام: قائمة تواريخ (لا مستقبل، لا شهر مقفل مالياً، لا شهر معتمد حضورياً).
--   ③ نوع التعديل: full_presence (حضور كامل بأوقات الشفت — صفر تأخير/نقص)، set_status (حالة اليوم مع أوقات اختيارية)، set_times (أوقات جديدة والحالة تُشتق بقواعد المحرك).
--   ④ وضعان: direct (غرفة العمليات/المعاون ينفّذ فوراً) أو hr_request (يمر بسلسلة «تعديل حضور» إن ضُبطت — وإلا يصل HR مباشرة؛
--      بعد الموافقة تستطيع HR تعديل القيم المقترحة يوماً بيوم ثم «اعتماد» فتُطبَّق). التنفيذ كله عبر محرك ops_attendance_edit نفسه (app.attendance_edit_apply_day).
--   ⑤ التراجع (المعاون/المدير المفوض): يعيد كل يوم إلى ما كان عليه (أو إلى الاحتساب التلقائي إن لم يكن له صف) — موثّق.
--   ⑥ التبليغ: تبليغ واحد مجمّع لكل من IT والمعاون (بدل تبليغ لكل صف) + التدقيق الصفّي يبقى كما هو.
--   ⑦ القوائم: attendance_edit_list (فلاتر: الوضع/الحالة/التاريخ/القسم/الموظف/المنفّذ) · attendance_edit_detail · attendance_edit_stats (مؤشرات المدير المفوض).
-- ═══════════════════════════════════════════════════════════════

-- ── ① الجداول ──
create table if not exists public.attendance_edit_requests (
  id              uuid primary key default gen_random_uuid(),
  mode            text not null check (mode in ('direct', 'hr_request')),
  status          text not null check (status in ('pending_approval', 'approved', 'applied', 'rejected', 'cancelled', 'reverted')),
  scope_kind      text not null check (scope_kind in ('employees', 'branch', 'department', 'department_tree')),
  scope_ids       uuid[] not null,
  scope_label     text not null,
  dates           date[] not null,
  action          text not null check (action in ('full_presence', 'set_status', 'set_times')),
  payload         jsonb not null default '{}'::jsonb,
  reason          text not null,
  requested_by    uuid not null references auth.users (id) on delete restrict,
  requester_role  text not null,
  chain_id        uuid references public.approval_chains (id) on delete set null,
  approved_at     timestamptz,
  rejected_note   text,
  hr_note         text,
  applied_by      uuid references auth.users (id) on delete set null,
  applied_at      timestamptz,
  reverted_by     uuid references auth.users (id) on delete set null,
  reverted_at     timestamptz,
  revert_reason   text,
  employees_count int not null default 0,
  days_count      int not null default 0,
  items_count     int not null default 0,
  minutes_fixed   int not null default 0,   -- مجموع (تأخير+نقص) الذي أُزيل بالتعديل (موجب = تصحيح لصالح الموظف)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists attendance_edit_requests_created_idx on public.attendance_edit_requests (created_at desc);
create index if not exists attendance_edit_requests_status_idx on public.attendance_edit_requests (status);
alter table public.attendance_edit_requests enable row level security;   -- لا وصول مباشر — عبر الدوال فقط

create table if not exists public.attendance_edit_items (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.attendance_edit_requests (id) on delete cascade,
  employee_id    uuid not null references public.employees (id) on delete cascade,
  work_date      date not null,
  before         jsonb,              -- صف الحضور قبل التعديل (null = لم يكن له صف)
  proposed       jsonb not null,     -- {status, check_in, check_out}
  after          jsonb,              -- الصف بعد التطبيق
  applied        boolean not null default false,
  skipped_reason text,               -- يوم راحة / شهر مقفل / بلا شفت …
  hr_edited_by   uuid,
  hr_edited_at   timestamptz,
  unique (request_id, employee_id, work_date)
);
create index if not exists attendance_edit_items_emp_idx on public.attendance_edit_items (employee_id, work_date);
alter table public.attendance_edit_items enable row level security;

-- ── ② محرك الموافقات: نوع «تعديل حضور» ──
alter table public.approval_chains drop constraint if exists approval_chains_request_type_check;
alter table public.approval_chains add constraint approval_chains_request_type_check check (request_type in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report','hire','attendance_edit'));
alter table public.approval_tasks drop constraint if exists approval_tasks_request_kind_check;
alter table public.approval_tasks add constraint approval_tasks_request_kind_check check (request_kind in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report','hire','attendance_edit'));
create or replace function app.approval_kind_label(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'leave' then 'إجازة' when 'time_permit' then 'زمنية' when 'advance' then 'سلفة' when 'termination' then 'إنهاء خدمة'
                     when 'supplies' then 'مستلزمات' when 'disclosure' then 'كشف' when 'cold_archive_purge' then 'حذف أرشيف بارد' when 'complaint_report' then 'تقرير شكاوى'
                     when 'hire' then 'تعيين موظف' when 'attendance_edit' then 'تعديل حضور' else coalesce(p_kind, '—') end
$$;

create or replace function app.attendance_action_label(p text) returns text language sql immutable as $$
  select case p when 'full_presence' then 'حضور كامل بأوقات الشفت' when 'set_status' then 'تغيير حالة اليوم' when 'set_times' then 'تعديل أوقات الدخول/الخروج' else coalesce(p, '—') end $$;
create or replace function app.attendance_scope_label(p_kind text, p_ids uuid[]) returns text language sql stable security definer set search_path = public, app as $$
  select case p_kind
    when 'employees' then case when cardinality(p_ids) = 1 then (select e.full_name from public.employees e where e.id = p_ids[1]) else cardinality(p_ids)::text || ' موظفين' end
    when 'branch' then 'فرع ' || coalesce((select b.name from public.branches b where b.id = p_ids[1]), '—')
    when 'department' then 'قسم ' || coalesce((select d.name from public.departments d where d.id = p_ids[1]), '—')
    when 'department_tree' then 'قسم ' || coalesce((select d.name from public.departments d where d.id = p_ids[1]), '—') || ' وأقسامه الفرعية'
    else '—' end $$;
create or replace function app.attendance_status_label(p text) returns text language sql immutable as $$
  select case p when 'present' then 'حاضر' when 'late' then 'متأخر' when 'early_leave' then 'خروج مبكر' when 'absent' then 'غائب' when 'incomplete' then 'ناقصة'
                when 'leave' then 'إجازة' when 'time_permit' then 'زمنية' else coalesce(p, '—') end $$;

-- ── ③ حلّ النطاق إلى موظفين فعليين (غير مؤرشفين وغير منتهي الخدمة) ──
create or replace function app.attendance_edit_scope_employees(p_kind text, p_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = public, app as $$
  select e.id from public.employees e
  where e.archived_at is null and coalesce(e.employment_status, '') <> 'terminated'
    and case p_kind
          when 'employees' then e.id = any(p_ids)
          when 'branch' then e.branch_id = p_ids[1]
          when 'department' then e.department_id = p_ids[1]
          when 'department_tree' then e.department_id in (select app.hr_department_tree(p_ids[1]))
          else false end
  order by e.full_name
$$;

-- ── ④ القيم المقترحة ليوم واحد حسب نوع التعديل ──
create or replace function app.attendance_edit_proposed(p_employee uuid, p_date date, p_action text, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare r public.hr_attendance_days; sh record; tz interval := app.hr_tz(); v_in timestamptz; v_out timestamptz; v_rest boolean := false; v_status text; v_dow int;
        t_in time; t_out time;
begin
  select * into r from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  select * into sh from app.hr_effective_shift(p_employee, p_date);
  if r.expected_in is not null then v_in := r.expected_in; v_out := r.expected_out; v_rest := coalesce(r.is_rest_day, false);
  elsif sh.shift_id is not null then
    v_dow := extract(dow from p_date)::int; v_rest := not (v_dow::smallint = any (sh.work_days));
    v_in := (p_date + sh.start_time)::timestamp - tz; v_out := (p_date + sh.end_time)::timestamp - tz;
    if v_out <= v_in then v_out := v_out + interval '1 day'; end if;
  end if;
  if p_action = 'full_presence' then
    if v_in is null then return jsonb_build_object('skipped', 'لا شفت ساري لهذا الموظف في هذا اليوم'); end if;
    if v_rest then return jsonb_build_object('skipped', 'يوم راحة بالشفت'); end if;
    return jsonb_build_object('status', 'present', 'check_in', v_in, 'check_out', v_out);
  elsif p_action = 'set_status' then
    v_status := p_payload ->> 'status';
    t_in := nullif(p_payload ->> 'check_in', '')::time; t_out := nullif(p_payload ->> 'check_out', '')::time;
    return jsonb_build_object('status', v_status,
      'check_in', case when t_in is not null then (p_date + t_in)::timestamp - tz when v_status in ('absent', 'leave') then null else r.check_in end,
      'check_out', case when t_out is not null then (p_date + t_out)::timestamp - tz when v_status in ('absent', 'leave') then null else r.check_out end);
  else   -- set_times: الأوقات من الطلب (أو الحالية) والحالة تُشتق لاحقاً بقواعد المحرك
    t_in := nullif(p_payload ->> 'check_in', '')::time; t_out := nullif(p_payload ->> 'check_out', '')::time;
    return jsonb_build_object('status', 'auto',
      'check_in', case when t_in is not null then (p_date + t_in)::timestamp - tz else r.check_in end,
      'check_out', case when t_out is not null then (p_date + t_out)::timestamp - tz else r.check_out end);
  end if;
end$$;

-- ── ⑤ تطبيق يوم واحد — جوهر ops_attendance_edit بلا فحص الدور (تستدعيه غرفة العمليات/HR/المعاون عبر الطلب) ──
create or replace function app.attendance_edit_apply_day(p_employee uuid, p_date date, p_check_in timestamptz, p_check_out timestamptz, p_status text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare b jsonb; v_late int := 0; v_early int := 0; v_worked int := 0; r record; sh record; tz interval := app.hr_tz();
        v_exp_in timestamptz; v_exp_out timestamptz; v_shift_name text; v_rest boolean := false; v_grace int := 0; v_dow int; v_status text := p_status; a jsonb;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  if app.hr_month_locked(p_date) then raise exception 'HR_MONTH_LOCKED'; end if;
  if app.hr_month_confirmed(p_date) then raise exception 'HR_ATTENDANCE_CONFIRMED'; end if;
  if p_check_in is not null and p_check_out is not null and p_check_out <= p_check_in then raise exception 'HR_TIMES_INVALID'; end if;
  if p_date > app.hr_local_date(now()) then raise exception 'HR_FUTURE_DATE'; end if;
  if not exists (select 1 from public.employees where id = p_employee) then raise exception 'HR_NOT_FOUND'; end if;

  select to_jsonb(d) into b from public.hr_attendance_days d where d.employee_id = p_employee and d.work_date = p_date;
  select * into r from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  select * into sh from app.hr_effective_shift(p_employee, p_date);
  v_grace := coalesce(sh.grace_minutes, 0);
  if r.expected_in is not null then
    v_exp_in := r.expected_in; v_exp_out := r.expected_out; v_shift_name := r.shift_name; v_rest := coalesce(r.is_rest_day, false);
  elsif sh.shift_id is not null then
    v_dow := extract(dow from p_date)::int; v_rest := not (v_dow::smallint = any (sh.work_days));
    v_exp_in := (p_date + sh.start_time)::timestamp - tz; v_exp_out := (p_date + sh.end_time)::timestamp - tz;
    if v_exp_out <= v_exp_in then v_exp_out := v_exp_out + interval '1 day'; end if;
    v_shift_name := sh.shift_name;
  end if;
  if v_exp_in is not null and p_check_in is not null and p_check_in > v_exp_in and not v_rest then
    v_late := floor(extract(epoch from (p_check_in - v_exp_in)) / 60)::int
              - app.hr_permit_cover_minutes(p_employee, p_date, v_exp_in, p_check_in, coalesce(sh.start_time, (v_exp_in + tz)::time), coalesce(sh.end_time, (v_exp_out + tz)::time));
    v_late := greatest(0, v_late - v_grace);
  end if;
  if v_exp_out is not null and p_check_out is not null and p_check_out < v_exp_out and not v_rest then
    v_early := floor(extract(epoch from (v_exp_out - p_check_out)) / 60)::int
               - app.hr_permit_cover_minutes(p_employee, p_date, p_check_out, v_exp_out, coalesce(sh.start_time, (v_exp_in + tz)::time), coalesce(sh.end_time, (v_exp_out + tz)::time));
    v_early := greatest(0, v_early);
  end if;
  if p_check_in is not null and p_check_out is not null then v_worked := floor(extract(epoch from (p_check_out - p_check_in)) / 60)::int; end if;
  -- 'auto' (تعديل أوقات): الحالة من قواعد المحرك نفسها
  if v_status = 'auto' then v_status := app.hr_status_of(p_check_in, p_check_out, v_late, v_early, v_rest); end if;
  if v_status not in ('present', 'late', 'early_leave', 'absent', 'incomplete', 'leave', 'time_permit') then raise exception 'HR_STATUS_INVALID'; end if;
  if v_status in ('present', 'leave', 'time_permit', 'absent') then v_late := 0; v_early := 0; end if;
  if v_status = 'late' then v_early := 0; end if;
  if v_status = 'early_leave' then v_late := 0; end if;

  insert into public.hr_attendance_days as d (employee_id, work_date, shift_name, expected_in, expected_out, is_rest_day, check_in, check_out, late_minutes, early_minutes, worked_minutes, status, source, edited_by, edited_at, edit_reason)
  values (p_employee, p_date, v_shift_name, v_exp_in, v_exp_out, v_rest, p_check_in, p_check_out, v_late, v_early, v_worked, v_status, 'manual', auth.uid(), now(), trim(p_reason))
  on conflict (employee_id, work_date) do update set
    shift_name = coalesce(d.shift_name, excluded.shift_name), expected_in = coalesce(d.expected_in, excluded.expected_in), expected_out = coalesce(d.expected_out, excluded.expected_out),
    check_in = excluded.check_in, check_out = excluded.check_out, late_minutes = excluded.late_minutes, early_minutes = excluded.early_minutes,
    worked_minutes = excluded.worked_minutes, status = excluded.status, source = 'manual',
    edited_by = auth.uid(), edited_at = now(), edit_reason = excluded.edit_reason, updated_at = now();

  select to_jsonb(d) into a from public.hr_attendance_days d where d.employee_id = p_employee and d.work_date = p_date;
  insert into public.hr_attendance_audit (employee_id, work_date, action, before, after, reason, actor) values (p_employee, p_date, 'edit', b, a, trim(p_reason), auth.uid());
  perform app.hr_refresh_alerts(p_employee, p_date);
  return jsonb_build_object('before', b, 'after', a);
end$$;
revoke all on function app.attendance_edit_apply_day(uuid, date, timestamptz, timestamptz, text, text) from public, anon, authenticated;

-- ops_attendance_edit (موظف واحد — كما هو) يصبح غلافاً للجوهر نفسه حتى لا يوجد محركان
create or replace function public.ops_attendance_edit(p_employee uuid, p_date date, p_check_in timestamptz, p_check_out timestamptz, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_status not in ('present', 'late', 'early_leave', 'absent', 'incomplete', 'leave', 'time_permit') then raise exception 'HR_STATUS_INVALID'; end if;
  perform app.attendance_edit_apply_day(p_employee, p_date, p_check_in, p_check_out, p_status, p_reason);
end$$;

-- ⑥ تبليغ IT الصفّي يُكتم أثناء التطبيق الجماعي (يُستبدل بتبليغ مجمّع واحد)
create or replace function app.notify_it_attendance_audit() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_name text; v_num text; v_action text; v_actor text;
begin
  if current_setting('app.attendance_bulk', true) = 'on' then return new; end if;   -- 00397: التطبيق الجماعي يُبلَّغ مجمّعاً
  if new.action not in ('edit', 'reset_auto', 'deduction_add', 'deduction_delete', 'waive', 'unwaive') then return new; end if;
  select e.full_name, e.employee_number into v_name, v_num from public.employees e where e.id = new.employee_id;
  v_actor := app.manager_display_name(new.actor);
  v_action := case new.action when 'edit' then 'تعديل يوم حضور' when 'reset_auto' then 'إعادة احتساب يوم'
                               when 'deduction_add' then 'إضافة استقطاع يدوي' when 'deduction_delete' then 'حذف استقطاع يدوي'
                               when 'waive' then 'إلغاء استقطاع مقترح' else 'إعادة استقطاع مقترح' end;
  insert into public.notifications (user_id, title, body, type, category, priority, link, entity_type, entity_id, action_label, dedupe_key)
  select distinct ur.user_id,
         left('تعديل حضور من غرفة العمليات — ' || coalesce(v_name, '—'), 160),
         left(format('%s · %s (%s) · يوم %s · السبب: %s · بواسطة %s', v_action, coalesce(v_name, '—'), coalesce(v_num, '—'), to_char(new.work_date, 'YYYY-MM-DD'), new.reason, coalesce(v_actor, '—')), 1000),
         'warning', 'hr', 'normal',
         case when ur.role = 'deputy_director' then '/deputy/deductions' else '/it/integrations/biometric/attendance-audit' end,
         'hr_attendance_audit', new.id, 'فتح سجل التعديلات', 'hr_audit:' || new.id::text
  from public.user_roles ur where ur.role in ('it_admin', 'deputy_director', 'super_admin') and ur.user_id is distinct from new.actor
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return new;
end$$;

-- ── ⑦ التحقق من الأيام ──
create or replace function app.attendance_edit_validate_dates(p_dates date[]) returns void language plpgsql stable security definer set search_path = public, app as $$
declare d date; today date := app.hr_local_date(now());
begin
  if p_dates is null or cardinality(p_dates) = 0 then raise exception 'ATT_EDIT_DATES_REQUIRED'; end if;
  if cardinality(p_dates) > 62 then raise exception 'ATT_EDIT_TOO_MANY_DAYS'; end if;
  foreach d in array p_dates loop
    if d > today then raise exception 'HR_FUTURE_DATE'; end if;
    if app.hr_month_locked(d) then raise exception 'HR_MONTH_LOCKED'; end if;
    if app.hr_month_confirmed(d) then raise exception 'HR_ATTENDANCE_CONFIRMED'; end if;
  end loop;
end$$;

create or replace function app.attendance_edit_validate_payload(p_action text, p_payload jsonb) returns void language plpgsql immutable as $$
begin
  if p_action not in ('full_presence', 'set_status', 'set_times') then raise exception 'ATT_EDIT_ACTION_INVALID'; end if;
  if p_action = 'set_status' and coalesce(p_payload ->> 'status', '') not in ('present', 'late', 'early_leave', 'absent', 'incomplete', 'leave', 'time_permit') then raise exception 'HR_STATUS_INVALID'; end if;
  if p_action = 'set_times' and nullif(p_payload ->> 'check_in', '') is null and nullif(p_payload ->> 'check_out', '') is null then raise exception 'ATT_EDIT_TIMES_REQUIRED'; end if;
  if nullif(p_payload ->> 'check_in', '') is not null and nullif(p_payload ->> 'check_out', '') is not null
     and (p_payload ->> 'check_out')::time <= (p_payload ->> 'check_in')::time and p_action <> 'set_times' then raise exception 'HR_TIMES_INVALID'; end if;
end$$;

create or replace function app.attendance_edit_can_view() returns boolean language sql stable security definer set search_path = public, app as $$
  select app.has_role(array['ops_room', 'hr_officer', 'deputy_director', 'executive_director', 'it_admin', 'super_admin']) $$;

-- ── ⑧ المعاينة قبل الإرسال: عدد الموظفين/الأيام والقيم قبل/بعد لكل يوم ──
create or replace function public.attendance_edit_preview(p_scope_kind text, p_scope_ids uuid[], p_dates date[], p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare emps uuid[]; items jsonb; n_items int; n_skipped int; v_minutes int;
begin
  if not app.has_role(array['ops_room', 'deputy_director', 'hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  perform app.attendance_edit_validate_dates(p_dates);
  perform app.attendance_edit_validate_payload(p_action, p_payload);
  select coalesce(array_agg(x), '{}') into emps from app.attendance_edit_scope_employees(p_scope_kind, p_scope_ids) x;
  if cardinality(emps) = 0 then raise exception 'ATT_EDIT_SCOPE_EMPTY'; end if;
  if cardinality(emps) * cardinality(p_dates) > 5000 then raise exception 'ATT_EDIT_TOO_LARGE'; end if;
  with x as (
    select e.id as employee_id, e.full_name, e.employee_number, d.d as work_date,
           (select to_jsonb(a) from public.hr_attendance_days a where a.employee_id = e.id and a.work_date = d.d) as before,
           app.attendance_edit_proposed(e.id, d.d, p_action, p_payload) as proposed
    from unnest(emps) emp(id) join public.employees e on e.id = emp.id cross join unnest(p_dates) d(d)
  )
  select coalesce(jsonb_agg(jsonb_build_object('employee_id', employee_id, 'full_name', full_name, 'employee_number', employee_number, 'work_date', work_date,
           'before', case when before is null then null else jsonb_build_object('status', before ->> 'status', 'status_label', app.attendance_status_label(before ->> 'status'), 'check_in', before -> 'check_in', 'check_out', before -> 'check_out',
                       'late_minutes', before -> 'late_minutes', 'early_minutes', before -> 'early_minutes') end,
           'proposed', proposed - 'skipped', 'proposed_status_label', app.attendance_status_label(proposed ->> 'status'), 'skipped', proposed ->> 'skipped') order by full_name, work_date), '[]'::jsonb),
         count(*) filter (where proposed ? 'skipped'), count(*),
         coalesce(sum(coalesce((before ->> 'late_minutes')::int, 0) + coalesce((before ->> 'early_minutes')::int, 0)) filter (where not (proposed ? 'skipped') and p_action = 'full_presence'), 0)
  into items, n_skipped, n_items, v_minutes from x;
  return jsonb_build_object('employees', cardinality(emps), 'days', cardinality(p_dates), 'items', n_items, 'skipped', n_skipped, 'minutes_to_fix', v_minutes,
                            'scope_label', app.attendance_scope_label(p_scope_kind, p_scope_ids), 'action_label', app.attendance_action_label(p_action), 'rows', items);
end$$;
grant execute on function public.attendance_edit_preview(text, uuid[], date[], text, jsonb) to authenticated;

-- ── ⑨ التطبيق الجماعي (داخلي) ──
create or replace function app.attendance_edit_apply(p_id uuid) returns void language plpgsql security definer set search_path = public, app as $$
declare q public.attendance_edit_requests; it record; res jsonb; n_ok int := 0; v_min int := 0; v_reason text; u uuid; v_actor text := app.manager_display_name(auth.uid());
        v_title text; v_body text;
begin
  select * into q from public.attendance_edit_requests where id = p_id for update;
  perform app.attendance_edit_validate_dates(q.dates);
  v_reason := q.reason || ' [طلب تعديل حضور ' || left(q.id::text, 8) || ']';
  perform set_config('app.attendance_bulk', 'on', true);
  for it in select * from public.attendance_edit_items where request_id = p_id and skipped_reason is null order by employee_id, work_date loop
    res := app.attendance_edit_apply_day(it.employee_id, it.work_date, (it.proposed ->> 'check_in')::timestamptz, (it.proposed ->> 'check_out')::timestamptz, it.proposed ->> 'status', v_reason);
    update public.attendance_edit_items set before = nullif(res -> 'before', 'null'::jsonb), after = res -> 'after', applied = true where id = it.id;   -- «قبل» الفعلي لحظة التطبيق (للتراجع الدقيق)
    n_ok := n_ok + 1;
    v_min := v_min + (coalesce((res -> 'before' ->> 'late_minutes')::int, 0) + coalesce((res -> 'before' ->> 'early_minutes')::int, 0))
                   - (coalesce((res -> 'after' ->> 'late_minutes')::int, 0) + coalesce((res -> 'after' ->> 'early_minutes')::int, 0));
  end loop;
  perform set_config('app.attendance_bulk', 'off', true);
  update public.attendance_edit_requests set status = 'applied', applied_by = auth.uid(), applied_at = now(), items_count = n_ok, minutes_fixed = v_min, updated_at = now() where id = p_id;
  -- تبليغ مجمّع واحد: المعاون + التطوير المركزية (+ غرفة العمليات عندما تنفّذه HR)
  v_title := 'تعديل حضور جماعي' || case q.mode when 'hr_request' then ' (بطلب — اعتمدته الموارد البشرية)' else ' (مباشر)' end || ' — ' || q.scope_label;
  v_body := app.attendance_action_label(q.action) || ' · ' || q.employees_count || ' موظف × ' || q.days_count || ' يوم = ' || n_ok || ' يوم عمل' || case when v_min <> 0 then ' · صُحّح ' || v_min || ' دقيقة' else '' end
            || ' · السبب: ' || q.reason || ' · نفّذه ' || coalesce(v_actor, '—');
  for u in select distinct ur.user_id from public.user_roles ur where ur.role in ('deputy_director', 'it_admin') and ur.user_id is distinct from auth.uid() loop
    perform app.hr_notify(u, v_title, v_body, case when exists (select 1 from public.user_roles x where x.user_id = u and x.role = 'deputy_director') then '/deputy/attendance-edits' else '/it/integrations/biometric/attendance-audit' end,
                          'att_edit_applied:' || q.id::text || ':' || u::text, 'warning');
  end loop;
  if q.requested_by is distinct from auth.uid() then
    perform app.hr_notify(q.requested_by, 'نُفّذ طلب تعديل الحضور — ' || q.scope_label, v_body, '/ops-room/attendance', 'att_edit_done:' || q.id::text, 'info');
  end if;
end$$;
revoke all on function app.attendance_edit_apply(uuid) from public, anon, authenticated;

-- ── ⑩ الإنشاء: مباشر أو طلب إلى الموارد البشرية ──
create or replace function public.attendance_edit_create(p_scope_kind text, p_scope_ids uuid[], p_dates date[], p_action text, p_payload jsonb, p_reason text, p_mode text default 'direct')
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare emps uuid[]; v_id uuid; v_role text; v_chain uuid; n int; u uuid; q public.attendance_edit_requests;
begin
  v_role := case when app.has_role(array['ops_room']) then 'ops_room' when app.has_role(array['deputy_director']) then 'deputy_director' when app.has_role(array['super_admin']) then 'super_admin' end;
  if v_role is null then raise exception 'HR_FORBIDDEN'; end if;
  if p_mode not in ('direct', 'hr_request') then raise exception 'ATT_EDIT_MODE_INVALID'; end if;
  if p_mode = 'hr_request' and v_role = 'deputy_director' then raise exception 'ATT_EDIT_MODE_INVALID'; end if;   -- المعاون ينفّذ مباشرة فقط
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'HR_REASON_REQUIRED'; end if;
  perform app.attendance_edit_validate_dates(p_dates);
  perform app.attendance_edit_validate_payload(p_action, p_payload);
  select coalesce(array_agg(x), '{}') into emps from app.attendance_edit_scope_employees(p_scope_kind, p_scope_ids) x;
  if cardinality(emps) = 0 then raise exception 'ATT_EDIT_SCOPE_EMPTY'; end if;
  if cardinality(emps) * cardinality(p_dates) > 5000 then raise exception 'ATT_EDIT_TOO_LARGE'; end if;

  insert into public.attendance_edit_requests (mode, status, scope_kind, scope_ids, scope_label, dates, action, payload, reason, requested_by, requester_role, employees_count, days_count)
  values (p_mode, 'approved', p_scope_kind, p_scope_ids, app.attendance_scope_label(p_scope_kind, p_scope_ids), (select array_agg(distinct d order by d) from unnest(p_dates) d), p_action, coalesce(p_payload, '{}'::jsonb), trim(p_reason), auth.uid(), v_role,
          cardinality(emps), (select count(distinct d) from unnest(p_dates) d))
  returning id into v_id;
  insert into public.attendance_edit_items (request_id, employee_id, work_date, before, proposed, skipped_reason)
  select v_id, e, d, (select to_jsonb(a) from public.hr_attendance_days a where a.employee_id = e and a.work_date = d), pr - 'skipped', pr ->> 'skipped'
  from (select e, d, app.attendance_edit_proposed(e, d, p_action, p_payload) pr from unnest(emps) e cross join (select distinct x from unnest(p_dates) x) dd(d)) t;
  select count(*) into n from public.attendance_edit_items where request_id = v_id and skipped_reason is null;
  if n = 0 then delete from public.attendance_edit_requests where id = v_id; raise exception 'ATT_EDIT_NOTHING_TO_APPLY'; end if;
  update public.attendance_edit_requests set items_count = n where id = v_id;

  if p_mode = 'direct' then
    perform app.attendance_edit_apply(v_id);
  else
    v_chain := app.approval_open('attendance_edit', v_id, auth.uid());
    if v_chain is not null then
      update public.attendance_edit_requests set status = 'pending_approval', chain_id = v_chain where id = v_id;
    else
      -- بلا سلسلة مضبوطة: يصل الموارد البشرية مباشرة
      update public.attendance_edit_requests set approved_at = now() where id = v_id;
      perform app.attendance_edit_notify_hr(v_id);
    end if;
  end if;
  select * into q from public.attendance_edit_requests where id = v_id;
  return jsonb_build_object('id', v_id, 'status', q.status, 'mode', q.mode, 'employees', q.employees_count, 'days', q.days_count, 'items', q.items_count, 'minutes_fixed', q.minutes_fixed,
                            'via_chain', q.chain_id is not null, 'scope_label', q.scope_label);
end$$;
grant execute on function public.attendance_edit_create(text, uuid[], date[], text, jsonb, text, text) to authenticated;

create or replace function app.attendance_edit_notify_hr(p_id uuid) returns void language plpgsql security definer set search_path = public, app as $$
declare q public.attendance_edit_requests; u uuid;
begin
  select * into q from public.attendance_edit_requests where id = p_id;
  for u in select ur.user_id from public.user_roles ur where ur.role = 'hr_officer' loop
    perform app.hr_notify(u, 'طلب تعديل حضور بانتظار اعتمادكم — ' || q.scope_label,
      app.attendance_action_label(q.action) || ' · ' || q.employees_count || ' موظف × ' || q.days_count || ' يوم · السبب: ' || q.reason || ' · من ' || coalesce(app.manager_display_name(q.requested_by), 'غرفة العمليات')
        || case when q.chain_id is not null then ' · اكتملت الموافقات' else ' · بلا سلسلة موافقات — مباشر' end,
      '/hr/attendance-edits', 'att_edit_hr:' || q.id::text, 'info');
  end loop;
end$$;
revoke all on function app.attendance_edit_notify_hr(uuid) from public, anon, authenticated;

-- ── ⑪ القرار عبر السلسلة (يوجَّه من approval_decide_request) ──
create or replace function public.attendance_edit_decide(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare q public.attendance_edit_requests; fin boolean;
begin
  select * into q from public.attendance_edit_requests where id = p_id for update;
  if q.id is null then raise exception 'PROCEDURE_NOT_FOUND'; end if;
  if q.status <> 'pending_approval' then raise exception 'PROCEDURE_NOT_PENDING'; end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'HR_REASON_REQUIRED'; end if;
  fin := app.approval_decide('attendance_edit', p_id, p_approve, p_note);
  if not fin then return; end if;
  if p_approve then
    update public.attendance_edit_requests set status = 'approved', approved_at = now(), updated_at = now() where id = p_id;
    perform app.attendance_edit_notify_hr(p_id);
    perform app.hr_notify(q.requested_by, 'اعتُمد طلب تعديل الحضور — ' || q.scope_label, 'اكتملت الموافقات — الموارد البشرية تراجع القيم ثم تعتمد التنفيذ', '/ops-room/attendance', 'att_edit_appr:' || q.id::text, 'info');
  else
    update public.attendance_edit_requests set status = 'rejected', rejected_note = trim(p_note), updated_at = now() where id = p_id;
    perform app.hr_notify(q.requested_by, 'رُفض طلب تعديل الحضور — ' || q.scope_label, 'السبب: ' || trim(p_note), '/ops-room/attendance', 'att_edit_rej:' || q.id::text, 'warning');
  end if;
end$$;
grant execute on function public.attendance_edit_decide(uuid, boolean, text) to authenticated;

-- ── ⑫ الموارد البشرية: تعديل قيمة يوم مقترحة ثم الاعتماد ──
create or replace function public.attendance_edit_hr_update_item(p_item uuid, p_status text, p_check_in timestamptz, p_check_out timestamptz) returns void
language plpgsql security definer set search_path = public, app as $$
declare it public.attendance_edit_items; q public.attendance_edit_requests;
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select * into it from public.attendance_edit_items where id = p_item for update;
  if it.id is null then raise exception 'PROCEDURE_NOT_FOUND'; end if;
  select * into q from public.attendance_edit_requests where id = it.request_id;
  if q.mode <> 'hr_request' or q.status <> 'approved' then raise exception 'ATT_EDIT_NOT_EDITABLE'; end if;
  if p_status not in ('present', 'late', 'early_leave', 'absent', 'incomplete', 'leave', 'time_permit', 'auto') then raise exception 'HR_STATUS_INVALID'; end if;
  if p_check_in is not null and p_check_out is not null and p_check_out <= p_check_in then raise exception 'HR_TIMES_INVALID'; end if;
  update public.attendance_edit_items set proposed = jsonb_build_object('status', p_status, 'check_in', p_check_in, 'check_out', p_check_out), skipped_reason = null, hr_edited_by = auth.uid(), hr_edited_at = now() where id = p_item;
end$$;
grant execute on function public.attendance_edit_hr_update_item(uuid, text, timestamptz, timestamptz) to authenticated;

create or replace function public.attendance_edit_hr_skip_item(p_item uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, app as $$
declare it public.attendance_edit_items; q public.attendance_edit_requests;
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select * into it from public.attendance_edit_items where id = p_item for update;
  if it.id is null then raise exception 'PROCEDURE_NOT_FOUND'; end if;
  select * into q from public.attendance_edit_requests where id = it.request_id;
  if q.mode <> 'hr_request' or q.status <> 'approved' then raise exception 'ATT_EDIT_NOT_EDITABLE'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'HR_REASON_REQUIRED'; end if;
  update public.attendance_edit_items set skipped_reason = 'استبعدته الموارد البشرية: ' || trim(p_reason), hr_edited_by = auth.uid(), hr_edited_at = now() where id = p_item;
end$$;
grant execute on function public.attendance_edit_hr_skip_item(uuid, text) to authenticated;

create or replace function public.attendance_edit_hr_apply(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare q public.attendance_edit_requests;
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select * into q from public.attendance_edit_requests where id = p_id for update;
  if q.id is null then raise exception 'PROCEDURE_NOT_FOUND'; end if;
  if q.mode <> 'hr_request' or q.status <> 'approved' then raise exception 'ATT_EDIT_NOT_EDITABLE'; end if;
  if not exists (select 1 from public.attendance_edit_items where request_id = p_id and skipped_reason is null) then raise exception 'ATT_EDIT_NOTHING_TO_APPLY'; end if;
  update public.attendance_edit_requests set hr_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
  perform app.attendance_edit_apply(p_id);
  select * into q from public.attendance_edit_requests where id = p_id;
  return jsonb_build_object('id', q.id, 'status', q.status, 'items', q.items_count, 'minutes_fixed', q.minutes_fixed);
end$$;
grant execute on function public.attendance_edit_hr_apply(uuid, text) to authenticated;

-- ── ⑬ إلغاء من الطالب (قبل التنفيذ) ──
create or replace function public.attendance_edit_cancel(p_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare q public.attendance_edit_requests;
begin
  select * into q from public.attendance_edit_requests where id = p_id for update;
  if q.id is null then raise exception 'PROCEDURE_NOT_FOUND'; end if;
  if q.requested_by <> auth.uid() and not app.has_role(array['super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if q.status not in ('pending_approval', 'approved') then raise exception 'PROCEDURE_NOT_PENDING'; end if;
  update public.approval_tasks set status = 'skipped', note = 'أُلغي الطلب من مقدّمه' where request_kind = 'attendance_edit' and request_id = p_id and status in ('waiting', 'pending');
  update public.attendance_edit_requests set status = 'cancelled', rejected_note = nullif(trim(coalesce(p_reason, '')), ''), updated_at = now() where id = p_id;
end$$;
grant execute on function public.attendance_edit_cancel(uuid, text) to authenticated;

-- ── ⑭ التراجع (المعاون / المدير المفوض): كل يوم يعود إلى ما كان عليه ──
create or replace function public.attendance_edit_revert(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare q public.attendance_edit_requests; it record; b jsonb; n int := 0; u uuid; v_reason text;
begin
  if not app.has_role(array['deputy_director', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'HR_REASON_REQUIRED'; end if;
  select * into q from public.attendance_edit_requests where id = p_id for update;
  if q.id is null then raise exception 'PROCEDURE_NOT_FOUND'; end if;
  if q.status <> 'applied' then raise exception 'ATT_EDIT_NOT_APPLIED'; end if;
  perform app.attendance_edit_validate_dates(q.dates);
  v_reason := 'تراجع عن طلب تعديل حضور ' || left(q.id::text, 8) || ': ' || trim(p_reason);
  perform set_config('app.attendance_bulk', 'on', true);
  for it in select * from public.attendance_edit_items where request_id = p_id and applied order by employee_id, work_date loop
    b := it.before;
    if b is null or jsonb_typeof(b) = 'null' then
      -- لم يكن له صف: نحذف الصف اليدوي ونعيد الاحتساب التلقائي من البصمات
      delete from public.hr_attendance_days where employee_id = it.employee_id and work_date = it.work_date;
      perform app.hr_evaluate_day(it.employee_id, it.work_date);
    else
      update public.hr_attendance_days set
        check_in = (b ->> 'check_in')::timestamptz, check_out = (b ->> 'check_out')::timestamptz,
        late_minutes = coalesce((b ->> 'late_minutes')::int, 0), early_minutes = coalesce((b ->> 'early_minutes')::int, 0), worked_minutes = coalesce((b ->> 'worked_minutes')::int, 0),
        status = b ->> 'status', source = 'manual', edited_by = auth.uid(), edited_at = now(), edit_reason = v_reason, updated_at = now()
      where employee_id = it.employee_id and work_date = it.work_date;
    end if;
    insert into public.hr_attendance_audit (employee_id, work_date, action, before, after, reason, actor)
    select it.employee_id, it.work_date, 'edit', it.after, (select to_jsonb(d) from public.hr_attendance_days d where d.employee_id = it.employee_id and d.work_date = it.work_date), v_reason, auth.uid();
    perform app.hr_refresh_alerts(it.employee_id, it.work_date);
    update public.attendance_edit_items set applied = false where id = it.id;
    n := n + 1;
  end loop;
  perform set_config('app.attendance_bulk', 'off', true);
  update public.attendance_edit_requests set status = 'reverted', reverted_by = auth.uid(), reverted_at = now(), revert_reason = trim(p_reason), updated_at = now() where id = p_id;
  for u in select distinct ur.user_id from public.user_roles ur where ur.role in ('it_admin') and ur.user_id is distinct from auth.uid() loop
    perform app.hr_notify(u, 'تراجع عن تعديل حضور جماعي — ' || q.scope_label, n || ' يوم عمل أُعيد إلى ما كان عليه · السبب: ' || trim(p_reason) || ' · بواسطة ' || coalesce(app.manager_display_name(auth.uid()), '—'),
                          '/it/integrations/biometric/attendance-audit', 'att_edit_revert:' || q.id::text, 'warning');
  end loop;
  perform app.hr_notify(q.requested_by, 'تراجع المعاون عن طلب تعديل الحضور — ' || q.scope_label, 'السبب: ' || trim(p_reason), '/ops-room/attendance', 'att_edit_revert_req:' || q.id::text, 'warning');
  return jsonb_build_object('id', q.id, 'reverted_items', n);
end$$;
grant execute on function public.attendance_edit_revert(uuid, text) to authenticated;


-- ── ⑮ تكامل محرك الموافقات (التوجيه، إشعار الخطوة، مهامي، المسار الزمني) ──
create or replace function app.approval_decide_request__raw(p_kind text, p_request uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if p_kind = 'supplies' then perform public.supply_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'termination' then perform public.termination_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'disclosure' then perform public.disclosure_decide(p_request, p_approve, p_note, null);
  elsif p_kind = 'advance' then perform public.advance_decide(p_request, p_approve, p_note, null, null);
  elsif p_kind = 'cold_archive_purge' then perform public.cold_archive_purge_decide(p_request, p_approve, p_note);
  elsif p_kind = 'complaint_report' then perform public.complaint_report_decide(p_request, p_approve, p_note);
  elsif p_kind = 'hire' then perform public.hire_request_decide(p_request, p_approve, p_note);
  elsif p_kind = 'attendance_edit' then perform public.attendance_edit_decide(p_request, p_approve, p_note);   -- 00397
  elsif p_kind in ('leave','time_permit') then perform public.hr_leave_decide(p_request, p_approve, p_note);
  else raise exception 'APPROVAL_TYPE_INVALID'; end if;
end$$;

create or replace function app.approval_notify_step(p_kind text, p_request uuid, p_step int) returns void language plpgsql security definer set search_path = public, app as $$
declare t record; l record; u uuid; title text; body text; link text;
begin
  select * into t from public.approval_tasks where request_kind = p_kind and request_id = p_request and step_no = p_step;
  if t.id is null then return; end if;
  if p_kind = 'attendance_edit' then   -- 00397
    select q.* into l from public.attendance_edit_requests q where q.id = p_request;
    title := 'طلب تعديل حضور بانتظار موافقتك (خطوة ' || p_step || ') — ' || l.scope_label;
    body := app.attendance_action_label(l.action) || ' · ' || l.employees_count || ' موظف × ' || l.days_count || ' يوم · ' || array_to_string((select array_agg(to_char(d, 'YYYY-MM-DD')) from unnest(l.dates) d), '، ')
            || ' · السبب: ' || l.reason || ' · طلبه ' || coalesce(app.manager_display_name(l.requested_by), 'غرفة العمليات');
  elsif p_kind = 'hire' then
    select q.*, d.name as title_name, p.name as dept_name into l from public.hire_requests q join public.departments d on d.id = q.job_title_id left join public.departments p on p.id = q.department_id where q.id = p_request;
    title := 'طلب تعيين موظف بانتظار موافقتك (خطوة ' || p_step || ') — ' || l.full_name;
    body := app.hire_source_label(l.source) || ' · ' || l.title_name || coalesce(' · ' || l.dept_name, '') || ' · مباشرة ' || l.hire_date::text || ' · ' || case l.contract_type when 'daily' then 'يومي' else 'شهري' end || ' · طلبه ' || coalesce(app.user_display_name(l.requester_user_id), '');
  elsif p_kind = 'complaint_report' then
    select r.* into l from public.complaint_reports r where r.id = p_request;
    title := 'تقرير شكاوى بانتظار اعتمادك (خطوة ' || p_step || ') — ' || l.title;
    body := case l.sector when 'karrada' then 'الكرادة' else 'الزعفرانية' end || ' · ' || l.report_date::text || ' · ' || (select count(*) from public.complaint_report_items i where i.report_id = l.id and i.included) || ' موقعاً · أعدّه ' || coalesce(app.user_display_name(l.approval_requested_by), '');
  elsif p_kind = 'cold_archive_purge' then
    select p.* into l from public.cold_archive_packages p where p.id = p_request;
    title := 'طلب حذف أرشيف بارد بانتظار قرارك (خطوة ' || p_step || ') — ' || l.code;
    body := 'الفترة ' || l.period_from::text || ' → ' || l.period_to::text || ' · ' || l.file_count || ' ملف · نسخ متحقَّقة ' || l.verified_copies || '/' || l.required_copies || ' · طلبه ' || coalesce(app.user_display_name(l.purge_requested_by), '');
  elsif p_kind = 'advance' then
    select a.* into l from public.advances a where a.id = p_request;
    title := 'طلب سلفة بانتظار قرارك (خطوة ' || p_step || ') — ' || l.type_name;
    body := l.employee_name || ' · ' || to_char(l.amount, 'FM999,999,999') || ' د.ع · ' || app.advance_method_label(l.repayment_method) || ' · ' || l.ref_no;
  elsif p_kind = 'disclosure' then
    select d.*, ty.label as type_label into l from public.disclosures d join public.disclosure_types ty on ty.key = d.violation_type where d.id = p_request;
    title := 'كشف بانتظار قرارك (خطوة ' || p_step || ') — ' || l.type_label;
    body := app.disclosure_target_label((select x from public.disclosures x where x.id = p_request)) || ' · ' || l.log_date::text || case when l.amount is not null then ' · ' || to_char(l.amount, 'FM999,999,999') || ' د.ع' else '' end || ' · أعدّه ' || coalesce(l.prepared_by_name, '');
  elsif p_kind = 'supplies' then
    select r.* into l from public.sector_supply_requests r where r.id = p_request;
    title := 'طلب مستلزمات بانتظار موافقتك (خطوة ' || p_step || ')';
    body := l.manager_name || ' · ' || coalesce(l.ref_no, '') || ' · ' || coalesce(app.supply_summary(l.items), l.supply_type);
  elsif p_kind = 'termination' then
    select r.* into l from public.termination_requests r where r.id = p_request;
    title := 'طلب إنهاء خدمة بانتظار موافقتك (خطوة ' || p_step || ')';
    body := l.target_name || ' (' || l.target_label || ') · ' || app.termination_type_label(l.termination_type) || ' · آخر يوم ' || l.last_day::text || ' · طلبه ' || app.manager_display_name(l.requester_user_id);
  else
    select l1.*, e.full_name, lt.name as type_name into l from public.hr_leaves l1 join public.employees e on e.id = l1.employee_id left join public.hr_leave_types lt on lt.id = l1.leave_type_id where l1.id = p_request;
    title := 'طلب ' || coalesce(l.type_name, 'إجازة') || ' بانتظار موافقتك (خطوة ' || p_step || ')';
    body := l.full_name || ' · ' || l.start_date::text || case when l.end_date <> l.start_date then ' → ' || l.end_date::text else '' end
            || case when l.kind = 'time_permit' then ' · ' || to_char(l.start_time, 'HH24:MI') || '–' || to_char(l.end_time, 'HH24:MI') else '' end;
  end if;
  foreach u in array t.approvers loop
    link := case when p_kind = 'disclosure' then (case when exists (select 1 from public.user_roles where user_id = u and role = 'deputy_director') then '/deputy/statements' when exists (select 1 from public.user_roles where user_id = u and role = 'super_admin') then '/admin/disclosures' else app.approval_link_for(u) end) else app.approval_link_for(u) end;
    perform app.hr_notify(u, title, body, link, 'approval:' || t.id::text, 'info');
  end loop;
end$$;

drop function if exists public.approval_my_tasks();
create or replace function public.approval_my_tasks()
returns table(task_id uuid, request_kind text, request_id uuid, step_no int, total_steps int, step_label text, requester_user_id uuid, requester_name text, requester_role text, requester_role_label text,
              area_name text, parent_sector text, type_name text, start_date date, end_date date, start_time time, end_time time, days numeric, minutes int, notes text, attachment_path text, created_at timestamptz, previous_steps jsonb, items jsonb, ref_no text, details jsonb)
language plpgsql stable security definer set search_path = public, app as $$
begin
  return query
  with base as (
    select t.*, e.user_id as req_user, e.full_name as req_name, lt.name as type_name, l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.notes, l.attachment_path, l.created_at as req_created, null::jsonb as items, null::text as ref_no,
      case when l.is_backdated then jsonb_build_object('backdated', true, 'reason', l.backdated_reason, 'days_late', l.backdated_days, 'prior_status', l.backdated_prior_status,
        'month_count', (select count(*) from public.hr_leaves x where x.employee_id = l.employee_id and x.is_backdated and x.status in ('pending', 'approved') and date_trunc('month', x.created_at at time zone 'UTC') = date_trunc('month', l.created_at at time zone 'UTC')),
        'alert_threshold', app.hr_policy_int('backdated_alert_per_month', 3)) end as details, null::text as fixed_role
    from public.approval_tasks t join public.hr_leaves l on l.id = t.request_id and t.request_kind in ('leave','time_permit') join public.employees e on e.id = l.employee_id left join public.hr_leave_types lt on lt.id = l.leave_type_id
    where t.status = 'pending' and auth.uid() = any(t.approvers) and l.status = 'pending'
    union all
    select t.*, r.manager_id, r.manager_name, 'مستلزمات القواطع', null, null, null, null, null, null, r.notes, null, r.created_at, r.items, r.ref_no, null, null
    from public.approval_tasks t join public.sector_supply_requests r on r.id = t.request_id and t.request_kind = 'supplies'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and r.approval_status = 'pending'
    union all
    select t.*, q.requester_user_id, app.manager_display_name(q.requester_user_id), 'إنهاء خدمة', q.last_day, q.last_day, null, null, null, null, q.reason, q.attachment_path, q.created_at, null, null,
      jsonb_build_object('target_name', q.target_name, 'target_label', q.target_label, 'target_kind', q.target_kind, 'type', q.termination_type, 'type_label', app.termination_type_label(q.termination_type), 'last_day', q.last_day), q.requester_role
    from public.approval_tasks t join public.termination_requests q on q.id = t.request_id and t.request_kind = 'termination'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and q.status = 'pending'
    union all
    -- 00348: طلبات التعيين
    select t.*, q.requester_user_id, app.manager_display_name(q.requester_user_id), 'تعيين موظف', q.hire_date, q.hire_date, null, null, null, null, q.note, null, q.created_at, null, null,
      jsonb_build_object('full_name', q.full_name, 'phone', q.phone, 'job_title', jt.name, 'department', dp.name, 'hire_date', q.hire_date, 'contract_type', q.contract_type,
                         'contract_label', case q.contract_type when 'daily' then 'يومي' else 'شهري' end, 'shift_name', sh.name, 'source', q.source, 'source_label', app.hire_source_label(q.source)), q.requester_role
    from public.approval_tasks t join public.hire_requests q on q.id = t.request_id and t.request_kind = 'hire'
    join public.departments jt on jt.id = q.job_title_id left join public.departments dp on dp.id = q.department_id left join public.hr_shifts sh on sh.id = q.shift_id
    where t.status = 'pending' and auth.uid() = any(t.approvers) and q.status = 'pending'
    union all
    -- 00397: طلبات تعديل الحضور
    select t.*, q.requested_by, app.manager_display_name(q.requested_by), 'تعديل حضور', q.dates[1], q.dates[cardinality(q.dates)], null, null, null, null, q.reason, null, q.created_at, null, null,
      jsonb_build_object('scope_label', q.scope_label, 'scope_kind', q.scope_kind, 'action', q.action, 'action_label', app.attendance_action_label(q.action), 'payload', q.payload,
                         'employees', q.employees_count, 'days', q.days_count, 'items', q.items_count, 'dates', to_jsonb(q.dates), 'reason', q.reason), q.requester_role
    from public.approval_tasks t join public.attendance_edit_requests q on q.id = t.request_id and t.request_kind = 'attendance_edit'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and q.status = 'pending_approval'
    union all
    select t.*, a.requested_by, coalesce(a.requested_by_name, app.manager_display_name(a.requested_by)), 'سلفة', null, null, null, null, null, null, a.notes, null, a.created_at, null, a.ref_no,
      jsonb_build_object('employee_name', a.employee_name, 'employee_number', a.employee_number, 'type_name', a.type_name, 'amount', a.amount, 'requested_amount', a.requested_amount,
        'method', a.repayment_method, 'method_label', app.advance_method_label(a.repayment_method), 'installments', a.installments, 'monthly_amount', a.monthly_amount, 'percent', a.percent,
        'estimated_installment', app.advance_installment_amount(a, app.advance_monthly_salary(a.employee_id))), 'ops_room'
    from public.approval_tasks t join public.advances a on a.id = t.request_id and t.request_kind = 'advance'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and a.status = 'pending'
    union all
    select t.*, p.purge_requested_by, app.user_display_name(p.purge_requested_by), 'حذف أرشيف بارد', p.period_from, p.period_to, null, null, null, null, p.note, null, p.purge_requested_at, null, p.code,
      jsonb_build_object('code', p.code, 'period_from', p.period_from, 'period_to', p.period_to, 'file_count', p.file_count, 'total_bytes', p.total_bytes, 'verified_copies', p.verified_copies, 'required_copies', p.required_copies,
        'purge_available_at', p.purge_available_at, 'copies', (select string_agg(c.disk_label, '، ') from public.cold_archive_copies c where c.package_id = p.id),
        'by_source', coalesce((select jsonb_agg(jsonb_build_object('source_key', i.source_key, 'files', i.n) order by i.n desc) from (select source_key, count(*) n from public.cold_archive_items where package_id = p.id group by source_key) i), '[]'::jsonb)), 'it_admin'
    from public.approval_tasks t join public.cold_archive_packages p on p.id = t.request_id and t.request_kind = 'cold_archive_purge'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and p.status = 'verified' and p.purge_chain_id is not null and p.purge_approved_at is null
    union all
    select t.*, r.approval_requested_by, app.user_display_name(r.approval_requested_by), 'تقرير شكاوى', r.report_date, r.report_date, null, null, null, null, null, r.pptx_path, r.approval_requested_at, null, null,
      jsonb_build_object('title', r.title, 'sector', r.sector, 'sector_label', case r.sector when 'karrada' then 'الكرادة' else 'الزعفرانية' end, 'report_date', r.report_date, 'scope', r.report_scope,
        'items', (select count(*) from public.complaint_report_items i where i.report_id = r.id and i.included), 'recipients', r.recipients, 'pptx_path', r.pptx_path, 'review_confirmed_at', r.review_confirmed_at), 'complaints_officer'
    from public.approval_tasks t join public.complaint_reports r on r.id = t.request_id and t.request_kind = 'complaint_report'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and r.status = 'quality_review' and r.approval_chain_id is not null
  )
  select b.id, b.request_kind, b.request_id, b.step_no,
    (select count(*)::int from public.approval_tasks x where x.request_kind = b.request_kind and x.request_id = b.request_id and x.status <> 'skipped'),
    b.step_label, b.req_user, b.req_name, coalesce(c.requester_role, b.fixed_role), app.approval_role_label(coalesce(c.requester_role, b.fixed_role)),
    (select string_agg(s.name, '، ') from public.sectors s where s.parent_sector = any(app.user_parent_sectors(b.req_user))
       and (s.id in (select cp.sector_id from public.contractor_profiles cp where cp.user_id = b.req_user and cp.is_active)
            or s.id in (select unnest(mp.sectors) from public.manager_profiles mp where mp.user_id = b.req_user))),
    (select string_agg(app.parent_sector_name(x), '، ') from unnest(app.user_parent_sectors(b.req_user)) x),
    b.type_name, b.start_date, b.end_date, b.start_time, b.end_time, b.days, b.minutes, b.notes, b.attachment_path, b.req_created,
    coalesce((select jsonb_agg(jsonb_build_object('step_no', p.step_no, 'label', p.step_label, 'status', p.status, 'decided_by', app.manager_display_name(p.decided_by), 'decided_at', p.decided_at, 'note', p.note) order by p.step_no)
              from public.approval_tasks p where p.request_kind = b.request_kind and p.request_id = b.request_id and p.step_no < b.step_no), '[]'::jsonb),
    b.items, b.ref_no, b.details
  from base b left join public.approval_chains c on c.id = b.chain_id
  order by b.req_created;
end$$;
grant execute on function public.approval_my_tasks() to authenticated;

create or replace function public.approval_timeline(p_kind text, p_request uuid)
returns table(step_no int, step_label text, status text, approvers jsonb, decided_by_name text, decided_at timestamptz, note text)
language plpgsql stable security definer set search_path = public, app as $$
declare requester uuid;
begin
  if p_kind = 'supplies' then select r.manager_id into requester from public.sector_supply_requests r where r.id = p_request;
  elsif p_kind = 'termination' then select r.requester_user_id into requester from public.termination_requests r where r.id = p_request;
  elsif p_kind = 'hire' then select r.requester_user_id into requester from public.hire_requests r where r.id = p_request;
  elsif p_kind = 'attendance_edit' then select r.requested_by into requester from public.attendance_edit_requests r where r.id = p_request;   -- 00397
  elsif p_kind = 'advance' then select a.requested_by into requester from public.advances a where a.id = p_request;
  elsif p_kind = 'cold_archive_purge' then select p.purge_requested_by into requester from public.cold_archive_packages p where p.id = p_request;
  elsif p_kind = 'complaint_report' then select coalesce(r.approval_requested_by, r.created_by) into requester from public.complaint_reports r where r.id = p_request;
  else select e.user_id into requester from public.hr_leaves l1 join public.employees e on e.id = l1.employee_id where l1.id = p_request; end if;
  if requester is null and not found then raise exception 'HR_NOT_FOUND'; end if;
  if not (auth.uid() = requester or app.has_role(array['it_admin','hr_officer','super_admin','ops_room'])
          or (p_kind = 'advance' and app.has_role(array['finance_officer']))
          or (p_kind = 'complaint_report' and app.has_role(array['complaints_officer']))
          or (p_kind = 'attendance_edit' and app.has_role(array['deputy_director','executive_director']))
          or exists (select 1 from public.approval_tasks t where t.request_kind = p_kind and t.request_id = p_request and auth.uid() = any(t.approvers))) then
    raise exception 'HR_FORBIDDEN';
  end if;
  return query
  select t.step_no, t.step_label, t.status,
    (select coalesce(jsonb_agg(jsonb_build_object('user_id', a, 'name', app.manager_display_name(a))), '[]'::jsonb) from unnest(t.approvers) a),
    app.manager_display_name(t.decided_by), t.decided_at, t.note
  from public.approval_tasks t where t.request_kind = p_kind and t.request_id = p_request order by t.step_no;
end$$;

-- ── ⑯ القوائم والتفاصيل والمؤشرات ──
create or replace function app.attendance_edit_status_label(p text) returns text language sql immutable as $$
  select case p when 'pending_approval' then 'بانتظار الموافقات' when 'approved' then 'لدى الموارد البشرية' when 'applied' then 'نُفّذ' when 'rejected' then 'مرفوض'
                when 'cancelled' then 'ملغى' when 'reverted' then 'مُتراجَع عنه' else coalesce(p, '—') end $$;

create or replace function public.attendance_edit_list(p_from date default null, p_to date default null, p_mode text default null, p_status text default null,
                                                       p_department uuid default null, p_employee uuid default null, p_actor uuid default null, p_search text default null, p_limit int default 300)
returns table(id uuid, mode text, mode_label text, status text, status_label text, scope_kind text, scope_label text, dates date[], first_date date, last_date date, action text, action_label text, payload jsonb,
              reason text, requested_by uuid, requester_name text, requester_role text, chain_id uuid, current_step text, approved_at timestamptz, rejected_note text, hr_note text,
              applied_by uuid, applied_by_name text, applied_at timestamptz, reverted_by uuid, reverted_by_name text, reverted_at timestamptz, revert_reason text,
              employees_count int, days_count int, items_count int, minutes_fixed int, departments text, created_at timestamptz, can_revert boolean, can_cancel boolean, can_hr_apply boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare me uuid := auth.uid();
begin
  if not app.attendance_edit_can_view() then raise exception 'HR_FORBIDDEN'; end if;
  return query
  select q.id, q.mode, case q.mode when 'direct' then 'تعديل مباشر' else 'بطلب إلى الموارد البشرية' end, q.status, app.attendance_edit_status_label(q.status),
         q.scope_kind, q.scope_label, q.dates, q.dates[1], q.dates[cardinality(q.dates)], q.action, app.attendance_action_label(q.action), q.payload,
         q.reason, q.requested_by, app.manager_display_name(q.requested_by), q.requester_role, q.chain_id,
         (select t.step_label from public.approval_tasks t where t.request_kind = 'attendance_edit' and t.request_id = q.id and t.status = 'pending' order by t.step_no limit 1),
         q.approved_at, q.rejected_note, q.hr_note, q.applied_by, app.manager_display_name(q.applied_by), q.applied_at, q.reverted_by, app.manager_display_name(q.reverted_by), q.reverted_at, q.revert_reason,
         q.employees_count, q.days_count, q.items_count, q.minutes_fixed,
         (select string_agg(distinct d.name, '، ') from public.attendance_edit_items i join public.employees e on e.id = i.employee_id join public.departments d on d.id = e.department_id where i.request_id = q.id),
         q.created_at,
         (q.status = 'applied' and app.has_role(array['deputy_director', 'super_admin'])),
         (q.status in ('pending_approval', 'approved') and (q.requested_by = me or app.has_role(array['super_admin']))),
         (q.mode = 'hr_request' and q.status = 'approved' and app.has_role(array['hr_officer', 'super_admin']))
  from public.attendance_edit_requests q
  where (p_from is null or q.dates[cardinality(q.dates)] >= p_from) and (p_to is null or q.dates[1] <= p_to)
    and (p_mode is null or q.mode = p_mode) and (p_status is null or q.status = p_status)
    and (p_actor is null or q.requested_by = p_actor or q.applied_by = p_actor)
    and (p_employee is null or exists (select 1 from public.attendance_edit_items i where i.request_id = q.id and i.employee_id = p_employee))
    and (p_department is null or exists (select 1 from public.attendance_edit_items i join public.employees e on e.id = i.employee_id where i.request_id = q.id
                                           and e.department_id in (select app.hr_department_tree(p_department))))
    and (p_search is null or trim(p_search) = '' or q.scope_label ilike '%' || trim(p_search) || '%' or q.reason ilike '%' || trim(p_search) || '%'
         or exists (select 1 from public.attendance_edit_items i join public.employees e on e.id = i.employee_id where i.request_id = q.id and (e.full_name ilike '%' || trim(p_search) || '%' or e.employee_number ilike '%' || trim(p_search) || '%')))
  order by q.created_at desc
  limit least(greatest(coalesce(p_limit, 300), 1), 2000);
end$$;
grant execute on function public.attendance_edit_list(date, date, text, text, uuid, uuid, uuid, text, int) to authenticated;

create or replace function public.attendance_edit_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare q record; items jsonb; tl jsonb;
begin
  if not app.attendance_edit_can_view() then raise exception 'HR_FORBIDDEN'; end if;
  select * into q from public.attendance_edit_list(null, null, null, null, null, null, null, null, 2000) x where x.id = p_id;
  if q.id is null then raise exception 'PROCEDURE_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'employee_id', i.employee_id, 'full_name', e.full_name, 'employee_number', e.employee_number, 'department_name', d.name, 'work_date', i.work_date,
           'before', case when i.before is null then null else jsonb_build_object('status', i.before ->> 'status', 'status_label', app.attendance_status_label(i.before ->> 'status'), 'check_in', i.before -> 'check_in', 'check_out', i.before -> 'check_out',
                        'late_minutes', coalesce((i.before ->> 'late_minutes')::int, 0), 'early_minutes', coalesce((i.before ->> 'early_minutes')::int, 0), 'worked_minutes', coalesce((i.before ->> 'worked_minutes')::int, 0)) end,
           'proposed', i.proposed || jsonb_build_object('status_label', app.attendance_status_label(i.proposed ->> 'status')),
           'after', case when i.after is null then null else jsonb_build_object('status', i.after ->> 'status', 'status_label', app.attendance_status_label(i.after ->> 'status'), 'check_in', i.after -> 'check_in', 'check_out', i.after -> 'check_out',
                        'late_minutes', coalesce((i.after ->> 'late_minutes')::int, 0), 'early_minutes', coalesce((i.after ->> 'early_minutes')::int, 0), 'worked_minutes', coalesce((i.after ->> 'worked_minutes')::int, 0)) end,
           'applied', i.applied, 'skipped_reason', i.skipped_reason, 'hr_edited', i.hr_edited_by is not null, 'hr_edited_by_name', app.manager_display_name(i.hr_edited_by)) order by e.full_name, i.work_date), '[]'::jsonb)
  into items from public.attendance_edit_items i join public.employees e on e.id = i.employee_id left join public.departments d on d.id = e.department_id where i.request_id = p_id;
  select coalesce(jsonb_agg(jsonb_build_object('step_no', t.step_no, 'step_label', t.step_label, 'status', t.status, 'decided_by_name', app.manager_display_name(t.decided_by), 'decided_at', t.decided_at, 'note', t.note,
           'approvers', (select coalesce(jsonb_agg(app.manager_display_name(a)), '[]'::jsonb) from unnest(t.approvers) a)) order by t.step_no), '[]'::jsonb)
  into tl from public.approval_tasks t where t.request_kind = 'attendance_edit' and t.request_id = p_id;
  return to_jsonb(q) || jsonb_build_object('items', items, 'timeline', tl);
end$$;
grant execute on function public.attendance_edit_detail(uuid) to authenticated;

-- مؤشرات الشهر (المدير المفوض/المعاون): العدد، المباشر مقابل بالطلب، الموظفون المتأثرون، الدقائق المصحّحة، المعلّق
create or replace function public.attendance_edit_stats(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, app.hr_local_date(now())))::date; r jsonb;
begin
  if not app.attendance_edit_can_view() then raise exception 'HR_FORBIDDEN'; end if;
  select jsonb_build_object(
    'month', to_char(m, 'YYYY-MM'),
    'total', count(*) filter (where q.status in ('applied', 'reverted')),
    'direct', count(*) filter (where q.status in ('applied', 'reverted') and q.mode = 'direct'),
    'by_request', count(*) filter (where q.status in ('applied', 'reverted') and q.mode = 'hr_request'),
    'pending_approval', count(*) filter (where q.status = 'pending_approval'),
    'awaiting_hr', count(*) filter (where q.status = 'approved'),
    'rejected', count(*) filter (where q.status = 'rejected'),
    'reverted', count(*) filter (where q.status = 'reverted'),
    'employees', (select count(distinct i.employee_id) from public.attendance_edit_items i join public.attendance_edit_requests x on x.id = i.request_id where x.status = 'applied' and date_trunc('month', x.applied_at at time zone 'UTC')::date = m),
    'work_days', coalesce(sum(q.items_count) filter (where q.status = 'applied'), 0),
    'minutes_fixed', coalesce(sum(q.minutes_fixed) filter (where q.status = 'applied'), 0),
    'by_action', (select coalesce(jsonb_object_agg(a.action, a.n), '{}'::jsonb) from (select x.action, count(*) n from public.attendance_edit_requests x where x.status in ('applied', 'reverted') and date_trunc('month', coalesce(x.applied_at, x.created_at) at time zone 'UTC')::date = m group by x.action) a),
    'top_requesters', (select coalesce(jsonb_agg(jsonb_build_object('name', app.manager_display_name(x.requested_by), 'n', x.n) order by x.n desc), '[]'::jsonb) from (select requested_by, count(*) n from public.attendance_edit_requests x where x.status in ('applied', 'reverted') and date_trunc('month', coalesce(x.applied_at, x.created_at) at time zone 'UTC')::date = m group by requested_by order by n desc limit 5) x))
  into r
  from public.attendance_edit_requests q
  where date_trunc('month', coalesce(q.applied_at, q.created_at) at time zone 'UTC')::date = m;
  return r;
end$$;
grant execute on function public.attendance_edit_stats(date) to authenticated;

-- ── ⑰ الحارس (00291): الدوال الكاتبة الحساسة ──
create or replace function app.guarded_write_functions() returns text[] language sql immutable as $$
  select array[
    'approval_decide_request','hr_leave_decide','hr_leave_request','hr_leave_cancel','supply_request_decide','supply_request_deliver','supply_request_create',
    'termination_request_create','termination_request_decide','disclosure_submit','disclosure_decide','advance_request_create','advance_decide','advance_deliver','advance_settle_cash',
    'hire_request_create','hire_request_decide','hire_request_cancel','hire_request_complete','hr_employee_create','hr_employee_terminate',
    'cold_archive_package_create','cold_archive_purge_request','cold_archive_purge_decide','cold_archive_purge_approve','cold_archive_purge_confirm',
    'complaint_report_decide','complaint_approve_report','complaint_decide_deletion','complaint_create_item_from_inbox','complaint_batch_create_items_from_inbox',
    'complaint_start_item','complaint_complete_item','complaint_start_assignment_ticket','complaint_complete_assignment_ticket',
    'finance_payroll_approve','finance_payroll_adjust','finance_payroll_reconcile','finance_treasury_confirm','exec_treasury_record','deputy_payroll_approve',
    'ops_attendance_confirm','ops_contractor_month_approve','ops_deduction_add','it_deduction_exemption_add','contractor_checkin',
    'garage_record_departure','garage_record_return','garage_record_shift_departure','garage_decide_maintenance_dispatch','garage_decide_tank_zero',
    'sector_confirm_vehicle_arrival','sector_confirm_vehicle_site_return','sector_submit_breakdown','sector_submit_supply','sector_supply_submit','sector_support_request_create',
    'station_confirm_vehicle_arrival','station_record_exit','ts_record_weighing','ts_complete_weighing',
    'maintenance_approve_readiness','maintenance_complete_case','maintenance_confirm_arrival','maintenance_inventory_create','maintenance_purchase_create',
    'media_design_create','media_design_complete','media_template_create','citizen_complaint_submit','citizen_chat_request',
    'attendance_edit_create','attendance_edit_decide','attendance_edit_hr_apply','attendance_edit_revert'   -- 00397
  ]
$$;
do $$ declare f text; begin
  foreach f in array array['attendance_edit_create','attendance_edit_decide','attendance_edit_hr_apply','attendance_edit_revert'] loop perform app.wrap_write_guard(f); end loop;
end $$;

-- ── ⑱ حفظ سلسلة «تعديل حضور» من بوابة التطوير (طالبها غرفة العمليات) ──
create or replace function public.approval_chain_save(p_requester_role text, p_request_type text, p_steps jsonb, p_active boolean default true, p_subtype text default null,
                                                      p_department uuid default null, p_include_children boolean default true)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; clean jsonb; st text := nullif(trim(coalesce(p_subtype, '')), ''); v_role text := p_requester_role;
begin
  perform app.require_it();
  if p_request_type not in ('leave','time_permit','supplies','termination','disclosure','advance','cold_archive_purge','complaint_report','hire','attendance_edit') then raise exception 'APPROVAL_TYPE_INVALID'; end if;
  if p_department is not null then
    -- 00391: سلسلة قسم — تنطبق على كل موظفي القسم (والفرعية اختيارياً) أياً كان دورهم
    if p_request_type not in ('leave','time_permit','advance') then raise exception 'APPROVAL_DEPT_TYPE_NOT_ALLOWED'; end if;
    if not exists (select 1 from public.departments d where d.id = p_department) then raise exception 'APPROVAL_DEPT_INVALID'; end if;
    v_role := 'department';
  else
    if coalesce(v_role, '') = '' then raise exception 'APPROVAL_ROLE_REQUIRED'; end if;
    if not (v_role = any(app.approval_requester_roles())) then raise exception 'APPROVAL_ROLE_INVALID'; end if;
    if p_request_type = 'cold_archive_purge' and v_role not in ('it_admin','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
    if p_request_type = 'complaint_report' and v_role not in ('complaints_officer','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
    if p_request_type = 'attendance_edit' and v_role not in ('ops_room','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;   -- 00397
    if p_request_type = 'hire' and v_role not in ('central_garage_officer','transfer_station','maintenance','super_admin') then raise exception 'APPROVAL_ROLE_INVALID'; end if;
  end if;
  if st is not null then
    if p_request_type not in ('leave','time_permit') then raise exception 'APPROVAL_SUBTYPE_NOT_ALLOWED'; end if;
    if not exists (select 1 from public.hr_leave_types t where t.code = st and t.kind = p_request_type) then raise exception 'APPROVAL_SUBTYPE_INVALID'; end if;
  end if;
  perform app.approval_validate_steps(p_steps);
  select jsonb_agg(app.approval_clean_step(s) order by o) into clean from jsonb_array_elements(p_steps) with ordinality t(s, o);
  select c.id into v_id from public.approval_chains c where c.requester_role = v_role and c.request_type = p_request_type and coalesce(c.subtype, '') = coalesce(st, '')
    and c.department_id is not distinct from p_department;
  if v_id is null then
    insert into public.approval_chains (requester_role, request_type, subtype, steps, is_active, updated_by, department_id, include_children)
    values (v_role, p_request_type, st, clean, coalesce(p_active, true), auth.uid(), p_department, coalesce(p_include_children, true)) returning id into v_id;
  else
    update public.approval_chains set steps = clean, is_active = coalesce(p_active, true), include_children = coalesce(p_include_children, true), updated_by = auth.uid(), updated_at = now() where id = v_id;
  end if;
  return v_id;
end$$;
