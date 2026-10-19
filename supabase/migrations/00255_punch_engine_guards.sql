-- 00255 · تدقيق محرك الحضور — خللان مؤكدان، والإصلاح قابل للتخصيص من بوابة التطوير المركزية (سياسة الحضور):
--   ① بصمتان متقاربتان عند الدخول (07:55 ثم 08:05) بلا خروج كانتا تُحسبان دخولاً وخروجاً ⇒ «خروج مبكر» بيوم استقطاع كامل،
--      بينما البصمة الواحدة = «بصمة ناقصة» بلا استقطاع. الآن: إعداد min_punch_gap_minutes (افتراضي 30، 0 = إيقاف) — خروج أقرب من ذلك يُهمل.
--   ② نافذة التقاط البصمات ≥ 9 ساعات كانت تخلط بصمات يومين متتاليين. الآن: punch_window_auto_cap (افتراضي مفعّل) يقيّد النافذة الفعلية
--      بمنتصف الفراغ بين شفت اليوم وشفت الغد (لشفت 8 ساعات = 8 ساعات كحد أقصى).
--   تغيير أي من الإعدادين يعيد احتساب الشهر الجاري غير المقفل فوراً.

update public.hr_policy set settings = settings
  || jsonb_build_object('min_punch_gap_minutes', coalesce((settings ->> 'min_punch_gap_minutes')::int, 30))
  || jsonb_build_object('punch_window_auto_cap', coalesce((settings ->> 'punch_window_auto_cap')::boolean, true))
where id = 1;

create or replace function app.hr_evaluate_day(p_employee uuid, p_date date)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  sh record; tz interval := app.hr_tz();
  v_exp_in timestamptz; v_exp_out timestamptz; v_win_from timestamptz; v_win_to timestamptz;
  v_in timestamptz; v_out timestamptz; v_late int := 0; v_early int := 0; v_worked int := 0;
  v_win_h int := greatest(1, least(12, app.hr_policy_int('punch_window_hours', 4)));
  v_rest boolean := false; v_status text; v_leave text; v_dow int; v_hired date; v_term date; v_pin text;
  v_flex boolean := false; v_req_min int := 0;   -- 00215: الشفت المرن
  v_win_min int; v_cap_min int; v_gap_min int := greatest(0, least(240, app.hr_policy_int('min_punch_gap_minutes', 30)));   -- 00255
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
    -- 00255: النافذة الفعلية لا تتجاوز منتصف الفراغ بين نهاية شفت اليوم وبداية شفت الغد (قابل للإيقاف من الإعدادات)،
    --        حتى لا تُنسب بصمة واحدة ليومين مهما كان الإعداد (كان خروج الأحد 22:00 يصبح دخول الاثنين مع نافذة 12 ساعة)
    v_win_min := v_win_h * 60;
    if app.hr_policy_bool('punch_window_auto_cap', true) then
      v_cap_min := floor(extract(epoch from (interval '24 hours' - (v_exp_out - v_exp_in))) / 120)::int;
      v_win_min := greatest(30, least(v_win_min, v_cap_min));
    end if;
    v_win_from := v_exp_in - make_interval(mins => v_win_min); v_win_to := v_exp_out + make_interval(mins => v_win_min);
  end if;

  select min(punched_at), max(punched_at) into v_in, v_out
  from public.biometric_punches where employee_id = p_employee and punched_at >= v_win_from and punched_at < v_win_to;
  if v_in = v_out then v_out := null; end if;
  -- 00255: بصمتان متقاربتان (أقل من الحد الأدنى بين الدخول والخروج) = بصمة مكررة لا خروج ⇒ «بصمة ناقصة» لا «خروج مبكر» بيوم استقطاع
  if v_out is not null and v_gap_min > 0 and v_out < v_in + make_interval(mins => v_gap_min) then v_out := null; end if;

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

create or replace function public.hr_policy_set(p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare cur jsonb; t jsonb; i int := 0; prev_to int := 0; v_reeval boolean := false;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'HR_POLICY_INVALID'; end if;
  cur := app.hr_policy() || p_patch;
  if (cur ->> 'annual_leave_days_default')::numeric < 0 or (cur ->> 'permits_per_leave_day')::int < 1 or (cur ->> 'permit_max_minutes')::int < 15 then raise exception 'HR_POLICY_INVALID'; end if;
  if (cur ->> 'balance_mode') not in ('annual_upfront', 'monthly_accrual') then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'backdated_max_days')::int, 7) not between 0 and 365 or coalesce((cur ->> 'backdated_alert_per_month')::int, 3) not between 1 and 31 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'punch_window_hours')::int, 4) not between 1 and 12 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'min_punch_gap_minutes')::int, 30) not between 0 and 240 then raise exception 'HR_POLICY_INVALID'; end if;   -- 00255
  if jsonb_typeof(coalesce(cur -> 'punch_window_auto_cap', 'true'::jsonb)) <> 'boolean' then raise exception 'HR_POLICY_INVALID'; end if;   -- 00255
  if coalesce((cur ->> 'evaluate_lookback_days')::int, 2) not between 1 and 31 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'grace_minutes_default')::int, 15) not between 0 and 120 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce(cur ->> 'salary_day_basis', 'fixed_30') not in ('fixed_30', 'calendar_days') then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce(cur ->> 'salary_model', 'earned_days') not in ('earned_days', 'full_minus_absence') then raise exception 'HR_POLICY_INVALID'; end if;
  if jsonb_typeof(coalesce(cur -> 'pay_rest_days', 'false'::jsonb)) <> 'boolean' then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'auto_deduction_cap_ratio')::numeric, 1) not between 0 and 1 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'absent_day_deduction_days')::numeric, 1) not between 0 and 3 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce(cur ->> 'auto_deduction_amount_mode', 'salary') not in ('salary', 'fixed') then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'fixed_absent_day_amount')::numeric, 0) < 0 or coalesce((cur ->> 'fixed_shortfall_minute_amount')::numeric, 0) < 0 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'max_auto_deduction_days_per_month')::numeric, 0) not between 0 and 31 then raise exception 'HR_POLICY_INVALID'; end if;
  if jsonb_typeof(cur -> 'deduction_tiers') <> 'array' or jsonb_array_length(cur -> 'deduction_tiers') = 0 then raise exception 'HR_TIERS_INVALID'; end if;
  for t in select * from jsonb_array_elements(cur -> 'deduction_tiers') loop
    i := i + 1;
    if (t ->> 'from')::int <> prev_to + 1 then raise exception 'HR_TIERS_INVALID'; end if;
    if (t ->> 'to') is not null then
      if (t ->> 'to')::int < (t ->> 'from')::int then raise exception 'HR_TIERS_INVALID'; end if;
      prev_to := (t ->> 'to')::int;
    elsif i <> jsonb_array_length(cur -> 'deduction_tiers') then raise exception 'HR_TIERS_INVALID'; end if;
    if (t ->> 'minutes') is null and (t ->> 'day_fraction') is null then raise exception 'HR_TIERS_INVALID'; end if;
  end loop;
  if (select (x ->> 'to') is not null from jsonb_array_elements(cur -> 'deduction_tiers') x offset (jsonb_array_length(cur -> 'deduction_tiers') - 1) limit 1) then raise exception 'HR_TIERS_INVALID'; end if;
  -- هل تغيّر شيء يؤثر في الاستقطاع المقترح لكل يوم؟ ⇒ يُعاد احتساب الشهر الجاري (غير المقفل) فوراً حتى لا تبقى أرقام قديمة في غرفة العمليات
  select bool_or(k in ('auto_deduction_enabled','deduct_absence_enabled','deduct_shortfall_enabled','deduct_unpaid_leave_enabled','deduction_tiers','absent_day_deduction_days','incomplete_punch_as_absent','grace_minutes_default','min_punch_gap_minutes','punch_window_auto_cap','punch_window_hours'))
    into v_reeval from jsonb_object_keys(p_patch) k;
  update public.hr_policy set settings = cur, updated_by = auth.uid(), updated_at = now() where id = 1;
  if coalesce(v_reeval, false) and not app.hr_month_locked(date_trunc('month', app.hr_local_date(now()))::date) then
    perform app.hr_evaluate_month(date_trunc('month', app.hr_local_date(now()))::date);
  end if;
  return cur;
end$$;

