-- 00215 · الموارد البشرية: نوع شفت جديد «مرن» (kind = flexible)
-- · النافذة: من البداية إلى النهاية (قد تعبر منتصف الليل)؛ الموظف يدخل في أي وقت داخلها — لا تأخير.
-- · الساعات المطلوبة (required_hours، افتراضي 12 وقابلة للتخصيص): الخروج المتوقع = أول بصمة + الساعات المطلوبة؛
--   النقص عنها يُعامل كخروج مبكر (دقائق) ويدخل في الاستقطاعات التلقائية كالمعتاد (السماحية تنطبق على الحالة).
-- · قالبان افتراضيان: «مرن صباحي» 05:00–16:00 و«مرن مسائي» 17:00–04:00 (12 ساعة) — قابلة للتعديل من HR.

alter table public.hr_shifts
  add column if not exists kind text not null default 'fixed',
  add column if not exists required_hours numeric(4,2);
alter table public.hr_shifts drop constraint if exists hr_shifts_kind_check;
alter table public.hr_shifts add constraint hr_shifts_kind_check check (kind in ('fixed', 'flexible'));
alter table public.hr_shifts drop constraint if exists hr_shifts_required_hours_check;
alter table public.hr_shifts add constraint hr_shifts_required_hours_check
  check (kind = 'fixed' or (required_hours is not null and required_hours > 0 and required_hours <= 24));

insert into public.hr_shifts (name, start_time, end_time, grace_minutes, kind, required_hours) values
  ('مرن صباحي', '05:00', '16:00', 10, 'flexible', 12),
  ('مرن مسائي', '17:00', '04:00', 10, 'flexible', 12)
on conflict (name) do update set kind = excluded.kind, required_hours = coalesce(public.hr_shifts.required_hours, excluded.required_hours);

-- الشفت الفعّال للموظف يحمل النوع والساعات المطلوبة
drop function if exists app.hr_effective_shift(uuid, date);
create function app.hr_effective_shift(p_employee uuid, p_date date)
returns table(shift_id uuid, shift_name text, start_time time, end_time time, grace_minutes integer, work_days smallint[], kind text, required_hours numeric)
language sql stable security definer set search_path = public as $$
  select s.id, s.name,
         coalesce(a.start_override, s.start_time), coalesce(a.end_override, s.end_time),
         coalesce(a.grace_override, s.grace_minutes), coalesce(a.days_override, s.work_days),
         s.kind, s.required_hours
  from public.employee_shift_assignments a
  join public.hr_shifts s on s.id = a.shift_id
  where a.employee_id = p_employee and a.effective_from <= p_date
  order by a.effective_from desc limit 1
$$;

create or replace function app.hr_evaluate_day(p_employee uuid, p_date date)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  sh record; tz interval := app.hr_tz();
  v_exp_in timestamptz; v_exp_out timestamptz; v_win_from timestamptz; v_win_to timestamptz;
  v_in timestamptz; v_out timestamptz; v_late int := 0; v_early int := 0; v_worked int := 0;
  v_win_h int := greatest(1, least(12, app.hr_policy_int('punch_window_hours', 4)));
  v_rest boolean := false; v_status text; v_leave text; v_dow int; v_hired date; v_term date; v_pin text;
  v_flex boolean := false; v_req_min int := 0;   -- 00215: الشفت المرن
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
    v_flex := coalesce(sh.kind, 'fixed') = 'flexible'; v_req_min := round(coalesce(sh.required_hours, 0) * 60)::int;
    v_exp_in := (p_date + sh.start_time)::timestamp - tz;
    v_exp_out := (p_date + sh.end_time)::timestamp - tz;
    if v_exp_out <= v_exp_in then v_exp_out := v_exp_out + interval '1 day'; end if;
    -- نافذة التقاط البصمات حول الدوام: من إعدادات بوابة التطوير المركزية (punch_window_hours، افتراضي 4)
    v_win_from := v_exp_in - make_interval(hours => v_win_h); v_win_to := v_exp_out + make_interval(hours => v_win_h);
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
  if sh.shift_id is not null and not v_rest and v_flex then
    -- 00215 · الشفت المرن: لا تأخير؛ الدخول في أي وقت داخل النافذة، والخروج المتوقع = الدخول + الساعات المطلوبة.
    --   النقص عن الساعات المطلوبة يُعامل كخروج مبكر (دقائق) ويدخل في الاستقطاعات التلقائية كالمعتاد. الزمنيات المعتمدة تغطي ما يقع داخلها.
    if v_in is not null then
      v_exp_in := greatest(v_in, v_exp_in);
      v_exp_out := v_exp_in + make_interval(mins => v_req_min);
      if v_out is not null and v_out < v_exp_out then
        v_early := floor(extract(epoch from (v_exp_out - v_out)) / 60)::int - app.hr_permit_cover_minutes(p_employee, p_date, v_out, v_exp_out, sh.start_time, sh.end_time);
        v_early := greatest(0, v_early);
      end if;
    end if;
  elsif sh.shift_id is not null and not v_rest then
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
