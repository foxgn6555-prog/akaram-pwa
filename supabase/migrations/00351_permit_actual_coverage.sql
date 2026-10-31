-- 00399-ج: الزمنية تغطي ما يتداخل فعلاً مع نقص هذا اليوم، لا نقصاً في وقت آخر.
-- نطاقات متداخلة تُوحَّد كي لا تُحسب الدقيقة مرتين؛ الشفت الليلي يُنسب ليوم بدايته.
create or replace function app.hr_permit_overlap_minutes(
  p_employee uuid, p_date date, p_from timestamptz, p_to timestamptz,
  p_shift_start time, p_shift_end time, p_paid boolean default null
) returns integer language sql stable security definer set search_path = public, app as $$
  with intervals as (
    select ((p_date+l.start_time)::timestamp-app.hr_tz()) at time zone 'UTC'
             + case when p_shift_end <= p_shift_start and l.start_time < p_shift_start or p_shift_end > p_shift_start and ((p_from at time zone 'UTC')+app.hr_tz())::date>p_date then interval '1 day' else interval '0' end as ps,
           ((p_date+l.end_time)::timestamp-app.hr_tz()) at time zone 'UTC'
             + case when p_shift_end <= p_shift_start and l.end_time <= p_shift_start or p_shift_end > p_shift_start and ((p_from at time zone 'UTC')+app.hr_tz())::date>p_date then interval '1 day' else interval '0' end as pe
    from public.hr_leaves l left join public.hr_leave_types t on t.id=l.leave_type_id
    where l.employee_id=p_employee and l.status='approved' and l.kind='time_permit' and l.start_date=p_date
      and l.start_time is not null and l.end_time is not null and (p_paid is null or t.is_paid=p_paid)
  ), merged as (
    select range_agg(tstzrange(greatest(p_from,ps),least(p_to,pe),'[)')) as periods
    from intervals where p_from is not null and p_to is not null and p_to>p_from and pe>ps and greatest(p_from,ps)<least(p_to,pe)
  )
  select coalesce(floor(sum(extract(epoch from (upper(r)-lower(r)))/60))::int,0)
  from merged cross join lateral unnest(merged.periods) as u(r)
$$;
revoke all on function app.hr_permit_overlap_minutes(uuid,date,timestamptz,timestamptz,time,time,boolean) from public,anon,authenticated;

-- حالة الحضور تعترف بوقتي الزمنية المدفوعة وغير المدفوعة، لكن الحساب المالي يستخدم المدفوعة فقط.
create or replace function app.hr_permit_cover_minutes(p_employee uuid,p_date date,p_from timestamptz,p_to timestamptz,p_shift_start time,p_shift_end time)
returns integer language sql stable security definer set search_path = public,app as $$
  select app.hr_permit_overlap_minutes(p_employee,p_date,p_from,p_to,p_shift_start,p_shift_end,null)
$$;

create or replace function app.hr_compute_day_metrics(p_employee uuid, p_date date) returns void
language plpgsql security definer set search_path = public, app as $$
declare a record; v_req int := 0; v_permit int := 0; v_short int := 0; v_ot int := 0; v_min int := 0; v_days numeric := 0; v_reason text := null;
        lt record; v_ot_block int := app.hr_policy_int('overtime_min_block_minutes', 30); v_grace int; rl jsonb; v_missing int;
        v_on boolean; v_abs boolean; v_sf_on boolean; v_ul boolean; sh record; v_late_cover int := 0; v_early_cover int := 0; v_unpaid_overlap int := 0; v_pe int := 0; v_pl int := 0; v_plate int;   -- 00353
begin
  if app.hr_month_locked(p_date) then return; end if;
  select * into a from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  if not found then return; end if;
  rl := app.hr_deduction_rule_for(p_employee, p_date);
  v_on := coalesce((rl ->> 'auto_deduction_enabled')::boolean, true); v_abs := coalesce((rl ->> 'deduct_absence_enabled')::boolean, true);
  v_sf_on := coalesce((rl ->> 'deduct_shortfall_enabled')::boolean, true); v_ul := coalesce((rl ->> 'deduct_unpaid_leave_enabled')::boolean, true);
  if a.expected_in is not null and a.expected_out is not null then v_req := floor(extract(epoch from (a.expected_out - a.expected_in)) / 60)::int; end if;
  -- مدة الزمنية المعروضة هي اتحاد الزمنيات المدفوعة حتى عند تداخل بيانات تاريخية.
  v_permit := app.hr_permit_overlap_minutes(p_employee,p_date,(p_date::timestamp-app.hr_tz()) at time zone 'UTC',((p_date::timestamp-app.hr_tz()) at time zone 'UTC')+interval '1 day',null,null,true);
  if a.expected_in is not null and a.expected_out is not null and a.check_in is not null and a.check_out is not null then
    select * into sh from app.hr_effective_shift(p_employee,p_date);
    v_late_cover := app.hr_permit_overlap_minutes(p_employee,p_date,a.expected_in,least(a.check_in,a.expected_out),((a.expected_in at time zone 'UTC')+app.hr_tz())::time,((a.expected_out at time zone 'UTC')+app.hr_tz())::time,true);
    v_early_cover := app.hr_permit_overlap_minutes(p_employee,p_date,greatest(a.check_out,a.expected_in),a.expected_out,((a.expected_in at time zone 'UTC')+app.hr_tz())::time,((a.expected_out at time zone 'UTC')+app.hr_tz())::time,true);
    v_unpaid_overlap := app.hr_permit_overlap_minutes(p_employee,p_date,a.expected_in,least(a.check_in,a.expected_out),((a.expected_in at time zone 'UTC')+app.hr_tz())::time,((a.expected_out at time zone 'UTC')+app.hr_tz())::time,null)
      + app.hr_permit_overlap_minutes(p_employee,p_date,greatest(a.check_out,a.expected_in),a.expected_out,((a.expected_in at time zone 'UTC')+app.hr_tz())::time,((a.expected_out at time zone 'UTC')+app.hr_tz())::time,null) - v_late_cover - v_early_cover;
  end if;
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
    v_short := greatest(0, v_missing - v_late_cover - v_early_cover);
    if v_short > 0 and v_on and v_sf_on then
      select o_minutes, o_days into v_min, v_days from app.hr_shortfall_for_rule(rl, v_short, v_req);
      if v_min > 0 or v_days > 0 then
        v_reason := 'نقص ' || v_short || ' دقيقة عن ساعات الشفت';
        if v_unpaid_overlap > 0 then v_reason := v_reason || ' — منها زمنية غير مدفوعة ' || least(v_unpaid_overlap, v_short) || ' د'; end if;
      end if;
    end if;
    if app.hr_policy_bool('overtime_enabled', true) and a.check_out is not null and a.expected_out is not null and v_short = 0 then
      -- 00248: الوقت الإضافي خارج بنك الساعات يخضع للشرائح نفسها (مجيء مبكر/بقاء بعد النهاية)
      -- 00268: البقاء بعد النهاية يغطي تأخير اليوم نفسه أولاً (فوق السماحية) ثم ما زاد فقط يُحتسب إضافياً — لا ازدواج
      declare v_ot_late int := case when a.check_in is not null and a.expected_in is not null then greatest(0, floor(extract(epoch from (a.check_in - a.expected_in)) / 60)::int) else 0 end;
              v_ot_grace int := coalesce((rl ->> 'grace_minutes_default')::int, 15);
      begin
        if v_ot_late <= v_ot_grace then v_ot_late := 0; end if;
        v_ot := app.hr_credit_tiered(case when a.check_in is not null and a.expected_in is not null then greatest(0, floor(extract(epoch from (a.expected_in - a.check_in)) / 60)::int) else 0 end, app.hr_credit_tiers('early_in'))
              + app.hr_credit_tiered(greatest(0, floor(extract(epoch from (a.check_out - a.expected_out)) / 60)::int - v_ot_late), app.hr_credit_tiers('late_out'));
      end;
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
      v_late_eff := greatest(0, v_late_raw - v_late_cover);
      if v_late_eff <= v_grace then v_late_eff := 0; end if;
      v_sf := greatest(0, v_late_eff - v_extra) + greatest(0, v_early_out - v_early_cover);
      -- 00248: الفائض بالشرائح — البقاء يغطي تأخير اليوم 100% أولاً، ثم الزائد والمجيء المبكر كلٌّ بشرائحه (ما بعد آخر شريحة = 0)
      v_sur := app.hr_credit_tiered(greatest(0, v_extra - case when v_late_raw <= v_grace then 0 else v_late_raw end), app.hr_credit_tiers('late_out')) + app.hr_credit_tiered(v_early_in, app.hr_credit_tiers('early_in'));
      v_short := v_sf; v_ot := v_sur; v_days := 0;
      v_min := case when v_on and v_sf_on then v_sf else 0 end;
      v_reason := case when v_sf > 0 then 'نقص ' || v_sf || ' دقيقة (تأخير بعد الزمنية والسماحية ' || v_late_eff || ' − بقاء ' || least(v_extra, v_late_eff) || ' + خروج مبكر بعد الزمنية ' || greatest(0,v_early_out-v_early_cover) || ') — بنك الساعات' || case when v_unpaid_overlap>0 then ' — توجد زمنية غير مدفوعة متداخلة مع الغياب' else '' end else null end;
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
  -- 00353: دقائق الإضافي الخام للصرف المدفوع (قبل الشفت / بعده) — بلا شرائح؛ البقاء بعد النهاية يغطي تأخير اليوم (فوق السماحية) أولاً؛
  --   لا تُحتسب إلا إذا كان اليوم بلا نقص (نفس قاعدة الإضافي الحالية) وبصمتا الدخول والخروج موجودتان وليس يوم راحة؛ المجيء المبكر يغطي الخروج المبكر أولاً
  if a.status in ('present', 'late', 'early_leave', 'time_permit') and not a.is_rest_day and v_short = 0
     and a.check_in is not null and a.check_out is not null and a.expected_in is not null and a.expected_out is not null then
    v_plate := greatest(0, floor(extract(epoch from (a.check_in - a.expected_in)) / 60)::int);
    if v_plate <= v_grace then v_plate := 0; end if;
    -- المجيء المبكر يغطي الخروج المبكر في اليوم نفسه أولاً (كما يغطي البقاءُ التأخيرَ) — لا يُدفع إلا ما زاد فعلاً على ساعات الشفت
    v_pe := greatest(0, floor(extract(epoch from (a.expected_in - a.check_in)) / 60)::int - greatest(0, floor(extract(epoch from (a.expected_out - a.check_out)) / 60)::int));
    v_pl := greatest(0, floor(extract(epoch from (a.check_out - a.expected_out)) / 60)::int - v_plate);
  end if;
  update public.hr_attendance_days set required_minutes = v_req, permit_minutes = v_permit, shortfall_minutes = v_short, overtime_minutes = v_ot,
    proposed_deduction_minutes = v_min, proposed_deduction_days = v_days, deduction_reason = v_reason, ot_early_minutes = v_pe, ot_late_minutes = v_pl
  where employee_id = p_employee and work_date = p_date;
end$$;

-- الحساب الداخلي لا يُستدعى مباشرةً من الأدوار العامة.
revoke all on function app.hr_compute_day_metrics(uuid,date) from public,anon,authenticated;

-- الحالة اليدوية تبقى محفوظة عند اعتماد زمنية، وتعود عند إلغائها؛ لا تُستبدل الأوقات أو دفتر البصمات.
alter table public.hr_attendance_days add column if not exists approved_permit_original jsonb;
create or replace function app.hr_sync_manual_permit(p_employee uuid,p_date date) returns void
language plpgsql security definer set search_path = public,app as $$
declare a public.hr_attendance_days%rowtype; sh record; v_has boolean; orig jsonb; b jsonb; n jsonb; v_old_sync text;
  v_status text; v_late int; v_early int; v_in_cover int:=0; v_out_cover int:=0; v_grace int:=0;
begin
  select * into a from public.hr_attendance_days where employee_id=p_employee and work_date=p_date;
  if a.id is null or a.source <> 'manual' then return; end if;
  select exists(select 1 from public.hr_leaves l where l.employee_id=p_employee and l.kind='time_permit' and l.status='approved' and l.start_date=p_date) into v_has;
  if not v_has and a.approved_permit_original is null then return; end if;
  -- عند اعتماد الحضورية لا نغيّرها من احتساب دوري؛ مسار قرار الزمنية يفتحها أولاً.
  if app.hr_month_confirmed(p_date) and current_setting('app.attendance_confirming',true) is distinct from 'on' then return; end if;
  orig:=coalesce(a.approved_permit_original,jsonb_build_object('status',a.status,'late_minutes',a.late_minutes,'early_minutes',a.early_minutes));
  v_status:=orig->>'status'; v_late:=coalesce((orig->>'late_minutes')::int,0); v_early:=coalesce((orig->>'early_minutes')::int,0);
  if v_has and a.expected_in is not null and a.expected_out is not null then
    select * into sh from app.hr_effective_shift(p_employee,p_date); v_grace:=coalesce(sh.grace_minutes,0);
    if a.check_in is not null then
      v_in_cover:=app.hr_permit_cover_minutes(p_employee,p_date,a.expected_in,least(a.check_in,a.expected_out),((a.expected_in at time zone 'UTC')+app.hr_tz())::time,((a.expected_out at time zone 'UTC')+app.hr_tz())::time);
    end if;
    if a.check_out is not null then
      v_out_cover:=app.hr_permit_cover_minutes(p_employee,p_date,greatest(a.check_out,a.expected_in),a.expected_out,((a.expected_in at time zone 'UTC')+app.hr_tz())::time,((a.expected_out at time zone 'UTC')+app.hr_tz())::time);
    end if;
    if v_status in ('late','early_leave') and a.check_in is not null and a.check_out is not null then
      -- الحالة اليدوية القديمة قد تكون حفظت جانباً واحداً فقط؛ لا تخفي جانب النقص الآخر بعد تغطية الزمنية.
      v_late:=greatest(0,floor(extract(epoch from(a.check_in-a.expected_in))/60)::int-v_in_cover-v_grace);
      v_early:=greatest(0,floor(extract(epoch from(a.expected_out-a.check_out))/60)::int-v_out_cover);
    else
      v_late:=greatest(0,v_late-v_in_cover); v_early:=greatest(0,v_early-v_out_cover);
    end if;
    if v_status in ('present','late','early_leave','time_permit') and not a.is_rest_day and a.check_in is not null and a.check_out is not null then
      v_status:=case when v_late>0 then 'late' when v_early>v_grace then 'early_leave' else 'time_permit' end;
    end if;
  end if;
  b:=to_jsonb(a); v_old_sync:=current_setting('app.hr_leave_sync',true);
  perform set_config('app.hr_leave_sync','on',true);
  update public.hr_attendance_days set status=v_status,late_minutes=v_late,early_minutes=v_early,
    approved_permit_original=case when v_has then orig else null end,updated_at=now() where id=a.id;
  perform set_config('app.hr_leave_sync',coalesce(v_old_sync,''),true);
  select to_jsonb(x) into n from public.hr_attendance_days x where id=a.id;
  if (b-'updated_at') is distinct from (n-'updated_at') then
    insert into public.hr_attendance_audit(employee_id,work_date,action,before,after,reason,actor)
    values(p_employee,p_date,'leave_sync',b,n,case when v_has then 'احتساب الزمنية المعتمدة مع حفظ الحالة اليدوية' else 'إلغاء الزمنية: استعادة الحالة اليدوية' end,auth.uid());
  end if;
end$$;
revoke all on function app.hr_sync_manual_permit(uuid,date) from public,anon,authenticated;

-- ثبّت المنطقة الزمنية ونافذة الشفت الفعلية حتى للشفت المرن.
create or replace function app.hr_evaluate_day_00350_base(p_employee uuid, p_date date)
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
    v_exp_in := (p_date::timestamp - tz) at time zone 'UTC'; v_exp_out := v_exp_in + interval '24 hours';
    v_win_from := v_exp_in; v_win_to := v_exp_out;
  else
    v_rest := not (v_dow::smallint = any (sh.work_days));
    v_flex := coalesce(sh.kind, 'fixed') = 'flexible'; v_req_min := round(coalesce(sh.required_hours, 0) * 60)::int;
    v_exp_in := ((p_date + sh.start_time)::timestamp - tz) at time zone 'UTC';
    v_exp_out := ((p_date + sh.end_time)::timestamp - tz) at time zone 'UTC';
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
        v_early := floor(extract(epoch from (v_exp_out - v_out)) / 60)::int - app.hr_permit_cover_minutes(p_employee, p_date, greatest(v_out,v_exp_in), v_exp_out, ((v_exp_in at time zone 'UTC')+tz)::time, ((v_exp_out at time zone 'UTC')+tz)::time);
        v_early := greatest(0, v_early);
      end if;
    end if;
  elsif sh.shift_id is not null and not v_rest then
    if v_in is not null and v_in > v_exp_in then
      v_late := floor(extract(epoch from (v_in - v_exp_in)) / 60)::int - app.hr_permit_cover_minutes(p_employee, p_date, v_exp_in, least(v_in,v_exp_out), ((v_exp_in at time zone 'UTC')+tz)::time, ((v_exp_out at time zone 'UTC')+tz)::time);
      v_late := greatest(0, v_late - sh.grace_minutes);
    end if;
    if v_out is not null and v_out < v_exp_out then
      v_early := floor(extract(epoch from (v_exp_out - v_out)) / 60)::int - app.hr_permit_cover_minutes(p_employee, p_date, greatest(v_out,v_exp_in), v_exp_out, ((v_exp_in at time zone 'UTC')+tz)::time, ((v_exp_out at time zone 'UTC')+tz)::time);
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

create or replace function app.hr_evaluate_day(p_employee uuid, p_date date) returns void
language plpgsql security definer set search_path = public, app as $$
declare a public.hr_attendance_days%rowtype; v_has_leave boolean; b jsonb; n jsonb; old_sync text;
begin
  if p_employee is null or p_date is null then return; end if;
  -- الإجازات أو أصل الحالة اليدوية المتأثرة فقط تتسلسل مع اعتماد المالية؛ لا نقفل الشهر لكل بصمة عادية.
  if exists (select 1 from public.hr_leaves l where l.employee_id=p_employee and l.status='approved' and (l.kind='leave' and p_date between l.start_date and l.end_date or l.kind='time_permit' and l.start_date=p_date))
     or exists (select 1 from public.hr_attendance_days x where x.employee_id=p_employee and x.work_date=p_date and (x.approved_leave_original is not null or x.approved_permit_original is not null or (x.source='auto' and x.status='leave'))) then
    perform app.hr_payroll_lock_range(p_date,p_date);
  end if;
  if app.hr_month_locked(p_date) then return; end if;
  select * into a from public.hr_attendance_days where employee_id=p_employee and work_date=p_date for update;
  select exists (select 1 from public.hr_leaves l where l.employee_id=p_employee and l.status='approved' and l.kind='leave' and p_date between l.start_date and l.end_date) into v_has_leave;
  if a.id is not null and a.source='manual' then
    if v_has_leave and (a.approved_leave_original is null or a.status <> 'leave') then
      perform app.hr_leave_reopen_confirmed(p_employee,p_date);
      b := to_jsonb(a); old_sync := current_setting('app.hr_leave_sync',true);
      perform set_config('app.hr_leave_sync','on',true);
      update public.hr_attendance_days set
        approved_leave_original = coalesce(approved_leave_original,jsonb_build_object('status',status,'late_minutes',late_minutes,'early_minutes',early_minutes)),
        status='leave', late_minutes=0, early_minutes=0, updated_at=now()
      where id=a.id;
      perform set_config('app.hr_leave_sync',coalesce(old_sync,''),true);
      select to_jsonb(x) into n from public.hr_attendance_days x where id=a.id;
      insert into public.hr_attendance_audit(employee_id,work_date,action,before,after,reason,actor)
      values(p_employee,p_date,'leave_sync',b,n,'أولوية إجازة معتمدة على حالة الحضور اليدوية مع حفظ الأصل',auth.uid());
    elsif not v_has_leave and a.approved_leave_original is not null then
      perform app.hr_leave_reopen_confirmed(p_employee,p_date);
      b := to_jsonb(a); old_sync := current_setting('app.hr_leave_sync',true);
      perform set_config('app.hr_leave_sync','on',true);
      update public.hr_attendance_days set status=approved_leave_original->>'status',
        late_minutes=(approved_leave_original->>'late_minutes')::int, early_minutes=(approved_leave_original->>'early_minutes')::int,
        approved_leave_original=null, updated_at=now() where id=a.id;
      perform set_config('app.hr_leave_sync',coalesce(old_sync,''),true);
      select to_jsonb(x) into n from public.hr_attendance_days x where id=a.id;
      insert into public.hr_attendance_audit(employee_id,work_date,action,before,after,reason,actor)
      values(p_employee,p_date,'leave_sync',b,n,'إلغاء الإجازة: استعادة حالة الحضور اليدوية المحفوظة',auth.uid());
    end if;
    if not v_has_leave then perform app.hr_sync_manual_permit(p_employee,p_date); end if;
    return;
  end if;
  -- الصف التلقائي يخضع للمحرك الأصلي؛ إعادة الفتح لا تحدث إلا عند تغيّر الإجازة على حالة اليوم.
  if (v_has_leave and (a.id is null or a.status <> 'leave')) or (not v_has_leave and a.id is not null and a.status='leave') then
    perform app.hr_leave_reopen_confirmed(p_employee,p_date);
    b := case when a.id is null then null else to_jsonb(a) end;
    perform app.hr_evaluate_day_00350_base(p_employee,p_date);
    select to_jsonb(x) into n from public.hr_attendance_days x where employee_id=p_employee and work_date=p_date;
    if (b->>'status') is distinct from (n->>'status') then
      insert into public.hr_attendance_audit(employee_id,work_date,action,before,after,reason,actor)
      values(p_employee,p_date,'leave_sync',b,n,'إعادة احتساب الحضور بعد تغيير الإجازة المعتمدة',auth.uid());
    end if;
  else
    perform app.hr_evaluate_day_00350_base(p_employee,p_date);
  end if;
end$$;

revoke all on function app.hr_evaluate_day(uuid,date) from public,anon,authenticated;

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
    v_exp_in := ((p_date + sh.start_time)::timestamp - tz) at time zone 'UTC'; v_exp_out := ((p_date + sh.end_time)::timestamp - tz) at time zone 'UTC';
    if v_exp_out <= v_exp_in then v_exp_out := v_exp_out + interval '1 day'; end if;
    v_shift_name := sh.shift_name;
  end if;
  if v_exp_in is not null and p_check_in is not null and p_check_in > v_exp_in and not v_rest then
    v_late := floor(extract(epoch from (p_check_in - v_exp_in)) / 60)::int;
    v_late := greatest(0, v_late - v_grace);
  end if;
  if v_exp_out is not null and p_check_out is not null and p_check_out < v_exp_out and not v_rest then
    v_early := floor(extract(epoch from (v_exp_out - p_check_out)) / 60)::int;
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
    worked_minutes = excluded.worked_minutes, status = excluded.status, source = 'manual', approved_permit_original = null,
    edited_by = auth.uid(), edited_at = now(), edit_reason = excluded.edit_reason, updated_at = now();

  perform app.hr_evaluate_day(p_employee,p_date);
  select to_jsonb(d) into a from public.hr_attendance_days d where d.employee_id = p_employee and d.work_date = p_date;
  insert into public.hr_attendance_audit (employee_id, work_date, action, before, after, reason, actor) values (p_employee, p_date, 'edit', b, a, trim(p_reason), auth.uid());
  perform app.hr_refresh_alerts(p_employee, p_date);
  return jsonb_build_object('before', b, 'after', a);
end$$;

create or replace function app.attendance_edit_revert__raw(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare q public.attendance_edit_requests; it record; b jsonb; n int := 0; u uuid; v_reason text;
begin
  if not app.has_role(array['deputy_director', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'HR_REASON_REQUIRED'; end if;
  select * into q from public.attendance_edit_requests where id = p_id for update;
  if q.id is null then raise exception 'PROCEDURE_NOT_FOUND'; end if;
  if q.status <> 'applied' then raise exception 'ATT_EDIT_NOT_APPLIED'; end if;
  perform app.attendance_edit_validate_dates(q.dates);
  perform app.hr_payroll_lock_range((select min(x) from unnest(q.dates) x),(select max(x) from unnest(q.dates) x));
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
        late_minutes = coalesce((b -> 'approved_permit_original' ->> 'late_minutes')::int, (b ->> 'late_minutes')::int, 0), early_minutes = coalesce((b -> 'approved_permit_original' ->> 'early_minutes')::int, (b ->> 'early_minutes')::int, 0), worked_minutes = coalesce((b ->> 'worked_minutes')::int, 0),
        status = coalesce(b -> 'approved_permit_original' ->> 'status',b ->> 'status'), source = 'manual', approved_permit_original=null, edited_by = auth.uid(), edited_at = now(), edit_reason = v_reason, updated_at = now()
      where employee_id = it.employee_id and work_date = it.work_date;
      perform app.hr_evaluate_day(it.employee_id,it.work_date);
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

create or replace function app.hr_leave_decide__raw(p_leave uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare l record; lt record; e record; v_cost numeric; bal jsonb; d date; final boolean := true; step_no int; u uuid; v_before jsonb; v_after jsonb;
begin
  select * into l from public.hr_leaves where id = p_leave;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if l.status <> 'pending' then raise exception 'HR_LEAVE_NOT_PENDING'; end if;
  if not app.hr_can_decide(p_leave) then raise exception 'HR_FORBIDDEN'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  select * into lt from public.hr_leave_types where id = l.leave_type_id;
  select * into e from public.employees where id = l.employee_id;

  if l.chain_id is not null then
    select t.step_no into step_no from public.approval_tasks t where t.request_kind = l.kind and t.request_id = l.id and t.status = 'pending' order by t.step_no limit 1;
    final := app.approval_decide(l.kind, l.id, p_approve, p_note);
    if p_approve and not final then
      perform app.hr_notify(e.user_id, 'وافقت خطوة ' || step_no || ' على طلب ' || lt.name, 'الطلب انتقل إلى الخطوة التالية في سلسلة الموافقات', '/employee/requests', 'approval_step:' || l.id::text || ':' || step_no, 'info');
      return;   -- الطلب يبقى معلّقاً حتى الخطوة الأخيرة
    end if;
  end if;

  if p_approve then
    perform app.hr_payroll_lock_range(l.start_date,l.end_date);
    if exists (select 1 from generate_series(date_trunc('month',l.start_date),date_trunc('month',l.end_date),interval '1 month') mm where app.hr_month_locked(mm::date)) then raise exception 'HR_MONTH_LOCKED'; end if;
    if lt.consumes_balance then
      perform app.hr_leave_check_balance(l.employee_id, l.start_date, l.end_date, lt.kind, l.id);   -- 00305
      insert into public.hr_leave_ledger (employee_id, year, kind, days, leave_id, note, created_by)
      select l.employee_id, c.year, case when lt.kind = 'leave' then 'consume' else 'permit' end, -c.days, l.id,
             lt.name || ' ' || l.start_date::text || case when l.end_date <> l.start_date then ' → ' || l.end_date::text else '' end, auth.uid()
      from app.hr_leave_cost_by_year(l.start_date, l.end_date, lt.kind) c;
    end if;
    update public.hr_leaves set status = 'approved', approved_by = auth.uid(), approved_at = now(), decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '') where id = p_leave;
    d := l.start_date;
    while d <= l.end_date loop
      if l.kind='time_permit' then
        perform app.hr_leave_reopen_confirmed(l.employee_id,d);
        select to_jsonb(a) into v_before from public.hr_attendance_days a where a.employee_id=l.employee_id and a.work_date=d;
      end if;
      perform app.hr_evaluate_day(l.employee_id,d);
      if l.kind='time_permit' then
        select to_jsonb(a) into v_after from public.hr_attendance_days a where a.employee_id=l.employee_id and a.work_date=d;
        if coalesce(v_before->>'source',v_after->>'source')='auto' and (v_before-'updated_at') is distinct from (v_after-'updated_at') then
          insert into public.hr_attendance_audit(employee_id,work_date,action,before,after,reason,actor)
          values(l.employee_id,d,'leave_sync',v_before,v_after,'تحديث الحضور بعد قرار زمنية معتمدة',auth.uid());
        end if;
      end if;
      d := d+1;
    end loop;
    perform app.hr_refresh_alerts(l.employee_id, l.start_date); perform app.hr_refresh_alerts(l.employee_id, l.end_date);
    perform app.hr_notify(e.user_id, 'تمت الموافقة على ' || lt.name || case when l.is_backdated then ' (بأثر رجعي)' else '' end,
      l.start_date::text || case when l.end_date <> l.start_date then ' → ' || l.end_date::text else '' end || case when l.is_backdated then ' · صُحِّح سجل حضورك لذلك اليوم تلقائياً' else '' end, '/employee/requests', 'leave_dec:' || l.id::text, 'success');
    -- 00197 · بأثر رجعي: تبليغ غرفة العمليات لأن حضور يوم سابق تغيّر (قد يكون الشهر مدقَّقاً)
    if l.is_backdated then
      for u in select ur.user_id from public.user_roles ur where ur.role = 'ops_room' loop
        perform app.hr_notify(u, 'تصحيح حضور بأثر رجعي: ' || e.full_name, lt.name || ' ليوم ' || l.start_date::text || case when l.end_date <> l.start_date then ' → ' || l.end_date::text else '' end || ' اعتُمدت بأثر رجعي — تحقق من حضورية الشهر', '/ops/attendance', 'backdated_ops:' || l.id::text, 'info');
      end loop;
    end if;
  else
    update public.hr_leaves set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note) where id = p_leave;
    perform app.hr_notify(e.user_id, 'رُفض طلب ' || lt.name, trim(p_note), '/employee/requests', 'leave_dec:' || l.id::text, 'warning');
  end if;
end$$;

create or replace function app.hr_leave_cancel__raw(p_leave uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare l record; me uuid := app.current_employee_id(); d date; v_before jsonb; v_after jsonb;
begin
  select * into l from public.hr_leaves where id = p_leave;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if l.status not in ('pending', 'approved') then raise exception 'HR_LEAVE_NOT_PENDING'; end if;
  if not (app.has_role(array['hr_officer', 'super_admin']) or l.employee_id = me or app.hr_can_decide(p_leave)
          or (l.status = 'pending' and l.requested_by = auth.uid())) then raise exception 'HR_FORBIDDEN'; end if;
  if l.status = 'approved' then
    if not app.has_role(array['hr_officer', 'super_admin']) and l.start_date <= current_date then raise exception 'HR_LEAVE_STARTED'; end if;
    perform app.hr_payroll_lock_range(l.start_date,l.end_date);
    if exists (select 1 from generate_series(date_trunc('month',l.start_date),date_trunc('month',l.end_date),interval '1 month') mm where app.hr_month_locked(mm::date)) then raise exception 'HR_MONTH_LOCKED'; end if;
    if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
    insert into public.hr_leave_ledger (employee_id, year, kind, days, leave_id, note, created_by)
    select employee_id, year, 'reversal', -days, leave_id, 'إلغاء: ' || trim(p_reason), auth.uid() from public.hr_leave_ledger where leave_id = p_leave and kind in ('consume', 'permit');
  end if;
  update public.hr_leaves set status = 'cancelled', cancelled_reason = nullif(trim(coalesce(p_reason, '')), ''), decided_by = coalesce(decided_by, auth.uid()) where id = p_leave;
  -- مهام سلسلة الموافقات المفتوحة تُغلق (لا تبقى معلّقة في لوحات المعتمِدين/الخط الزمني)
  update public.approval_tasks set status = 'skipped', note = coalesce(note, 'أُلغي الطلب من صاحبه/HR قبل اكتمال السلسلة')
   where request_kind = l.kind and request_id = l.id and status in ('pending', 'waiting');
  if l.status = 'approved' then
    d := l.start_date;
    while d <= l.end_date loop
      if l.kind='time_permit' then
        perform app.hr_leave_reopen_confirmed(l.employee_id,d);
        select to_jsonb(a) into v_before from public.hr_attendance_days a where a.employee_id=l.employee_id and a.work_date=d;
      end if;
      perform app.hr_evaluate_day(l.employee_id,d);
      if l.kind='time_permit' then
        select to_jsonb(a) into v_after from public.hr_attendance_days a where a.employee_id=l.employee_id and a.work_date=d;
        if coalesce(v_before->>'source',v_after->>'source')='auto' and (v_before-'updated_at') is distinct from (v_after-'updated_at') then
          insert into public.hr_attendance_audit(employee_id,work_date,action,before,after,reason,actor)
          values(l.employee_id,d,'leave_sync',v_before,v_after,'تحديث الحضور بعد قرار زمنية معتمدة',auth.uid());
        end if;
      end if;
      d := d+1;
    end loop;
    perform app.hr_refresh_alerts(l.employee_id, l.start_date); perform app.hr_refresh_alerts(l.employee_id, l.end_date);
  end if;
end$$;

-- إظهار الزمنية حتى مع نقص بصمة أو تأخير آخر، دون إخفاء حالة الحضور الحقيقية.
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
        'in', case when c.check_in is null then null else to_char((c.check_in at time zone 'UTC') + app.hr_tz(), 'HH24:MI') end,
        'out', case when c.check_out is null then null else to_char((c.check_out at time zone 'UTC') + app.hr_tz(), 'HH24:MI') end,
        'w', coalesce(c.worked_minutes, 0), 'late', coalesce(c.late_minutes, 0), 'early', coalesce(c.early_minutes, 0), 'short', coalesce(c.shortfall_minutes, 0), 'ot', coalesce(c.overtime_minutes, 0), 'permit', coalesce(c.permit_minutes, 0),
        'has_permit', exists (select 1 from public.hr_leaves l where l.employee_id=c.employee_id and l.start_date=c.d and l.kind='time_permit' and l.status='approved'),
        'pm', coalesce(c.proposed_deduction_minutes, 0), 'pd', coalesce(c.proposed_deduction_days, 0), 'waived', coalesce(c.deduction_waived, false), 'note', c.edit_reason) order by c.d)
     from cell c where c.employee_id = e.id),
    (select count(*) from cell c where c.employee_id = e.id and c.status in ('present', 'time_permit'))::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'late')::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'early_leave')::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'incomplete')::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'absent')::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'leave')::int,
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

-- إعادة الاحتساب اليدوي تتسلسل أيضاً مع الإقفال قبل حذف الصف.
create or replace function public.ops_attendance_reset(p_employee uuid, p_date date, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare b jsonb;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  perform app.hr_payroll_lock_range(p_date,p_date);
  if app.hr_month_locked(p_date) then raise exception 'HR_MONTH_LOCKED'; end if;
  if app.hr_month_confirmed(p_date) then raise exception 'HR_ATTENDANCE_CONFIRMED'; end if;
  select to_jsonb(d) into b from public.hr_attendance_days d where d.employee_id = p_employee and d.work_date = p_date;
  delete from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  perform app.hr_evaluate_day(p_employee, p_date);
  insert into public.hr_attendance_audit (employee_id, work_date, action, before, after, reason, actor)
  values (p_employee, p_date, 'reset_auto', b, (select to_jsonb(d) from public.hr_attendance_days d where d.employee_id = p_employee and d.work_date = p_date), trim(p_reason), auth.uid());
end$$;

-- تسمية سبب إعادة الفتح تشمل الزمنيات أيضاً.
create or replace function app.hr_leave_reopen_confirmed(p_employee uuid, p_date date) returns void
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month',p_date)::date; changed int;
begin
  if current_setting('app.attendance_confirming', true) = 'on' then return; end if;
  update public.hr_attendance_confirmations set status='reopened', reopened_at=now(), reopened_by=auth.uid(),
    reopen_reason='تغيير إجازة أو زمنية معتمدة بعد اعتماد الحضورية — يلزم إعادة التدقيق والاعتماد', updated_at=now()
  where period_month=m and status='confirmed';
  get diagnostics changed = row_count;
  if changed > 0 then
    insert into public.hr_attendance_audit(employee_id,work_date,action,reason,actor,after)
    values (p_employee,p_date,'reopen','أُعيد فتح حضورية الشهر آلياً بسبب تغيير إجازة أو زمنية معتمدة',auth.uid(),jsonb_build_object('month',m));
    perform app.notify_by_role(array['ops_room','it_admin'], 'إعادة تدقيق الحضورية بعد تغيير إجازة أو زمنية',
      'أُعيد فتح حضورية شهر ' || to_char(m,'YYYY-MM') || ' بسبب إجازة أو زمنية معتمدة؛ يلزم إعادة التدقيق والاعتماد قبل التصدير.', 'warning', '/ops/attendance');
  end if;
end$$;


-- تحديث الأيام القديمة في الأشهر المفتوحة؛ المقفول يبقى كما هو وتوثّق الحالات المحتاجة مراجعة.
create or replace function app.hr_permit_reconcile_existing() returns void
language plpgsql security definer set search_path=public,app as $$
declare r record; sh record; rl jsonb; b jsonb; n jsonb; v_was_confirmed boolean; old_confirm text;
  v_in_cover int; v_out_cover int; v_calc int; v_late int; v_extra int; v_early int; v_grace int;
begin
  for r in
    select a.* from public.hr_attendance_days a
    where a.status <> 'leave' and exists (select 1 from public.hr_leaves l where l.employee_id=a.employee_id and l.start_date=a.work_date and l.kind='time_permit' and l.status='approved')
    order by a.work_date,a.employee_id
  loop
    perform app.hr_payroll_lock_range(r.work_date,r.work_date);
    -- إعادة قراءة الصف والطلب بعد انتظار القفل، لا الاعتماد على لقطة القائمة القديمة.
    select a.* into r from public.hr_attendance_days a where a.id=r.id for update;
    if not found then continue; end if;
    if r.status='leave' or not exists (select 1 from public.hr_leaves l where l.employee_id=r.employee_id and l.start_date=r.work_date and l.kind='time_permit' and l.status='approved') then continue; end if;
    if app.hr_month_locked(r.work_date) then
      -- لا نغيّر الصف المقفول؛ نكشف فقط فرق النقص القابل للتحقق أو الزمنية المخفية بحالة يدوية مكتملة.
      if r.status in ('present','late','early_leave','time_permit') and not r.is_rest_day
         and r.expected_in is not null and r.expected_out is not null and r.check_in is not null and r.check_out is not null then
        select * into sh from app.hr_effective_shift(r.employee_id,r.work_date);
        v_in_cover:=app.hr_permit_overlap_minutes(r.employee_id,r.work_date,r.expected_in,least(r.check_in,r.expected_out),((r.expected_in at time zone 'UTC')+app.hr_tz())::time,((r.expected_out at time zone 'UTC')+app.hr_tz())::time,true);
        v_out_cover:=app.hr_permit_overlap_minutes(r.employee_id,r.work_date,greatest(r.check_out,r.expected_in),r.expected_out,((r.expected_in at time zone 'UTC')+app.hr_tz())::time,((r.expected_out at time zone 'UTC')+app.hr_tz())::time,true);
        rl:=app.hr_deduction_rule_for(r.employee_id,r.work_date);
        if coalesce(rl->>'shortfall_method','tiers')='hour_bank' then
          v_grace:=coalesce((rl->>'grace_minutes_default')::int,15);
          v_late:=greatest(0,floor(extract(epoch from(r.check_in-r.expected_in))/60)::int);
          v_late:=greatest(0,v_late-v_in_cover);
          if v_late<=v_grace then v_late:=0; end if;
          v_extra:=greatest(0,floor(extract(epoch from(r.check_out-r.expected_out))/60)::int);
          v_early:=greatest(0,floor(extract(epoch from(r.expected_out-r.check_out))/60)::int);
          v_calc:=greatest(0,v_late-v_extra)+greatest(0,v_early-v_out_cover);
        else
          v_calc:=greatest(0,greatest(0,floor(extract(epoch from(r.expected_out-r.expected_in))/60)::int-r.worked_minutes)-v_in_cover-v_out_cover);
        end if;
        if (v_calc is distinct from r.shortfall_minutes or (r.source='manual' and r.status='present')) and not exists
          (select 1 from public.hr_attendance_audit x where x.employee_id=r.employee_id and x.work_date=r.work_date and x.action='auto_blocked' and x.reason='مراجعة تعارض زمنية في شهر مقفل مالياً — دون تعديل الحضور أو الراتب') then
          insert into public.hr_attendance_audit(employee_id,work_date,action,before,after,reason,actor)
          values(r.employee_id,r.work_date,'auto_blocked',to_jsonb(r),jsonb_build_object('shortfall_for_review',v_calc),
            'مراجعة تعارض زمنية في شهر مقفل مالياً — دون تعديل الحضور أو الراتب',auth.uid());
        end if;
      end if;
    else
      b:=to_jsonb(r); v_was_confirmed:=app.hr_month_confirmed(r.work_date); old_confirm:=current_setting('app.attendance_confirming',true);
      if v_was_confirmed then perform set_config('app.attendance_confirming','on',true); end if;
      perform app.hr_evaluate_day(r.employee_id,r.work_date);
      if v_was_confirmed then perform set_config('app.attendance_confirming',coalesce(old_confirm,''),true); end if;
      select to_jsonb(a) into n from public.hr_attendance_days a where a.employee_id=r.employee_id and a.work_date=r.work_date;
      if (b-'updated_at') is distinct from (n-'updated_at') then
        if v_was_confirmed then perform app.hr_leave_reopen_confirmed(r.employee_id,r.work_date); end if;
        if coalesce(b->>'source',n->>'source')='auto' then
          insert into public.hr_attendance_audit(employee_id,work_date,action,before,after,reason,actor)
          values(r.employee_id,r.work_date,'leave_sync',b,n,'تصحيح حساب زمنية قديمة في شهر غير مقفل مالياً',auth.uid());
        end if;
      end if;
    end if;
  end loop;
end$$;
revoke all on function app.hr_permit_reconcile_existing() from public,anon,authenticated;
select app.hr_permit_reconcile_existing();
