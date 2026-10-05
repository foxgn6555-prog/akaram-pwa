-- 00177: إلغاء أمر جهاز معلّق (لم يُسلَّم للجهاز بعد) — HR/IT؛ الأوامر المُسلَّمة لا تُلغى لأن الجهاز استلمها
alter table public.biometric_device_commands drop constraint if exists biometric_device_commands_status_check;
alter table public.biometric_device_commands add constraint biometric_device_commands_status_check
  check (status in ('queued', 'sent', 'done', 'failed', 'cancelled'));

create or replace function public.biometric_command_cancel(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare v_status text; v_sn text;
begin
  if not app.has_role(array['it_admin', 'super_admin', 'hr_officer']) then raise exception 'BIO_FORBIDDEN'; end if;
  select status, device_serial into v_status, v_sn from public.biometric_device_commands where id = p_id for update;
  if v_status is null then raise exception 'BIO_COMMAND_NOT_FOUND'; end if;
  if v_status <> 'queued' then raise exception 'BIO_COMMAND_NOT_CANCELLABLE'; end if;
  update public.biometric_device_commands set status = 'cancelled', acked_at = now(), note = 'CANCELLED_BY_USER' where id = p_id;
  -- طلب سحب مرتبط في سجل العمليات → فاشل بسبب الإلغاء
  update public.biometric_pulls set status = 'failed', finished_at = now(), error = 'CANCELLED' where mode = 'adms_query' and error = 'QUEUED_CMD_' || p_id::text;
  insert into public.integration_logs (provider, direction, endpoint, status, payload)
  values ('biometric', 'outbound', 'adms/command', 'success', jsonb_build_object('sn', v_sn, 'id', p_id, 'cancelled', true, 'by', auth.uid()));
end;
$$;
revoke all on function public.biometric_command_cancel(bigint) from public, anon;
grant execute on function public.biometric_command_cancel(bigint) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- مراجعة دورة حضور الموظف (تدقيق 00177) — إصلاحات جذرية مثبتة بـ tests/db/hr-attendance-lifecycle-test.sql
--  ① لا «غياب» قبل انتهاء الشفت: يوم اليوم (قبل نهاية الدوام) أو يوم مستقبلي بلا بصمة لا يُكتب غياباً
--     (كان الاحتساب الساعي يُظهر الجميع «غائب» صباحاً، واحتساب نطاق يمتد للمستقبل يُنشئ غيابات وهمية باستقطاعات)
--     — الإجازة المعتمدة تُكتب دائماً (حتى للمستقبل) لأنها قرار لا مشاهدة.
--  ② الزمنية تعذر التأخير فقط إن غطّت بداية الدوام، وتعذر الخروج المبكر فقط إن غطّت نهايته
--     (كانت أي زمنية في منتصف اليوم تُصفّر التأخير والخروج المبكر)
--  ③ تغيير شفت الموظف بأثر رجعي يعيد احتساب الأيام من تاريخ السريان حتى اليوم تلقائياً (كان يحتاج احتساباً يدوياً)
--  ④ السماح ينطبق على الخروج المبكر في تحديد الحالة (كان الخروج قبل دقيقة = «خروج مبكر»)
-- ═══════════════════════════════════════════════════════════════════════════════
-- دقائق تغطية الزمنيات المعتمدة لفترة [p_from, p_to) من يوم p_date (بتوقيت الشفت؛ الزمنية بعد منتصف الليل في الليلي تُنسب لليوم التالي)
create or replace function app.hr_permit_cover_minutes(p_employee uuid, p_date date, p_from timestamptz, p_to timestamptz, p_shift_start time, p_shift_end time)
returns integer language sql stable security definer set search_path = public, app as $$
  select coalesce(sum(greatest(0, floor(extract(epoch from (least(p_to, pe) - greatest(p_from, ps))) / 60)))::int, 0)
  from (
    select (p_date + l.start_time)::timestamp - app.hr_tz() + case when p_shift_end <= p_shift_start and l.start_time < p_shift_start then interval '1 day' else interval '0' end as ps,
           (p_date + l.end_time)::timestamp - app.hr_tz() + case when p_shift_end <= p_shift_start and l.end_time <= p_shift_start then interval '1 day' else interval '0' end as pe
    from public.hr_leaves l
    where l.employee_id = p_employee and l.status = 'approved' and l.kind = 'time_permit' and l.start_date = p_date and l.start_time is not null and l.end_time is not null
  ) x where pe > ps and least(p_to, pe) > greatest(p_from, ps)
$$;
revoke all on function app.hr_permit_cover_minutes(uuid, date, timestamptz, timestamptz, time, time) from public, anon, authenticated;

create or replace function app.hr_evaluate_day(p_employee uuid, p_date date)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  sh record; tz interval := app.hr_tz();
  v_exp_in timestamptz; v_exp_out timestamptz; v_win_from timestamptz; v_win_to timestamptz;
  v_in timestamptz; v_out timestamptz; v_late int := 0; v_early int := 0; v_worked int := 0;
  v_rest boolean := false; v_status text; v_leave text; v_dow int; v_hired date; v_term date; v_pin text;
begin
  select hire_date, terminated_at, biometric_pin into v_hired, v_term, v_pin from public.employees where id = p_employee;
  if v_hired is null or p_date < v_hired or (v_term is not null and p_date > v_term) then
    -- ⑤ خارج مدة الخدمة: يُزال أي صف تلقائي قديم (مثلاً بعد تصحيح تاريخ التعيين أو إنهاء الخدمة بأثر رجعي)
    delete from public.hr_attendance_days where employee_id = p_employee and work_date = p_date and source = 'auto';
    return;
  end if;
  if v_pin is null then return; end if;   -- بلا بصمة: لا حضور مشتق
  if exists (select 1 from public.hr_attendance_days where employee_id = p_employee and work_date = p_date and source = 'manual') then return; end if;

  select * into sh from app.hr_effective_shift(p_employee, p_date);
  v_dow := extract(dow from p_date)::int;
  if sh.shift_id is null then
    v_exp_in := (p_date::timestamp - tz); v_exp_out := v_exp_in + interval '24 hours';
    v_win_from := v_exp_in; v_win_to := v_exp_out;
  else
    v_rest := not (v_dow::smallint = any (sh.work_days));
    v_exp_in := (p_date + sh.start_time)::timestamp - tz;
    v_exp_out := (p_date + sh.end_time)::timestamp - tz;
    if v_exp_out <= v_exp_in then v_exp_out := v_exp_out + interval '1 day'; end if;
    v_win_from := v_exp_in - interval '4 hours'; v_win_to := v_exp_out + interval '4 hours';
  end if;

  select min(punched_at), max(punched_at) into v_in, v_out
  from public.biometric_punches where employee_id = p_employee and punched_at >= v_win_from and punched_at < v_win_to;
  if v_in = v_out then v_out := null; end if;

  select kind into v_leave from public.hr_leaves
  where employee_id = p_employee and status = 'approved' and p_date between start_date and end_date
  order by (kind = 'leave') desc limit 1;

  -- ① الدوام لم ينتهِ بعد (اليوم أو المستقبل) وبلا بصمة وبلا إجازة → لا حكم بعد؛ ونزيل أي صف تلقائي سابق
  if v_in is null and v_out is null and v_leave is distinct from 'leave' and now() < v_exp_out then
    delete from public.hr_attendance_days where employee_id = p_employee and work_date = p_date and source = 'auto';
    return;
  end if;

  -- ② الزمنيات المعتمدة لهذا اليوم تغطي ما يقع داخلها فقط: التأخير = ما بين بداية الدوام والدخول خارج أي زمنية،
  --    والخروج المبكر = ما بين الخروج ونهاية الدوام خارج أي زمنية (زمنية في منتصف اليوم لا تعذر تأخيراً في بدايته)
  if sh.shift_id is not null and not v_rest then
    if v_in is not null and v_in > v_exp_in then
      v_late := floor(extract(epoch from (v_in - v_exp_in)) / 60)::int - app.hr_permit_cover_minutes(p_employee, p_date, v_exp_in, v_in, sh.start_time, sh.end_time);
      v_late := greatest(0, v_late - sh.grace_minutes);
    end if;
    if v_out is not null and v_out < v_exp_out then
      v_early := floor(extract(epoch from (v_exp_out - v_out)) / 60)::int - app.hr_permit_cover_minutes(p_employee, p_date, v_out, v_exp_out, sh.start_time, sh.end_time);
      v_early := greatest(0, v_early);
    end if;
  end if;
  if v_in is not null and v_out is not null then v_worked := floor(extract(epoch from (v_out - v_in)) / 60)::int; end if;

  -- ④ فترة السماح تنطبق على الخروج المبكر أيضاً عند تحديد الحالة (كان خروج قبل دقيقة واحدة يُصنَّف «خروج مبكر»)؛ الدقائق الحقيقية تُحفظ
  v_status := app.hr_status_of(v_in, v_out, v_late, case when v_early > coalesce(sh.grace_minutes, 0) then v_early else 0 end, v_rest);
  if v_leave = 'leave' then
    v_status := 'leave'; v_late := 0; v_early := 0;
  elsif v_leave = 'time_permit' and v_in is not null and v_out is not null then
    -- الزمنية مع حضور كامل: الحالة «زمنية» إن لم يبقَ تأخير/خروج مبكر خارج تغطيتها، وإلا تبقى الحالة الحقيقية
    if v_late = 0 and v_early <= coalesce(sh.grace_minutes, 0) then v_status := 'time_permit'; end if;
  end if;
  if v_rest and v_in is null then return; end if;

  insert into public.hr_attendance_days as d
    (employee_id, work_date, shift_name, expected_in, expected_out, check_in, check_out, late_minutes, early_minutes, worked_minutes, is_rest_day, status, source, updated_at)
  values (p_employee, p_date, sh.shift_name, case when sh.shift_id is null then null else v_exp_in end, case when sh.shift_id is null then null else v_exp_out end,
          v_in, v_out, v_late, v_early, v_worked, v_rest, v_status, 'auto', now())
  on conflict (employee_id, work_date) do update set
    shift_name = excluded.shift_name, expected_in = excluded.expected_in, expected_out = excluded.expected_out,
    check_in = excluded.check_in, check_out = excluded.check_out, late_minutes = excluded.late_minutes,
    early_minutes = excluded.early_minutes, worked_minutes = excluded.worked_minutes, is_rest_day = excluded.is_rest_day,
    status = excluded.status, updated_at = now()
  where d.source = 'auto';
end$$;

-- ③ تغيير الشفت يعيد احتساب الأيام المتأثرة (حتى 62 يوماً للخلف، الأشهر المقفولة تُترك)
create or replace function public.hr_employee_assign_shift(
  p_employee uuid, p_shift uuid, p_from date, p_start time default null, p_end time default null, p_grace int default null, p_days smallint[] default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; d date; v_today date := app.hr_local_date(now()); v_from date := coalesce(p_from, current_date);
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if app.hr_month_locked(v_from) then raise exception 'HR_MONTH_LOCKED'; end if;
  insert into public.employee_shift_assignments as a (employee_id, shift_id, effective_from, start_override, end_override, grace_override, days_override, note, created_by)
  values (p_employee, p_shift, v_from, p_start, p_end, p_grace, p_days, p_note, auth.uid())
  on conflict (employee_id, effective_from) do update set shift_id = excluded.shift_id, start_override = excluded.start_override,
    end_override = excluded.end_override, grace_override = excluded.grace_override, days_override = excluded.days_override, note = excluded.note, created_by = auth.uid()
  returning id into v_id;
  d := greatest(v_from, v_today - 62);
  while d <= v_today loop perform app.hr_evaluate_day_safe(p_employee, d); d := d + 1; end loop;
  begin perform app.hr_refresh_alerts(p_employee, v_today); exception when others then null; end;
  return v_id;
end$$;
