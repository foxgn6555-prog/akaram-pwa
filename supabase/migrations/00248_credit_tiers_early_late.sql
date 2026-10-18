-- 00248 · شرائح احتساب الحضور المبكر والخروج المتأخر (إعداد واحد للجميع — وحدة الاستقطاعات التلقائية في التطوير المركزية)
--   المشكلة: المجيء المبكر كان يُحتسب 100% فائضاً ⇒ رصيد إجازة مكلف وقابل للاستغلال (من يأتي 07:00 لشفت 08:00 يجمع يومي إجازة شهرياً).
--   الحل: شرائح تدريجية قابلة للتخصيص لكلٍّ من المجيء المبكر والبقاء بعد النهاية:
--     [{"upto":15,"pct":100},{"upto":30,"pct":50}] ⇒ أول 15 دقيقة تُحتسب 100%، الدقائق 16–30 تُحتسب 50%، وما بعد آخر شريحة = 0 (لا يُحتسب).
--   الافتراضي: المجيء المبكر بلا شرائح (0% — لا يُحتسب) · الخروج المتأخر شريحة واحدة حتى 720 دقيقة 100% (كما كان).
--   القواعد الأخرى ثابتة: لا تعويض بين الأيام، المجيء المبكر لا يعوّض خروجاً مبكراً، البقاء يغطي تأخير اليوم نفسه 100% ثم يُحتسب الزائد بالشرائح.

create or replace function app.hr_credit_tiers_validate(t jsonb) returns void language plpgsql immutable as $$
declare x jsonb; prev int := 0; n int := 0;
begin
  if t is null or jsonb_typeof(t) <> 'array' then raise exception 'HR_CREDIT_TIERS_INVALID'; end if;
  for x in select * from jsonb_array_elements(t) loop
    n := n + 1;
    if n > 10 then raise exception 'HR_CREDIT_TIERS_INVALID'; end if;
    if jsonb_typeof(x -> 'upto') <> 'number' or jsonb_typeof(x -> 'pct') <> 'number' then raise exception 'HR_CREDIT_TIERS_INVALID'; end if;
    if (x ->> 'upto')::int <= prev or (x ->> 'upto')::int > 720 then raise exception 'HR_CREDIT_TIERS_INVALID'; end if;
    if (x ->> 'pct')::numeric not between 0 and 100 then raise exception 'HR_CREDIT_TIERS_INVALID'; end if;
    prev := (x ->> 'upto')::int;
  end loop;
end$$;

/** الاحتساب التدريجي: كل جزء من الدقائق بنسبة شريحته؛ ما بعد آخر شريحة = 0. الناتج مقرَّب لأقرب دقيقة. */
create or replace function app.hr_credit_tiered(p_minutes int, p_tiers jsonb) returns int language plpgsql immutable as $$
declare x jsonb; prev int := 0; acc numeric := 0; seg int; m int := greatest(0, coalesce(p_minutes, 0));
begin
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' then return 0; end if;
  for x in select * from jsonb_array_elements(p_tiers) loop
    seg := least(m, (x ->> 'upto')::int) - prev;
    if seg <= 0 then exit; end if;
    acc := acc + seg * (x ->> 'pct')::numeric / 100;
    prev := (x ->> 'upto')::int;
  end loop;
  return round(acc)::int;
end$$;

create or replace function app.hr_credit_tiers(p_kind text) returns jsonb language sql stable security definer set search_path = public, app as $$
  select case p_kind
    when 'early_in' then coalesce(app.hr_policy() -> 'early_in_credit_tiers', '[]'::jsonb)
    when 'late_out' then coalesce(app.hr_policy() -> 'late_out_credit_tiers', '[{"upto":720,"pct":100}]'::jsonb)
  end
$$;

create or replace function public.it_credit_tiers_get() returns jsonb language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['it_admin','super_admin','hr_officer','ops_room','deputy_director','executive_director','finance_officer']) then raise exception 'HR_FORBIDDEN'; end if;
  return jsonb_build_object('early_in', app.hr_credit_tiers('early_in'), 'late_out', app.hr_credit_tiers('late_out'));
end$$;
revoke all on function public.it_credit_tiers_get() from public, anon; grant execute on function public.it_credit_tiers_get() to authenticated;

/** حفظ الشرائح (التطوير المركزية فقط) + إعادة احتساب الشهر الحالي والسابق + سجل تدقيق */
create or replace function public.it_credit_tiers_set(p_early jsonb, p_late jsonb) returns jsonb language plpgsql security definer set search_path = public, app as $$
declare old jsonb; m date := date_trunc('month', current_date)::date;
begin
  perform app.require_it();
  perform app.hr_credit_tiers_validate(p_early); perform app.hr_credit_tiers_validate(p_late);
  old := public.it_credit_tiers_get();
  update public.hr_policy set settings = settings || jsonb_build_object('early_in_credit_tiers', p_early, 'late_out_credit_tiers', p_late), updated_at = now(), updated_by = auth.uid() where id = 1;
  insert into public.hr_deduction_rule_audit (action, rule_id, before, after, actor)
  values ('rule_save', null, jsonb_build_object('credit_tiers', old), jsonb_build_object('credit_tiers', jsonb_build_object('early_in', p_early, 'late_out', p_late)), auth.uid());
  -- إعادة احتساب الشهر الحالي والسابق (غير المقفلين) كي تنعكس النسب فوراً
  perform app.hr_evaluate_month((m - interval '1 month')::date); perform app.hr_evaluate_month(m);
  return public.it_credit_tiers_get();
end$$;
revoke all on function public.it_credit_tiers_set(jsonb, jsonb) from public, anon; grant execute on function public.it_credit_tiers_set(jsonb, jsonb) to authenticated;

-- ── المحرّك اليومي (نسخة 00218 + الشرائح) ──
create or replace function app.hr_compute_day_metrics(p_employee uuid, p_date date) returns void
language plpgsql security definer set search_path = public, app as $$
declare a record; v_req int := 0; v_permit int := 0; v_permit_unpaid int := 0; v_short int := 0; v_ot int := 0; v_min int := 0; v_days numeric := 0; v_reason text := null;
        lt record; v_ot_block int := app.hr_policy_int('overtime_min_block_minutes', 30); v_grace int; rl jsonb; v_missing int;
        v_on boolean; v_abs boolean; v_sf_on boolean; v_ul boolean;
begin
  select * into a from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  if not found then return; end if;
  rl := app.hr_deduction_rule_for(p_employee, p_date);
  v_on := coalesce((rl ->> 'auto_deduction_enabled')::boolean, true); v_abs := coalesce((rl ->> 'deduct_absence_enabled')::boolean, true);
  v_sf_on := coalesce((rl ->> 'deduct_shortfall_enabled')::boolean, true); v_ul := coalesce((rl ->> 'deduct_unpaid_leave_enabled')::boolean, true);
  if a.expected_in is not null and a.expected_out is not null then v_req := floor(extract(epoch from (a.expected_out - a.expected_in)) / 60)::int; end if;
  select coalesce(sum(l.minutes) filter (where t.is_paid), 0), coalesce(sum(l.minutes) filter (where not t.is_paid), 0) into v_permit, v_permit_unpaid
  from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
  where l.employee_id = p_employee and l.status = 'approved' and l.kind = 'time_permit' and l.start_date = p_date;
  select t.* into lt from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
  where l.employee_id = p_employee and l.status = 'approved' and l.kind = 'leave' and p_date between l.start_date and l.end_date
  order by t.is_paid desc limit 1;   -- إن تداخلت إجازتان تُقدَّم المدفوعة (لا يُستقطع من موظف لديه إجازة مدفوعة معتمدة)

  if a.status = 'leave' then
    v_short := 0; v_permit := 0;
    if lt.id is not null and not lt.is_paid and not a.is_rest_day and v_req > 0 and v_on and v_ul then v_days := lt.deduction_days_per_day; v_reason := lt.name; end if;
  elsif a.is_rest_day or v_req = 0 then
    v_short := 0; v_permit := 0;
  elsif a.status = 'absent' then
    v_short := v_req; v_permit := 0;
    if v_on and v_abs then v_days := coalesce((rl ->> 'absent_day_deduction_days')::numeric, 1); v_reason := 'غياب بلا إجازة معتمدة'; end if;
  elsif a.status = 'incomplete' then
    v_short := 0;
    if v_on and v_abs and coalesce((rl ->> 'incomplete_punch_as_absent')::boolean, false) then v_days := coalesce((rl ->> 'absent_day_deduction_days')::numeric, 1); v_reason := 'بصمة ناقصة تُعامل كغياب'; end if;
  else
    -- الزمنية المدفوعة تغطي الدقائق الناقصة فعلاً فقط (داوم كاملاً رغم الزمنية ⇒ لا تُحتسب وقتاً إضافياً)
    v_missing := greatest(0, v_req - a.worked_minutes);
    v_short := greatest(0, v_missing - v_permit);
    if v_short > 0 and v_on and v_sf_on then
      select o_minutes, o_days into v_min, v_days from app.hr_shortfall_for_rule(rl, v_short, v_req);
      if v_min > 0 or v_days > 0 then
        v_reason := 'نقص ' || v_short || ' دقيقة عن ساعات الشفت';
        if v_permit_unpaid > 0 then v_reason := v_reason || ' — منها زمنية غير مدفوعة ' || least(v_permit_unpaid, v_short) || ' د'; end if;
      end if;
    end if;
    if app.hr_policy_bool('overtime_enabled', true) and a.check_out is not null and a.expected_out is not null and v_short = 0 then
      -- 00248: الوقت الإضافي خارج بنك الساعات يخضع للشرائح نفسها (مجيء مبكر/بقاء بعد النهاية)
      v_ot := app.hr_credit_tiered(case when a.check_in is not null and a.expected_in is not null then greatest(0, floor(extract(epoch from (a.expected_in - a.check_in)) / 60)::int) else 0 end, app.hr_credit_tiers('early_in'))
            + app.hr_credit_tiered(greatest(0, floor(extract(epoch from (a.check_out - a.expected_out)) / 60)::int), app.hr_credit_tiers('late_out'));
      if v_ot < v_ot_block then v_ot := 0; end if;
    end if;
  end if;
  v_grace := coalesce((rl ->> 'grace_minutes_default')::int, 15);
  if a.status in ('present', 'late', 'early_leave', 'time_permit') and v_short <= v_grace then v_min := 0; v_days := 0; v_reason := null; end if;
  -- 00218: بنك الساعات — قاعدة اليوم الواحد (لا تعويض بين الأيام):
  --   نقص اليوم = max(0, التأخير فوق السماحية − البقاء بعد نهاية الشفت في نفس اليوم) + الخروج المبكر − الزمنية المدفوعة
  --   فائض اليوم = ما زاد من البقاء بعد تغطية تأخير اليوم + المجيء المبكر  ⇒ رصيد إجازة شهرياً (دقائق الشفت = يوم) بسقف
  --   التأخير ضمن السماحية = صفر؛ فوقها تُحتسب كل دقائقه. الاستقطاع المقترح لليوم = نقصه (يُجمع شهرياً × أجر الدقيقة).
  if coalesce(rl ->> 'shortfall_method', 'tiers') = 'hour_bank' and a.status in ('present', 'late', 'early_leave', 'time_permit')
     and not a.is_rest_day and a.expected_in is not null and a.expected_out is not null and a.check_in is not null and a.check_out is not null then
    declare v_late_raw int := greatest(0, floor(extract(epoch from (a.check_in - a.expected_in)) / 60)::int);
            v_early_in int := greatest(0, floor(extract(epoch from (a.expected_in - a.check_in)) / 60)::int);
            v_early_out int := greatest(0, floor(extract(epoch from (a.expected_out - a.check_out)) / 60)::int);
            v_extra int := greatest(0, floor(extract(epoch from (a.check_out - a.expected_out)) / 60)::int);
            v_late_eff int; v_sf int; v_sur int;
    begin
      v_late_eff := case when v_late_raw <= v_grace then 0 else v_late_raw end;
      v_sf := greatest(0, greatest(0, v_late_eff - v_extra) + v_early_out - v_permit);
      -- 00248: الفائض بالشرائح — البقاء يغطي تأخير اليوم 100% أولاً، ثم الزائد والمجيء المبكر كلٌّ بشرائحه (ما بعد آخر شريحة = 0)
      v_sur := app.hr_credit_tiered(greatest(0, v_extra - v_late_eff), app.hr_credit_tiers('late_out')) + app.hr_credit_tiered(v_early_in, app.hr_credit_tiers('early_in'));
      v_short := v_sf; v_ot := v_sur; v_days := 0;
      v_min := case when v_on and v_sf_on then v_sf else 0 end;
      v_reason := case when v_sf > 0 then 'نقص ' || v_sf || ' دقيقة (تأخير ' || v_late_eff || ' − بقاء ' || least(v_extra, v_late_eff) || ' + خروج مبكر ' || v_early_out || case when v_permit > 0 then ' − زمنية ' || v_permit else '' end || ') — بنك الساعات' else null end;
    end;
  end if;
  if v_reason is not null and (rl ->> '_source') <> 'default' then v_reason := v_reason || ' (' || (rl ->> '_rule_name') || ')'; end if;

  -- 00202: نموذج «الأيام المستحقة» — الغياب/الإجازة غير المدفوعة/البصمة الناقصة المعاملة كغياب أيامٌ غير مدفوعة أصلاً، لا استقطاع مقترح عليها
  --   (حتى ترى غرفة العمليات نفس ما ستراه المالية؛ يبقى السبب للعلم بوسم «يوم غير مدفوع»)
  if coalesce(app.hr_policy() ->> 'salary_model', 'earned_days') = 'earned_days'
     and (select coalesce(sp.pay_type, 'monthly') from public.employee_salary_profiles sp where sp.employee_id = p_employee and sp.status = 'defined') is distinct from 'daily'
     and a.status in ('absent', 'leave', 'incomplete') and v_days > 0 then
    v_days := 0; v_min := 0; v_reason := v_reason || ' — يوم غير مدفوع (لا يدخل الراتب)';
  end if;
  update public.hr_attendance_days set required_minutes = v_req, permit_minutes = v_permit, shortfall_minutes = v_short, overtime_minutes = v_ot,
    proposed_deduction_minutes = v_min, proposed_deduction_days = v_days, deduction_reason = v_reason
  where employee_id = p_employee and work_date = p_date;
end$$;
