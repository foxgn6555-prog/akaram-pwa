-- 00202 · تدقيق السلسلة (البصمة → المالية) ①: محاكاة الاستقطاعات في وحدة التطوير المركزية تطابق محرّك التصدير الفعلي
--   · قبل هذا: المحاكاة قسمت الراتب على 30 ثابتاً وخصمت الغياب، بينما التصدير (00201) يستعمل الأساسي ÷ أيام الشهر الفعلية ولا يخصم الغياب (غير مدفوع أصلاً)
--   · الآن: it_deduction_simulate / it_deduction_simulate_v2 تقرآن salary_model من السياسة؛ تُرجعان salary_model و days_in_month و unpaid_days_amount
--   · الحالة (p_case) تقبل month اختيارياً لاحتساب أيام الشهر المطلوب
--   ② app.hr_incomplete_payable: البصمة الناقصة تُدفع إلا إذا كانت قاعدة الموظف تعاملها كغياب (كانت تُدفع دائماً في 00201)
--   ③ hr_compute_day_metrics: في نموذج الأيام المستحقة لا «استقطاع مقترح» على الغياب/الإجازة غير المدفوعة/البصمة الناقصة (أيام غير مدفوعة أصلاً) — السبب يبقى للعلم
--   ④ ops_month_export / finance_payroll_reconcile: الأيام المستحقة تحترم ②

create or replace function public.it_deduction_simulate(p_settings jsonb, p_shortfall int, p_shift_minutes int default 480, p_base_salary numeric default 0, p_absent_days int default 0, p_incomplete_days int default 0) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare s jsonb := app.hr_deduction_defaults() || coalesce(p_settings, '{}'::jsonb); mins int := 0; dys numeric := 0; v_abs numeric := 0; v_inc numeric := 0;
        day_rate numeric; minute_rate numeric; amount numeric; v_mode text := coalesce(s ->> 'auto_deduction_amount_mode', 'salary'); on_ boolean := coalesce((s ->> 'auto_deduction_enabled')::boolean, true);
        v_model text := coalesce(app.hr_policy() ->> 'salary_model', 'earned_days'); v_dim int := extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))::int;
begin
  if not app.has_role(array['it_admin', 'ops_room', 'hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if on_ and coalesce((s ->> 'deduct_shortfall_enabled')::boolean, true) and coalesce(p_shortfall, 0) > coalesce((s ->> 'grace_minutes_default')::int, 15) then
    select o_minutes, o_days into mins, dys from app.hr_shortfall_for_rule(s, p_shortfall, p_shift_minutes);
  end if;
  if on_ and coalesce((s ->> 'deduct_absence_enabled')::boolean, true) then
    v_abs := coalesce(p_absent_days, 0) * coalesce((s ->> 'absent_day_deduction_days')::numeric, 1);
    if coalesce((s ->> 'incomplete_punch_as_absent')::boolean, false) then v_inc := coalesce(p_incomplete_days, 0) * coalesce((s ->> 'absent_day_deduction_days')::numeric, 1); end if;
  end if;
  -- 00202: نموذج الأيام المستحقة ⇒ الغياب/البصمة الناقصة غير مدفوعة أصلاً (ليست استقطاعاً) وأجر اليوم = الأساسي ÷ أيام الشهر
  if v_model = 'earned_days' then v_abs := 0; v_inc := 0; end if;
  day_rate := case when v_model = 'earned_days' then round(coalesce(p_base_salary, 0) / v_dim, 4) else round(coalesce(p_base_salary, 0) / 30, 4) end; minute_rate := round(day_rate / greatest(p_shift_minutes, 1), 4);
  amount := case when not on_ then 0 when v_mode = 'fixed' then round(coalesce((s ->> 'fixed_shortfall_minute_amount')::numeric, 0) * mins + coalesce((s ->> 'fixed_absent_day_amount')::numeric, 0) * (dys + v_abs + v_inc), 2)
                 else round(minute_rate * mins + day_rate * (dys + v_abs + v_inc), 2) end;
  return jsonb_build_object('enabled', on_, 'minutes', mins, 'days', dys + v_abs + v_inc, 'shortfall_days', dys, 'absent_days', v_abs, 'incomplete_days', v_inc,
    'amount_mode', v_mode, 'day_rate', day_rate, 'minute_rate', minute_rate, 'amount', amount, 'method', coalesce(s ->> 'shortfall_method', 'tiers'), 'salary_model', v_model, 'days_in_month', v_dim);
end$$;

create or replace function public.it_deduction_simulate_v2(p_settings jsonb, p_case jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare s jsonb := app.hr_deduction_defaults() || coalesce(p_settings, '{}'::jsonb); c jsonb := coalesce(p_case, '{}'::jsonb);
        on_ boolean := coalesce((s ->> 'auto_deduction_enabled')::boolean, true);
        v_mode text := coalesce(s ->> 'auto_deduction_amount_mode', 'salary'); v_method text := coalesce(s ->> 'shortfall_method', 'tiers');
        v_shift int := greatest(60, coalesce((c ->> 'shift_minutes')::int, 480)); v_salary numeric := greatest(0, coalesce((c ->> 'base_salary')::numeric, 0));
        v_pay text := coalesce(c ->> 'pay_type', 'monthly');
        v_late int := greatest(0, coalesce((c ->> 'late_minutes')::int, 0)); v_early int := greatest(0, coalesce((c ->> 'early_minutes')::int, 0));
        v_pp int := greatest(0, coalesce((c ->> 'paid_permit_minutes')::int, 0)); v_up int := greatest(0, coalesce((c ->> 'unpaid_permit_minutes')::int, 0));
        v_absent int := greatest(0, coalesce((c ->> 'absent_days')::int, 0)); v_inc int := greatest(0, coalesce((c ->> 'incomplete_days')::int, 0));
        v_ul int := greatest(0, coalesce((c ->> 'unpaid_leave_days')::int, 0)); v_pl int := greatest(0, coalesce((c ->> 'paid_leave_days')::int, 0));
        v_ul_per numeric := greatest(0, coalesce((c ->> 'leave_deduction_days_per_day')::numeric, 1));
        v_grace int := coalesce((s ->> 'grace_minutes_default')::int, 15); v_abs_days numeric := coalesce((s ->> 'absent_day_deduction_days')::numeric, 1);
        v_missing int; v_cover int; v_short int; v_min int := 0; v_dfrac numeric := 0; v_note text; v_status text;
        d_abs numeric := 0; d_inc numeric := 0; d_ul numeric := 0; day_rate numeric; minute_rate numeric;
        amt_short numeric := 0; amt_abs numeric := 0; amt_inc numeric := 0; amt_ul numeric := 0; amt_total numeric := 0; v_cap_days numeric; v_cap_ratio numeric; v_gross numeric; v_capped boolean := false;
        steps jsonb := '[]'::jsonb; ladder jsonb := '[]'::jsonb; p int; lm int; ld numeric; lamt numeric;
        v_model text := coalesce(app.hr_policy() ->> 'salary_model', 'earned_days');
        v_month date := coalesce(nullif(c ->> 'month', '')::date, date_trunc('month', current_date)::date); v_dim int; v_earned boolean;
begin
  if not app.has_role(array['it_admin', 'ops_room', 'hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  v_month := date_trunc('month', v_month)::date; v_dim := extract(day from (v_month + interval '1 month - 1 day'))::int;
  v_earned := v_pay = 'monthly' and v_model = 'earned_days';
  -- 00202: نفس أجر اليوم الذي يستعمله التصدير الفعلي (الأيام المستحقة: الأساسي ÷ أيام الشهر الفعلية)
  day_rate := case when v_earned then round(v_salary / v_dim, 4) else round(v_salary / 30, 4) end; minute_rate := round(day_rate / v_shift, 4);
  if v_pay = 'daily' then day_rate := v_salary; minute_rate := round(v_salary / v_shift, 4); end if;

  -- خطوة 1: أجر اليوم والدقيقة
  if v_mode = 'fixed' then
    steps := steps || jsonb_build_object('key', 'rates', 'title', 'أساس المبلغ: مبالغ ثابتة', 'text', format('كل يوم استقطاع = %s د.ع، وكل دقيقة نقص = %s د.ع (بغضّ النظر عن الراتب).', coalesce((s ->> 'fixed_absent_day_amount')::numeric, 0), coalesce((s ->> 'fixed_shortfall_minute_amount')::numeric, 0)));
  elsif v_pay = 'daily' then
    steps := steps || jsonb_build_object('key', 'rates', 'title', 'أساس المبلغ: أجر يومي', 'text', format('أجر اليوم = %s د.ع؛ أجر الدقيقة = أجر اليوم ÷ دقائق الشفت (%s) = %s د.ع.', v_salary, v_shift, minute_rate));
  elsif v_earned then
    steps := steps || jsonb_build_object('key', 'rates', 'title', 'أساس المبلغ: من الراتب الشهري (نموذج الأيام المستحقة)', 'text', format('أجر اليوم = الراتب الأساسي %s ÷ أيام الشهر %s = %s د.ع؛ أجر الدقيقة = أجر اليوم ÷ دقائق الشفت (%s) = %s د.ع. الراتب يُحتسب أصلاً عن الأيام المستحقة فقط (حضور + إجازة مدفوعة)، فالغياب لا يُستقطع بل لا يُدفع.', v_salary, v_dim, day_rate, v_shift, minute_rate));
  else
    steps := steps || jsonb_build_object('key', 'rates', 'title', 'أساس المبلغ: من الراتب الشهري', 'text', format('أجر اليوم = الراتب الأساسي %s ÷ 30 = %s د.ع؛ أجر الدقيقة = أجر اليوم ÷ دقائق الشفت (%s) = %s د.ع.', v_salary, day_rate, v_shift, minute_rate));
  end if;

  -- خطوة 2: الزمنيات والنقص
  v_missing := v_late + v_early;
  v_cover := least(v_pp, v_missing);
  v_short := greatest(0, v_missing - v_cover);
  steps := steps || jsonb_build_object('key', 'shortfall', 'title', 'نقص الدقائق في اليوم',
    'text', format('التأخر %s د + الخروج المبكر %s د = %s د ناقصة. الزمنية المدفوعة المعتمدة تغطي %s د منها%s ⇒ النقص الذي يُحاسَب عليه = %s د.',
      v_late, v_early, v_missing, v_cover, case when v_up > 0 then format(' (الزمنية غير المدفوعة %s د لا تغطي شيئاً وتبقى نقصاً)', v_up) else '' end, v_short));
  if v_missing = 0 then v_status := 'present';
  elsif v_short = 0 then v_status := 'time_permit';
  elsif v_late > 0 then v_status := 'late'; else v_status := 'early_leave'; end if;

  -- خطوة 3: السماحية والطريقة
  if not on_ then
    steps := steps || jsonb_build_object('key', 'method', 'title', 'الاستقطاع التلقائي متوقف في هذه القاعدة', 'text', 'لا يُقترح أي استقطاع؛ تبقى الأرقام للعلم فقط.');
  elsif not coalesce((s ->> 'deduct_shortfall_enabled')::boolean, true) then
    steps := steps || jsonb_build_object('key', 'method', 'title', 'استقطاع نقص الدقائق متوقف', 'text', 'النقص يُسجَّل في الحضور لكنه لا يُستقطع.');
  elsif v_short = 0 then
    steps := steps || jsonb_build_object('key', 'method', 'title', 'لا نقص', 'text', case when v_cover > 0 then 'الزمنية المدفوعة غطّت كل الدقائق الناقصة ⇒ الحالة «حاضر (زمنية)» ولا استقطاع.' else 'لا تأخر ولا خروج مبكر ⇒ لا استقطاع.' end);
  elsif v_short <= v_grace then
    steps := steps || jsonb_build_object('key', 'method', 'title', 'ضمن السماحية اليومية', 'text', format('النقص %s د ≤ السماحية %s د ⇒ لا استقطاع.', v_short, v_grace));
  else
    select o_minutes, o_days, o_note into v_min, v_dfrac, v_note from app.hr_shortfall_for_rule(s, v_short, v_shift);
    steps := steps || jsonb_build_object('key', 'method', 'title', 'طريقة احتساب النقص: ' || case v_method when 'tiers' then 'الشرائح' when 'actual' then 'دقيقة بدقيقة' when 'multiplier' then 'دقيقة بدقيقة × مضاعف' else 'كتل زمنية' end,
      'text', format('النقص %s د > السماحية %s د. %s ⇒ %s.', v_short, v_grace, v_note, case when v_dfrac > 0 then v_dfrac || ' يوم' else v_min || ' دقيقة' end));
  end if;

  -- خطوة 4: الغياب/البصمة الناقصة/الإجازات
  if on_ and coalesce((s ->> 'deduct_absence_enabled')::boolean, true) then
    d_abs := v_absent * v_abs_days;
    if coalesce((s ->> 'incomplete_punch_as_absent')::boolean, false) then d_inc := v_inc * v_abs_days; end if;
  end if;
  if on_ and coalesce((s ->> 'deduct_unpaid_leave_enabled')::boolean, true) then d_ul := v_ul * v_ul_per; end if;
  if v_earned then
    -- 00202: في نموذج الأيام المستحقة لا يوجد استقطاع عن الغياب/البصمة الناقصة/الإجازة غير المدفوعة — هذه الأيام غير مدفوعة من الأساس
    d_abs := 0; d_inc := 0; d_ul := 0;
    steps := steps || jsonb_build_object('key', 'days', 'title', 'الأيام (نموذج الأيام المستحقة)',
      'text', format('غياب بلا إجازة %s يوم، بصمة ناقصة %s يوم، إجازة غير مدفوعة %s يوم ⇒ لا تُستقطع، لأنها غير مدفوعة أصلاً: الراتب = أجر اليوم × (الحضور + الإجازة المدفوعة %s يوم). الأيام غير المدفوعة هذا الشهر تساوي %s د.ع لا تدخل الراتب.',
        v_absent, v_inc, v_ul, v_pl, round(day_rate * (v_absent + v_inc + v_ul), 2)));
  else
  steps := steps || jsonb_build_object('key', 'days', 'title', 'الأيام',
    'text', format('غياب بلا إجازة %s يوم × %s = %s يوم. بصمة ناقصة %s يوم ⇒ %s. إجازة غير مدفوعة %s يوم × %s = %s يوم. إجازة مدفوعة %s يوم ⇒ لا استقطاع وتُحتسب أياماً مدفوعة.',
      v_absent, v_abs_days, d_abs, v_inc, case when d_inc > 0 then d_inc || ' يوم (تُعامل كغياب)' else 'لا استقطاع (تُدقَّق يدوياً)' end, v_ul, v_ul_per, d_ul, v_pl));
  end if;

  -- خطوة 5: المبالغ والسقوف
  if on_ then
    if v_mode = 'fixed' then
      amt_short := coalesce((s ->> 'fixed_shortfall_minute_amount')::numeric, 0) * v_min + coalesce((s ->> 'fixed_absent_day_amount')::numeric, 0) * v_dfrac;
      amt_abs := coalesce((s ->> 'fixed_absent_day_amount')::numeric, 0) * d_abs; amt_inc := coalesce((s ->> 'fixed_absent_day_amount')::numeric, 0) * d_inc; amt_ul := coalesce((s ->> 'fixed_absent_day_amount')::numeric, 0) * d_ul;
    else
      amt_short := minute_rate * v_min + day_rate * v_dfrac; amt_abs := day_rate * d_abs; amt_inc := day_rate * d_inc; amt_ul := day_rate * d_ul;
    end if;
  end if;
  amt_total := round(amt_short + amt_abs + amt_inc + amt_ul, 2);
  v_cap_days := coalesce((s ->> 'max_auto_deduction_days_per_month')::numeric, 0); v_cap_ratio := coalesce((s ->> 'auto_deduction_cap_ratio')::numeric, 1);
  v_gross := case when v_pay = 'daily' then v_salary * v_dim else v_salary end;
  if v_mode <> 'fixed' and v_cap_days > 0 and amt_total > round(day_rate * v_cap_days, 2) then amt_total := round(day_rate * v_cap_days, 2); v_capped := true; end if;
  if v_mode <> 'fixed' and v_cap_ratio < 1 and amt_total > round(v_gross * v_cap_ratio, 2) then amt_total := round(v_gross * v_cap_ratio, 2); v_capped := true; end if;
  steps := steps || jsonb_build_object('key', 'amount', 'title', 'المبلغ المقترح',
    'text', format('نقص %s + غياب %s + بصمة ناقصة %s + إجازة غير مدفوعة %s = %s د.ع%s. هذا اقتراح يُدقَّق ويُؤكَّد في غرفة العمليات قبل أن يصل إلى المالية.',
      round(amt_short, 2), round(amt_abs, 2), round(amt_inc, 2), round(amt_ul, 2), amt_total, case when v_capped then ' (بعد تطبيق سقف القاعدة)' else '' end));

  -- سلّم النقص: كم يُستقطع عند كل قيمة
  foreach p in array array[5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240] loop
    if not on_ or not coalesce((s ->> 'deduct_shortfall_enabled')::boolean, true) or p <= v_grace then lm := 0; ld := 0;
    else select o_minutes, o_days into lm, ld from app.hr_shortfall_for_rule(s, p, v_shift); end if;
    lamt := case when not on_ then 0 when v_mode = 'fixed' then round(coalesce((s ->> 'fixed_shortfall_minute_amount')::numeric, 0) * lm + coalesce((s ->> 'fixed_absent_day_amount')::numeric, 0) * ld, 2) else round(minute_rate * lm + day_rate * ld, 2) end;
    ladder := ladder || jsonb_build_object('shortfall', p, 'minutes', lm, 'days', ld, 'amount', lamt, 'within_grace', p <= v_grace);
  end loop;

  return jsonb_build_object('enabled', on_, 'method', v_method, 'amount_mode', v_mode, 'status', v_status,
    'missing_minutes', v_missing, 'covered_minutes', v_cover, 'shortfall_minutes', v_short, 'grace_minutes', v_grace,
    'minutes', v_min, 'shortfall_days', v_dfrac, 'absent_days', d_abs, 'incomplete_days', d_inc, 'unpaid_leave_days', d_ul, 'paid_leave_days', v_pl,
    'days', v_dfrac + d_abs + d_inc + d_ul, 'day_rate', day_rate, 'minute_rate', minute_rate, 'salary_model', case when v_pay = 'daily' then 'daily' else v_model end, 'days_in_month', v_dim, 'unpaid_days_amount', case when v_earned then round(day_rate * (v_absent + v_inc + v_ul), 2) else 0 end,
    'amount_shortfall', round(amt_short, 2), 'amount_absence', round(amt_abs, 2), 'amount_incomplete', round(amt_inc, 2), 'amount_unpaid_leave', round(amt_ul, 2),
    'amount', amt_total, 'capped', v_capped, 'steps', steps, 'ladder', ladder);
end$$;

-- ── 00202 ②: هل تُدفع البصمة الناقصة لهذا الموظف؟ (عكس incomplete_punch_as_absent في قاعدة الاستقطاع الفعّالة له) ──
create or replace function app.hr_incomplete_payable(p_employee uuid, p_month date) returns boolean
language sql stable security definer set search_path = public, app as $$
  select not coalesce((app.hr_deduction_rule_for(p_employee, p_month) ->> 'incomplete_punch_as_absent')::boolean, false)
$$;

-- ── 00202 ③: الاستقطاع المقترح على مستوى اليوم يطابق النموذج (غرفة العمليات ترى ما ستراه المالية) ──
create or replace function app.hr_compute_day_metrics(p_employee uuid, p_date date) returns void
language plpgsql security definer set search_path = public, app as $$
declare a record; v_req int := 0; v_permit int := 0; v_permit_unpaid int := 0; v_short int := 0; v_ot int := 0; v_min int := 0; v_days numeric := 0; v_reason text := null;
        lt record; v_ot_block int := app.hr_policy_int('overtime_min_block_minutes', 30); v_grace int; rl jsonb; v_missing int;
        v_on boolean; v_abs boolean; v_sf boolean; v_ul boolean;
begin
  select * into a from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  if not found then return; end if;
  rl := app.hr_deduction_rule_for(p_employee, p_date);
  v_on := coalesce((rl ->> 'auto_deduction_enabled')::boolean, true); v_abs := coalesce((rl ->> 'deduct_absence_enabled')::boolean, true);
  v_sf := coalesce((rl ->> 'deduct_shortfall_enabled')::boolean, true); v_ul := coalesce((rl ->> 'deduct_unpaid_leave_enabled')::boolean, true);
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
    if v_short > 0 and v_on and v_sf then
      select o_minutes, o_days into v_min, v_days from app.hr_shortfall_for_rule(rl, v_short, v_req);
      if v_min > 0 or v_days > 0 then
        v_reason := 'نقص ' || v_short || ' دقيقة عن ساعات الشفت';
        if v_permit_unpaid > 0 then v_reason := v_reason || ' — منها زمنية غير مدفوعة ' || least(v_permit_unpaid, v_short) || ' د'; end if;
      end if;
    end if;
    if app.hr_policy_bool('overtime_enabled', true) and a.check_out is not null and a.expected_out is not null and v_short = 0 then
      v_ot := greatest(0, a.worked_minutes - v_req);
      if v_ot < v_ot_block then v_ot := 0; end if;
    end if;
  end if;
  v_grace := coalesce((rl ->> 'grace_minutes_default')::int, 15);
  if a.status in ('present', 'late', 'early_leave', 'time_permit') and v_short <= v_grace then v_min := 0; v_days := 0; v_reason := null; end if;
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

-- ── 00202 ④ ──
create or replace function public.ops_month_export(p_month date)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; v_id uuid; v_ver int; n int; n_eval int;
        v_basis text := coalesce(app.hr_policy() ->> 'salary_day_basis', 'fixed_30');
        v_prorate boolean := app.hr_policy_bool('prorate_partial_month', true);
        v_prorate_allow boolean := app.hr_policy_bool('prorate_allowances', true);
        v_model text := coalesce(app.hr_policy() ->> 'salary_model', 'earned_days');
        v_pay_rest boolean := app.hr_policy_bool('pay_rest_days', false);
        m_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
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
    auto_deduction_basis, auto_deduction_days_capped, auto_deduction_rule, days_rest, salary_model,
    pay_type, base_salary, daily_rate, allowances_total, fixed_deductions_total, proposed_net, final_net)
  select v_id, e.id, e.employee_number, e.full_name, d.name, b.name, e.job_title, e.contract_type,
    s.working_days, s.days_present, s.days_late, s.days_absent, s.days_incomplete, s.days_leave, s.late_minutes, s.early_minutes,
    s.ded_amount, s.ded_days, s.ded_reasons,
    s.auto_minutes, case when sp.pay_type = 'daily' or v_model = 'earned_days' then s.auto_days_shortfall else s.auto_days end, s.shift_minutes, s.overtime_minutes, s.shortfall_minutes, calc.auto_amount,
    s.days_leave_paid, s.days_leave_unpaid, s.auto_days_absence, s.auto_days_shortfall, calc.ops_days_amount, calc.payable_days, calc.gross, calc.deductions,
    s.scheduled_days, s.unevaluated_days, per.period_from, per.period_to, per.covered_days, per.days_in_month, calc.day_rate, calc.ratio, calc.capped,
    case when not rl.auto_on then 'disabled' else rl.mode end, calc.days_capped, rl.rule_name, rs.days_rest, case when sp.pay_type = 'daily' then 'daily' else v_model end,
    sp.pay_type, sp.base_salary, sp.daily_rate, calc.allow, fd.total, calc.net, calc.net
  from public.employees e
  join app.hr_month_summary(m) s on s.employee_id = e.id
  join app.hr_month_period(m) per on per.employee_id = e.id
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  left join public.employee_salary_profiles sp on sp.employee_id = e.id and sp.status = 'defined'
  -- 00201: أيام الراحة المجدولة (تُدفع فقط إن فعّلت وحدة التطوير «pay_rest_days»)
  cross join lateral (select count(*)::int as days_rest from public.hr_attendance_days a where a.employee_id = e.id and a.is_rest_day and a.work_date between m and m_to) rs
  -- 00201: الأيام المستحقة = حضور (بما فيه البصمة الناقصة التي تُعدّ حاضراً) + إجازة مدفوعة من الرصيد (+ راحة إن فُعّلت)
  -- 00202: البصمة الناقصة تُدفع إلا إذا قالت قاعدة الموظف «تُعامل كغياب» (incomplete_punch_as_absent) — نفس القاعدة التي يراها الحضور
  cross join lateral (select (s.days_present + case when app.hr_incomplete_payable(e.id, m) then s.days_incomplete else 0 end + s.days_leave_paid + case when v_pay_rest then rs.days_rest else 0 end)::numeric as payable_days) pdx
  -- 00195: قاعدة الاستقطاع الفعّالة لكل موظف (وحدة الاستقطاعات التلقائية في التطوير المركزية: نطاق فرع/قسم/موظف + استثناءات)
  cross join lateral (
    select coalesce((j ->> 'auto_deduction_enabled')::boolean, true) as auto_on, coalesce(j ->> 'auto_deduction_amount_mode', 'salary') as mode,
           coalesce((j ->> 'fixed_absent_day_amount')::numeric, 0) as fix_day, coalesce((j ->> 'fixed_shortfall_minute_amount')::numeric, 0) as fix_min,
           coalesce((j ->> 'max_auto_deduction_days_per_month')::numeric, 0) as max_days, coalesce((j ->> 'auto_deduction_cap_ratio')::numeric, 1) as cap,
           j ->> '_rule_name' as rule_name
    from app.hr_deduction_rule_for(e.id, m) j) rl
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
               when sp.pay_type = 'daily' then round(rl.cap * (sp.daily_rate * r.payable_days + r.allow), 2)
               else round(rl.cap * (r.base_due + r.allow), 2) end as auto_cap
        from (
          select rates.day_rate, rates.ratio, dd.auto_days_eff, dd.days_capped,
            case when sp.pay_type = 'daily' or v_model = 'earned_days' then pdx.payable_days else null end as payable_days,
            case when sp.pay_type = 'daily' then 0
                 -- نموذج الأيام المستحقة: الأساسي ÷ أيام الشهر × الأيام المستحقة (لا يتجاوز الأساسي)
                 when v_model = 'earned_days' then least(sp.base_salary, round(rates.day_rate * pdx.payable_days, 2))
                 when per.full_month or not v_prorate then sp.base_salary
                 else least(sp.base_salary, round(rates.day_rate * per.covered_days, 2)) end as base_due,
            case when sp.pay_type = 'monthly' and v_model = 'earned_days' then (case when v_prorate_allow then round(al.total * rates.ratio, 2) else al.total end)
                 when sp.pay_type = 'monthly' and v_prorate and v_prorate_allow and not per.full_month then round(al.total * rates.ratio, 2) else al.total end as allow,
            -- مبلغ الاستقطاع التلقائي: متوقف ⇒ 0 · salary ⇒ أجر الدقيقة/اليوم من الراتب · fixed ⇒ مبالغ ثابتة من السياسة
            case when not rl.auto_on then 0
                 when rl.mode = 'fixed' then round(rl.fix_min * s.auto_minutes + rl.fix_day * dd.auto_days_eff, 2)
                 else round(rates.minute_rate * s.auto_minutes + rates.day_rate * dd.auto_days_eff, 2) end as auto_raw,
            round(rates.day_rate * s.ded_days, 2) as ops_days_amount
          from (
            select dr.day_rate,
              case when sp.employee_id is null then 0 when sp.pay_type = 'daily' then round(sp.daily_rate / greatest(s.shift_minutes, 1), 4) else round(dr.day_rate / greatest(s.shift_minutes, 1), 4) end as minute_rate,
              case when sp.pay_type = 'daily' or sp.employee_id is null or sp.base_salary = 0 then 1
                   -- نسبة الاستحقاق في نموذج الأيام المستحقة = الأيام المستحقة ÷ أيام الشهر (تُستخدم للمخصصات)
                   when v_model = 'earned_days' then least(1, round(pdx.payable_days / per.days_in_month, 6))
                   when per.full_month or not v_prorate then 1
                   else least(1, round(least(sp.base_salary, dr.day_rate * per.covered_days) / sp.base_salary, 6)) end as ratio
            from (select case when sp.employee_id is null then 0
                              when sp.pay_type = 'daily' then sp.daily_rate
                              when v_basis = 'calendar_days' or v_model = 'earned_days' then round(sp.base_salary / per.days_in_month, 4)
                              else round(sp.base_salary / 30, 4) end as day_rate) dr
          ) rates,
          lateral (
            -- أيام الاستقطاع المؤثرة: اليومي لا يُخصم غيابه (غير مدفوع أصلاً)؛ سقف أيام شهري اختياري
            select case when rl.max_days > 0 then least(base_days, rl.max_days) else base_days end as auto_days_eff,
                   rl.max_days > 0 and base_days > rl.max_days as days_capped
            -- 00201: في نموذج الأيام المستحقة الغياب غير مدفوع أصلاً ⇒ لا يُخصم مرة ثانية؛ يبقى خصم نقص الدقائق/التأخير فقط
            from (select case when sp.pay_type = 'daily' or v_model = 'earned_days' then s.auto_days_shortfall else s.auto_days end as base_days) bd
          ) dd) r) x) y) calc;
  get diagnostics n = row_count;
  update public.hr_month_exports set rows_count = n where id = v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver, 'days_evaluated', n_eval, 'salary_day_basis', v_basis, 'salary_model', v_model, 'pay_rest_days', v_pay_rest, 'prorate', v_prorate, 'auto_deduction', coalesce(e.auto_deduction_basis, 'salary'), 'auto_deduction_rule', e.auto_deduction_rule), 'تصدير الشهر إلى المالية', auth.uid()
  from public.hr_month_export_rows e where e.export_id = v_id;
  perform app.advance_apply_to_export(v_id, m);
  return v_id;
end$$;

create or replace function public.finance_payroll_reconcile(p_month date)
returns table(
  row_id uuid, employee_id uuid, employee_number text, full_name text, department_name text, branch_name text, pay_type text,
  gross_stored numeric, gross_expected numeric, deductions_stored numeric, deductions_expected numeric, net_stored numeric, net_expected numeric, final_net numeric,
  components jsonb, live jsonb, issues text[], money_ok boolean, attendance_ok boolean, ok boolean)
language sql stable security definer set search_path = public, app as $$
  with x as (select * from public.hr_month_exports where period_month = date_trunc('month', p_month)::date and status in ('exported', 'approved') order by version desc limit 1),
  m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t),
  live_att as (
    select a.employee_id,
      count(*) filter (where not a.is_rest_day)::int as working_days,
      count(*) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit'))::int as days_present,
      count(*) filter (where a.status = 'absent')::int as days_absent,
      count(*) filter (where a.status = 'leave')::int as days_leave,
      count(*) filter (where a.status = 'incomplete')::int as days_incomplete,
      count(*) filter (where a.status = 'leave' and exists (
         select 1 from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
         where l.employee_id = a.employee_id and l.status = 'approved' and l.kind = 'leave' and t.is_paid and a.work_date between l.start_date and l.end_date))::int as days_leave_paid,
      count(*) filter (where a.is_rest_day)::int as days_rest,
      coalesce(sum(a.proposed_deduction_minutes) filter (where not a.deduction_waived), 0)::int as auto_minutes,
      coalesce(sum(a.proposed_deduction_days) filter (where not a.deduction_waived), 0) as auto_days,
      coalesce(sum(a.proposed_deduction_days) filter (where not a.deduction_waived and a.status in ('present', 'late', 'early_leave', 'time_permit')), 0) as auto_days_shortfall
    from public.hr_attendance_days a, m where a.work_date between m.f and m.t group by a.employee_id),
  live_ded as (select d.employee_id, coalesce(sum(d.amount), 0) as amt, coalesce(sum(d.days), 0) as dys, count(*)::int as n from public.hr_attendance_deductions d, m where d.period_month = m.f group by d.employee_id),
  base as (
    select r.*,
      -- الإجمالي المتوقع من المكوّنات المخزَّنة في الصف نفسه
      case when r.pay_type is null then null
           when r.pay_type = 'daily' then round(coalesce(r.daily_rate, 0) * coalesce(r.payable_days, 0) + coalesce(r.allowances_total, 0), 2)
           -- 00201: نموذج الأيام المستحقة — الأساسي ÷ أيام الشهر × الأيام المستحقة (≤ الأساسي) + المخصصات
           when r.salary_model = 'earned_days' then round(least(coalesce(r.base_salary, 0), round(coalesce(r.day_rate, 0) * coalesce(r.payable_days, 0), 2)) + coalesce(r.allowances_total, 0), 2)
           when coalesce(r.proration_ratio, 1) < 1 then round(least(coalesce(r.base_salary, 0), round(coalesce(r.day_rate, 0) * coalesce(r.covered_days, 0), 2)) + coalesce(r.allowances_total, 0), 2)
           else round(coalesce(r.base_salary, 0) + coalesce(r.allowances_total, 0), 2) end as g_exp,
      case when r.pay_type is null then null
           else round(coalesce(r.fixed_deductions_total, 0) + coalesce(r.ops_deduction_amount, 0) + coalesce(r.ops_deduction_days_amount, 0) + coalesce(r.auto_deduction_amount, 0) + coalesce(r.advance_installment, 0), 2) end as d_exp,
      la.working_days as l_working, la.days_present as l_present, la.days_leave_paid as l_leave_paid, la.days_rest as l_rest, la.days_absent as l_absent, la.days_leave as l_leave, la.days_incomplete as l_incomplete, la.auto_minutes as l_auto_min, la.auto_days as l_auto_days, la.auto_days_shortfall as l_auto_days_short,
      coalesce(ld.amt, 0) as l_ded_amt, coalesce(ld.dys, 0) as l_ded_days, coalesce(ld.n, 0) as l_ded_n
    from x join public.hr_month_export_rows r on r.export_id = x.id
    left join live_att la on la.employee_id = r.employee_id
    left join live_ded ld on ld.employee_id = r.employee_id),
  chk as (
    select b.*,
      case when b.pay_type is null then null else greatest(0, round(b.g_exp - b.d_exp, 2)) end as n_exp,
      array_remove(array[
        case when b.pay_type is null then 'SALARY_MISSING' end,
        case when b.pay_type is not null and round(coalesce(b.gross_amount, 0), 2) <> b.g_exp then 'GROSS_MISMATCH' end,
        case when b.pay_type is not null and round(coalesce(b.deductions_total, 0), 2) <> b.d_exp then 'DEDUCTIONS_MISMATCH' end,
        case when b.pay_type is not null and round(coalesce(b.proposed_net, 0), 2) <> greatest(0, round(b.g_exp - b.d_exp, 2)) then 'NET_MISMATCH' end,
        case when b.pay_type is not null and b.final_net is not null and b.final_net < 0 then 'FINAL_NEGATIVE' end,
        case when b.pay_type is not null and coalesce(b.deductions_total, 0) > coalesce(b.gross_amount, 0) and coalesce(b.proposed_net, 0) <> 0 then 'NET_NOT_FLOORED' end,
        case when b.working_days <> b.days_present + b.days_absent + b.days_incomplete + b.days_leave then 'DAYS_UNCLASSIFIED' end,
        case when coalesce(b.unevaluated_days, 0) > 0 then 'UNEVALUATED_DAYS' end,
        case when b.l_working is not null and (b.l_present <> b.days_present or b.l_absent <> b.days_absent or b.l_leave <> b.days_leave or b.l_incomplete <> b.days_incomplete) then 'ATTENDANCE_CHANGED' end,
        case when b.l_working is not null and (b.l_auto_min <> b.auto_deduction_minutes or (case when b.pay_type = 'daily' or b.salary_model = 'earned_days' then b.l_auto_days_short else b.l_auto_days end) <> b.auto_deduction_days) and b.auto_deduction_basis is distinct from 'disabled' then 'AUTO_DEDUCTION_CHANGED' end,
        -- 00201: الأيام المستحقة المخزّنة يجب أن تساوي الحية (حضور + ناقصة + إجازة مدفوعة [+ راحة إن كانت مدفوعة])
        case when b.l_working is not null and b.salary_model = 'earned_days' and b.payable_days is not null
                  and b.payable_days <> (b.l_present + case when app.hr_incomplete_payable(b.employee_id, p_month) then b.l_incomplete else 0 end + b.l_leave_paid + case when app.hr_policy_bool('pay_rest_days', false) then b.l_rest else 0 end) then 'PAYABLE_DAYS_CHANGED' end,
        case when b.l_ded_amt <> b.ops_deduction_amount or b.l_ded_days <> b.ops_deduction_days then 'OPS_DEDUCTIONS_CHANGED' end
      ]::text[], null) as iss
    from base b)
  select c.id, c.employee_id, c.employee_number, c.full_name, c.department_name, c.branch_name, c.pay_type,
    c.gross_amount, c.g_exp, c.deductions_total, c.d_exp, c.proposed_net, c.n_exp, c.final_net,
    jsonb_build_object(
      'salary_model', c.salary_model, 'base_salary', c.base_salary, 'daily_rate', c.daily_rate, 'day_rate', c.day_rate, 'payable_days', c.payable_days, 'covered_days', c.covered_days, 'days_in_month', c.days_in_month, 'proration_ratio', c.proration_ratio,
      'allowances', c.allowances_total, 'fixed_deductions', c.fixed_deductions_total, 'ops_amount', c.ops_deduction_amount, 'ops_days', c.ops_deduction_days, 'ops_days_amount', c.ops_deduction_days_amount,
      'auto_minutes', c.auto_deduction_minutes, 'auto_days', c.auto_deduction_days, 'auto_amount', c.auto_deduction_amount, 'auto_basis', c.auto_deduction_basis, 'advance', c.advance_installment,
      'working_days', c.working_days, 'present', c.days_present, 'absent', c.days_absent, 'leave', c.days_leave, 'incomplete', c.days_incomplete, 'unevaluated', c.unevaluated_days),
    jsonb_build_object('working_days', c.l_working, 'present', c.l_present, 'leave_paid', c.l_leave_paid, 'rest', c.l_rest, 'absent', c.l_absent, 'leave', c.l_leave, 'incomplete', c.l_incomplete, 'auto_minutes', c.l_auto_min, 'auto_days', c.l_auto_days, 'ops_amount', c.l_ded_amt, 'ops_days', c.l_ded_days, 'ops_count', c.l_ded_n),
    c.iss,
    not (c.iss && array['GROSS_MISMATCH', 'DEDUCTIONS_MISMATCH', 'NET_MISMATCH', 'FINAL_NEGATIVE', 'NET_NOT_FLOORED']::text[]),
    not (c.iss && array['DAYS_UNCLASSIFIED', 'UNEVALUATED_DAYS', 'ATTENDANCE_CHANGED', 'AUTO_DEDUCTION_CHANGED', 'OPS_DEDUCTIONS_CHANGED', 'PAYABLE_DAYS_CHANGED']::text[]),
    coalesce(array_length(c.iss, 1), 0) = 0
  from chk c
  where app.has_role(array['finance_officer', 'super_admin'])
  order by c.branch_name nulls last, c.department_name nulls last, app.hr_employee_sort_key(c.employee_number), c.full_name
$$;

-- ── 00202 ⑤: تفاصيل أيام الموظف للمالية تحمل سبب الاستقطاع/وسم «يوم غير مدفوع» (تغيير نوع الإرجاع ⇒ إسقاط ثم إنشاء) ──
drop function if exists public.hr_employee_month_days(uuid, date);
create function public.hr_employee_month_days(p_employee uuid, p_month date)
returns table(work_date date, shift_name text, expected_in timestamptz, expected_out timestamptz, check_in timestamptz, check_out timestamptz,
  late_minutes int, early_minutes int, worked_minutes int, is_rest_day boolean, status text, source text, edit_reason text,
  permit_minutes int, shortfall_minutes int, overtime_minutes int, proposed_deduction_minutes int, proposed_deduction_days numeric, deduction_waived boolean, waive_reason text, deduction_reason text)
language sql stable security definer set search_path = public, app as $$
  select a.work_date, a.shift_name, a.expected_in, a.expected_out, a.check_in, a.check_out, a.late_minutes, a.early_minutes, a.worked_minutes, a.is_rest_day,
         a.status, a.source, a.edit_reason, a.permit_minutes, a.shortfall_minutes, a.overtime_minutes, a.proposed_deduction_minutes, a.proposed_deduction_days, a.deduction_waived, a.waive_reason, a.deduction_reason
  from public.hr_attendance_days a
  where app.has_role(array['hr_officer', 'ops_room', 'finance_officer', 'it_admin', 'super_admin'])
    and a.employee_id = p_employee
    and a.work_date >= date_trunc('month', p_month)::date and a.work_date < (date_trunc('month', p_month) + interval '1 month')::date
  order by a.work_date
$$;
grant execute on function public.hr_employee_month_days(uuid, date) to authenticated;
