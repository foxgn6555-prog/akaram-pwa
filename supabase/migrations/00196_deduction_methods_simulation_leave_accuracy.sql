-- 00196 · وحدة الاستقطاعات التلقائية — طرق احتساب متعددة لنقص الدقائق، محاكاة تفصيلية خطوة بخطوة، ودقة الإجازات/الزمنيات المدفوعة
--
-- ① طرق نقص الدقائق (shortfall_method) بدل «الشرائح فقط»:
--    tiers      = الشرائح (كما كان): نقص من..إلى ⇒ دقائق محددة أو كسر يوم.
--    actual     = دقيقة بدقيقة: يُستقطع نفس عدد دقائق النقص.
--    multiplier = دقيقة بدقيقة × مضاعف (shortfall_multiplier، مثلاً 2 ⇒ كل دقيقة نقص تُستقطع دقيقتين).
--    blocks     = تقريب النقص لأعلى إلى أقرب كتلة (shortfall_block_minutes، مثلاً 30 ⇒ نقص 40 د يُحتسب 60 د) ثم × المضاعف.
--    في كل الطرق: ما دون السماحية اليومية لا يُستقطع، وسقف اليوم الواحد = يوم كامل (full_day_cap_minutes = دقائق الشفت).
-- ② دقة الإجازات والزمنيات:
--    · إجازة معتمدة مدفوعة (اعتيادية/مرضية/طارئة/مهمة رسمية) ⇒ الحالة «إجازة»، لا نقص ولا استقطاع، وتُحتسب يوماً مدفوعاً في الراتب (كما كان — مُثبت بالاختبار).
--    · زمنية مدفوعة معتمدة تغطي الخروج المبكر/التأخر ⇒ الحالة «حاضر (زمنية)» بلا نقص ولا استقطاع.
--    · الزمنية المدفوعة تغطي الدقائق الناقصة فعلاً فقط (لا تُضاف كوقت إضافي إن داوم الموظف كاملاً) — إصلاح؛ permit_minutes يبقى طول الزمنية المعتمدة.
--    · زمنية غير مدفوعة ⇒ الحالة «زمنية» لكن دقائقها نقصٌ يُستقطع بالقاعدة، وسبب الاستقطاع يذكر ذلك صراحةً.
-- ③ محاكاة تفصيلية it_deduction_simulate_v2: حالة كاملة (تأخر، خروج مبكر، زمنية مدفوعة/غير مدفوعة، غياب، بصمة ناقصة،
--    إجازة مدفوعة/غير مدفوعة، نوع التعاقد) ⇒ خطوات شرح بالعربية + النتيجة + «سلّم» النقص (كم يُستقطع عند 5، 10، 15 … 240 دقيقة).

-- ── ① المفاتيح والافتراضيات والتحقق ──
create or replace function app.hr_deduction_keys() returns text[] language sql immutable as $$
  select array['auto_deduction_enabled','deduct_absence_enabled','deduct_shortfall_enabled','deduct_unpaid_leave_enabled','deduction_tiers','absent_day_deduction_days',
               'incomplete_punch_as_absent','grace_minutes_default','auto_deduction_amount_mode','fixed_absent_day_amount','fixed_shortfall_minute_amount',
               'max_auto_deduction_days_per_month','auto_deduction_cap_ratio','shortfall_method','shortfall_multiplier','shortfall_block_minutes']
$$;
create or replace function app.hr_deduction_defaults() returns jsonb language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'auto_deduction_enabled', true, 'deduct_absence_enabled', true, 'deduct_shortfall_enabled', true, 'deduct_unpaid_leave_enabled', true,
    'deduction_tiers', '[{"from":1,"to":15,"minutes":0},{"from":16,"to":30,"minutes":30},{"from":31,"to":60,"minutes":60},{"from":61,"to":120,"minutes":120},{"from":121,"to":null,"day_fraction":0.5}]'::jsonb,
    'absent_day_deduction_days', 1, 'incomplete_punch_as_absent', false, 'grace_minutes_default', 15, 'auto_deduction_amount_mode', 'salary',
    'fixed_absent_day_amount', 0, 'fixed_shortfall_minute_amount', 0, 'max_auto_deduction_days_per_month', 0, 'auto_deduction_cap_ratio', 1,
    'shortfall_method', 'tiers', 'shortfall_multiplier', 1, 'shortfall_block_minutes', 30)
  || coalesce((select jsonb_object_agg(k, v) from jsonb_each(app.hr_policy()) kv(k, v) where k = any (app.hr_deduction_keys())), '{}'::jsonb)
$$;

create or replace function app.hr_deduction_validate(s jsonb) returns void language plpgsql immutable as $$
declare t jsonb; i int := 0; prev_to int := 0; n int; v_method text := coalesce(s ->> 'shortfall_method', 'tiers');
begin
  if s is null or jsonb_typeof(s) <> 'object' then raise exception 'HR_RULE_INVALID'; end if;
  if v_method not in ('tiers', 'actual', 'multiplier', 'blocks') then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'shortfall_multiplier')::numeric, 1) not between 0.25 and 5 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'shortfall_block_minutes')::int, 30) not between 5 and 240 then raise exception 'HR_RULE_INVALID'; end if;
  -- الشرائح تُتحقق دائماً (تبقى محفوظة حتى لو كانت الطريقة الحالية غيرها، ليعود إليها المستخدم بلا فقدان)
  if jsonb_typeof(s -> 'deduction_tiers') <> 'array' or jsonb_array_length(s -> 'deduction_tiers') = 0 then raise exception 'HR_TIERS_INVALID'; end if;
  n := jsonb_array_length(s -> 'deduction_tiers');
  for t in select * from jsonb_array_elements(s -> 'deduction_tiers') loop
    i := i + 1;
    if (t ->> 'from')::int <> prev_to + 1 then raise exception 'HR_TIERS_INVALID'; end if;
    if (t ->> 'to') is not null then
      if (t ->> 'to')::int < (t ->> 'from')::int then raise exception 'HR_TIERS_INVALID'; end if;
      prev_to := (t ->> 'to')::int;
    elsif i <> n then raise exception 'HR_TIERS_INVALID'; end if;
    if coalesce((t ->> 'minutes')::int, 0) < 0 or coalesce((t ->> 'day_fraction')::numeric, 0) < 0 or coalesce((t ->> 'day_fraction')::numeric, 0) > 1 then raise exception 'HR_TIERS_INVALID'; end if;
  end loop;
  if (select (x ->> 'to') is not null from jsonb_array_elements(s -> 'deduction_tiers') x offset (n - 1) limit 1) then raise exception 'HR_TIERS_INVALID'; end if;
  if coalesce((s ->> 'absent_day_deduction_days')::numeric, 1) not between 0 and 3 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'grace_minutes_default')::int, 15) not between 0 and 120 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce(s ->> 'auto_deduction_amount_mode', 'salary') not in ('salary', 'fixed') then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'fixed_absent_day_amount')::numeric, 0) < 0 or coalesce((s ->> 'fixed_shortfall_minute_amount')::numeric, 0) < 0 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'max_auto_deduction_days_per_month')::numeric, 0) not between 0 and 31 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'auto_deduction_cap_ratio')::numeric, 1) not between 0 and 1 then raise exception 'HR_RULE_INVALID'; end if;
end$$;

-- ── الاحتساب الموحّد لنقص الدقائق بأي طريقة (السماحية تُطبَّق في المستدعي) ──
-- يعيد: دقائق مستقطعة (o_minutes) أو كسر يوم (o_days) — لا الاثنان معاً — وسقف اليوم الواحد = يوم كامل.
create or replace function app.hr_shortfall_for_rule(p_rule jsonb, p_shortfall int, p_shift_minutes int, out o_minutes int, out o_days numeric, out o_method text, out o_note text)
language plpgsql immutable as $$
declare v_mult numeric := coalesce((p_rule ->> 'shortfall_multiplier')::numeric, 1); v_block int := greatest(1, coalesce((p_rule ->> 'shortfall_block_minutes')::int, 30));
        v_shift int := greatest(1, coalesce(p_shift_minutes, 480)); v_raw int;
begin
  o_minutes := 0; o_days := 0; o_method := coalesce(p_rule ->> 'shortfall_method', 'tiers'); o_note := null;
  if coalesce(p_shortfall, 0) <= 0 then return; end if;
  if o_method = 'tiers' then
    select t.o_minutes, t.o_days into o_minutes, o_days from app.hr_tier_for_rule(p_rule, p_shortfall, v_shift) t;
    o_note := 'شريحة النقص المطابقة';
  else
    v_raw := case when o_method = 'blocks' then (ceil(p_shortfall::numeric / v_block) * v_block)::int else p_shortfall end;
    o_minutes := ceil(v_raw * case when o_method = 'actual' then 1 else v_mult end)::int;
    o_note := case o_method when 'actual' then 'دقيقة بدقيقة'
                            when 'multiplier' then 'دقيقة بدقيقة × ' || v_mult
                            else 'تقريب لأعلى إلى كتل ' || v_block || ' د' || case when v_mult <> 1 then ' × ' || v_mult else '' end end;
    if o_minutes >= v_shift then o_minutes := 0; o_days := 1; o_note := o_note || ' (بلغ سقف اليوم الكامل)'; end if;
  end if;
end$$;

-- ── ② مشتقات اليوم: الزمنية المدفوعة تغطي النقص فقط؛ الزمنية غير المدفوعة تُذكر في السبب؛ الطريقة من القاعدة ──
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

  update public.hr_attendance_days set required_minutes = v_req, permit_minutes = v_permit, shortfall_minutes = v_short, overtime_minutes = v_ot,
    proposed_deduction_minutes = v_min, proposed_deduction_days = v_days, deduction_reason = v_reason
  where employee_id = p_employee and work_date = p_date;
end$$;

-- ── المحاكاة البسيطة (توافق): تستعمل الطريقة المختارة ──
create or replace function public.it_deduction_simulate(p_settings jsonb, p_shortfall int, p_shift_minutes int default 480, p_base_salary numeric default 0, p_absent_days int default 0, p_incomplete_days int default 0) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare s jsonb := app.hr_deduction_defaults() || coalesce(p_settings, '{}'::jsonb); mins int := 0; dys numeric := 0; v_abs numeric := 0; v_inc numeric := 0;
        day_rate numeric; minute_rate numeric; amount numeric; v_mode text := coalesce(s ->> 'auto_deduction_amount_mode', 'salary'); on_ boolean := coalesce((s ->> 'auto_deduction_enabled')::boolean, true);
begin
  if not app.has_role(array['it_admin', 'ops_room', 'hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if on_ and coalesce((s ->> 'deduct_shortfall_enabled')::boolean, true) and coalesce(p_shortfall, 0) > coalesce((s ->> 'grace_minutes_default')::int, 15) then
    select o_minutes, o_days into mins, dys from app.hr_shortfall_for_rule(s, p_shortfall, p_shift_minutes);
  end if;
  if on_ and coalesce((s ->> 'deduct_absence_enabled')::boolean, true) then
    v_abs := coalesce(p_absent_days, 0) * coalesce((s ->> 'absent_day_deduction_days')::numeric, 1);
    if coalesce((s ->> 'incomplete_punch_as_absent')::boolean, false) then v_inc := coalesce(p_incomplete_days, 0) * coalesce((s ->> 'absent_day_deduction_days')::numeric, 1); end if;
  end if;
  day_rate := round(coalesce(p_base_salary, 0) / 30, 4); minute_rate := round(day_rate / greatest(p_shift_minutes, 1), 4);
  amount := case when not on_ then 0 when v_mode = 'fixed' then round(coalesce((s ->> 'fixed_shortfall_minute_amount')::numeric, 0) * mins + coalesce((s ->> 'fixed_absent_day_amount')::numeric, 0) * (dys + v_abs + v_inc), 2)
                 else round(minute_rate * mins + day_rate * (dys + v_abs + v_inc), 2) end;
  return jsonb_build_object('enabled', on_, 'minutes', mins, 'days', dys + v_abs + v_inc, 'shortfall_days', dys, 'absent_days', v_abs, 'incomplete_days', v_inc,
    'amount_mode', v_mode, 'day_rate', day_rate, 'minute_rate', minute_rate, 'amount', amount, 'method', coalesce(s ->> 'shortfall_method', 'tiers'));
end$$;

-- ── ③ المحاكاة التفصيلية: حالة يوم + حالة شهر ⇒ خطوات شرح + نتيجة + سلّم النقص ──
-- p_case: {shift_minutes, base_salary, pay_type('monthly'|'daily'), late_minutes, early_minutes, paid_permit_minutes, unpaid_permit_minutes,
--          absent_days, incomplete_days, unpaid_leave_days, paid_leave_days, leave_deduction_days_per_day}
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
begin
  if not app.has_role(array['it_admin', 'ops_room', 'hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  day_rate := round(v_salary / 30, 4); minute_rate := round(day_rate / v_shift, 4);
  if v_pay = 'daily' then day_rate := v_salary; minute_rate := round(v_salary / v_shift, 4); end if;

  -- خطوة 1: أجر اليوم والدقيقة
  if v_mode = 'fixed' then
    steps := steps || jsonb_build_object('key', 'rates', 'title', 'أساس المبلغ: مبالغ ثابتة', 'text', format('كل يوم استقطاع = %s د.ع، وكل دقيقة نقص = %s د.ع (بغضّ النظر عن الراتب).', coalesce((s ->> 'fixed_absent_day_amount')::numeric, 0), coalesce((s ->> 'fixed_shortfall_minute_amount')::numeric, 0)));
  elsif v_pay = 'daily' then
    steps := steps || jsonb_build_object('key', 'rates', 'title', 'أساس المبلغ: أجر يومي', 'text', format('أجر اليوم = %s د.ع؛ أجر الدقيقة = أجر اليوم ÷ دقائق الشفت (%s) = %s د.ع.', v_salary, v_shift, minute_rate));
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
  steps := steps || jsonb_build_object('key', 'days', 'title', 'الأيام',
    'text', format('غياب بلا إجازة %s يوم × %s = %s يوم. بصمة ناقصة %s يوم ⇒ %s. إجازة غير مدفوعة %s يوم × %s = %s يوم. إجازة مدفوعة %s يوم ⇒ لا استقطاع وتُحتسب أياماً مدفوعة.',
      v_absent, v_abs_days, d_abs, v_inc, case when d_inc > 0 then d_inc || ' يوم (تُعامل كغياب)' else 'لا استقطاع (تُدقَّق يدوياً)' end, v_ul, v_ul_per, d_ul, v_pl));

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
  v_gross := case when v_pay = 'daily' then v_salary * 30 else v_salary end;
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
    'days', v_dfrac + d_abs + d_inc + d_ul, 'day_rate', day_rate, 'minute_rate', minute_rate,
    'amount_shortfall', round(amt_short, 2), 'amount_absence', round(amt_abs, 2), 'amount_incomplete', round(amt_inc, 2), 'amount_unpaid_leave', round(amt_ul, 2),
    'amount', amt_total, 'capped', v_capped, 'steps', steps, 'ladder', ladder);
end$$;
grant execute on function public.it_deduction_simulate_v2(jsonb, jsonb) to authenticated;

-- إعادة احتساب الشهر الجاري غير المقفل حتى تسري دقة الزمنيات فوراً
select app.hr_deduction_reevaluate();
