-- ═══════════════════════════════════════════════════════════════════════════════
-- 00178 · دقة تعديلات الحضور من غرفة العمليات + تبليغ وحدة التطوير المركزية
--  ① كل تعديل/إعادة احتساب/استقطاع يدوي/إلغاء استقطاع من غرفة العمليات يُبلَّغ تلقائياً لحسابات التطوير المركزية
--     (إشعار داخل المنصة + سجل تدقيق مقروء لها) — المصدر الواحد: جدول hr_attendance_audit
--  ② ops_attendance_edit يحتسب بنفس قواعد المحرك: يكمل الدوام المتوقع من الشفت إن غاب الصف، السماح للتأخير والخروج المبكر،
--     والزمنيات المعتمدة تغطي ما بداخلها فقط (كان: بلا شفت متوقع للصف الجديد، وبلا سماح للخروج المبكر، وبلا زمنيات)
--  ③ قائمة سجل التدقيق بأسماء الموظف والمدقّق لكل الجهات المخولة
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── تصنيف إشعارات الموارد البشرية ────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category in ('system','departure','maintenance','garage','station','gps','complaints','security','hr'));

-- ─── سجل التدقيق مقروء للتطوير المركزية ───────────────────────────────────────
drop policy if exists "hr_audit: قراءة" on public.hr_attendance_audit;
create policy "hr_audit: قراءة" on public.hr_attendance_audit for select to authenticated
  using (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'it_admin', 'super_admin']));

-- ─── ① تبليغ التطوير المركزية عند أي تعديل تشغيلي على الحضور ──────────────────
create or replace function app.notify_it_attendance_audit() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_name text; v_num text; v_action text; v_actor text;
begin
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
         'warning', 'hr', 'normal', '/it/integrations/biometric/attendance-audit', 'hr_attendance_audit', new.id, 'فتح سجل التعديلات', 'hr_audit:' || new.id::text
  from public.user_roles ur where ur.role in ('it_admin', 'super_admin') and ur.user_id is distinct from new.actor
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return new;
end$$;
drop trigger if exists trg_notify_it_attendance_audit on public.hr_attendance_audit;
create trigger trg_notify_it_attendance_audit after insert on public.hr_attendance_audit
  for each row execute function app.notify_it_attendance_audit();

-- ─── ② تعديل غرفة العمليات بنفس قواعد المحرك ──────────────────────────────────
create or replace function public.ops_attendance_edit(
  p_employee uuid, p_date date, p_check_in timestamptz, p_check_out timestamptz, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare b jsonb; v_late int := 0; v_early int := 0; v_worked int := 0; r record; sh record; tz interval := app.hr_tz();
        v_exp_in timestamptz; v_exp_out timestamptz; v_shift_name text; v_rest boolean := false; v_grace int := 0; v_dow int;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  if app.hr_month_locked(p_date) then raise exception 'HR_MONTH_LOCKED'; end if;
  if p_status not in ('present', 'late', 'early_leave', 'absent', 'incomplete', 'leave', 'time_permit') then raise exception 'HR_STATUS_INVALID'; end if;
  if p_check_in is not null and p_check_out is not null and p_check_out <= p_check_in then raise exception 'HR_TIMES_INVALID'; end if;
  if p_date > app.hr_local_date(now()) then raise exception 'HR_FUTURE_DATE'; end if;
  if not exists (select 1 from public.employees where id = p_employee) then raise exception 'HR_NOT_FOUND'; end if;

  select to_jsonb(d) into b from public.hr_attendance_days d where d.employee_id = p_employee and d.work_date = p_date;
  select * into r from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;

  -- الدوام المتوقع: من الصف إن وُجد، وإلا من شفت الموظف الساري في ذلك اليوم
  select * into sh from app.hr_effective_shift(p_employee, p_date);
  v_grace := coalesce(sh.grace_minutes, 0);
  if r.expected_in is not null then
    v_exp_in := r.expected_in; v_exp_out := r.expected_out; v_shift_name := r.shift_name; v_rest := coalesce(r.is_rest_day, false);
  elsif sh.shift_id is not null then
    v_dow := extract(dow from p_date)::int;  -- 0=الأحد كما في المحرك
    v_rest := not (v_dow::smallint = any (sh.work_days));
    v_exp_in := (p_date + sh.start_time)::timestamp - tz;
    v_exp_out := (p_date + sh.end_time)::timestamp - tz;
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
  -- الحالة التي اختارها المدقّق هي الحكم؛ الدقائق تُصفَّر حين لا معنى لها
  if p_status in ('present', 'leave', 'time_permit', 'absent') then v_late := 0; v_early := 0; end if;
  if p_status = 'late' then v_early := 0; end if;
  if p_status = 'early_leave' then v_late := 0; end if;

  insert into public.hr_attendance_days as d (employee_id, work_date, shift_name, expected_in, expected_out, is_rest_day, check_in, check_out, late_minutes, early_minutes, worked_minutes, status, source, edited_by, edited_at, edit_reason)
  values (p_employee, p_date, v_shift_name, v_exp_in, v_exp_out, v_rest, p_check_in, p_check_out, v_late, v_early, v_worked, p_status, 'manual', auth.uid(), now(), trim(p_reason))
  on conflict (employee_id, work_date) do update set
    shift_name = coalesce(d.shift_name, excluded.shift_name), expected_in = coalesce(d.expected_in, excluded.expected_in), expected_out = coalesce(d.expected_out, excluded.expected_out),
    check_in = excluded.check_in, check_out = excluded.check_out, late_minutes = excluded.late_minutes, early_minutes = excluded.early_minutes,
    worked_minutes = excluded.worked_minutes, status = excluded.status, source = 'manual',
    edited_by = auth.uid(), edited_at = now(), edit_reason = excluded.edit_reason, updated_at = now();

  insert into public.hr_attendance_audit (employee_id, work_date, action, before, after, reason, actor)
  select p_employee, p_date, 'edit', b, to_jsonb(d), trim(p_reason), auth.uid() from public.hr_attendance_days d where d.employee_id = p_employee and d.work_date = p_date;
  perform app.hr_refresh_alerts(p_employee, p_date);
end$$;

-- ─── ③ سجل التدقيق بأسماء ────────────────────────────────────────────────────
create or replace function public.hr_attendance_audit_list(p_from date default null, p_to date default null, p_employee uuid default null, p_limit int default 300)
returns table(id uuid, employee_id uuid, employee_number text, full_name text, department_name text, work_date date, action text, before jsonb, after jsonb, reason text, actor uuid, actor_name text, created_at timestamptz)
language sql stable security definer set search_path = public, app as $$
  select a.id, a.employee_id, e.employee_number, e.full_name, d.name, a.work_date, a.action, a.before, a.after, a.reason, a.actor,
         app.manager_display_name(a.actor), a.created_at
  from public.hr_attendance_audit a
  join public.employees e on e.id = a.employee_id
  left join public.departments d on d.id = e.department_id
  where app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'it_admin', 'super_admin'])
    and (p_from is null or a.work_date >= p_from) and (p_to is null or a.work_date <= p_to)
    and (p_employee is null or a.employee_id = p_employee)
  order by a.created_at desc
  limit least(greatest(coalesce(p_limit, 300), 1), 2000)
$$;
grant execute on function public.hr_attendance_audit_list(date, date, uuid, int) to authenticated;
