-- 00218 · بنك الساعات — تصحيح القاعدة إلى «اليوم الواحد» + حصر صلاحيات غرفة العمليات
--   ① لا تعويض بين الأيام: نقص اليوم = max(0, تأخير فوق السماحية − بقاء بعد النهاية في نفس اليوم) + خروج مبكر − زمنية مدفوعة.
--      فائض اليوم = ما زاد من البقاء بعد تغطية التأخير + المجيء المبكر ⇒ رصيد إجازة شهرياً (دقائق الشفت = يوم) بسقف من التطوير المركزية.
--   ② الاستقطاع الشهري = مجموع نقص الأيام × أجر الدقيقة (يمر عبر مسار الاستقطاع التلقائي نفسه: السقف/الوضع الثابت/التوقف).
--      «المطلوب/المعمول» يُعرضان للعلم فقط. يُلغى إعداد أيام الإجازة الشهرية (لم يعد له دور).
--   ③ غرفة العمليات: لا تُلغي استقطاعاً (الإعفاء لمعاون المدير المفوض في وحدة قادمة)، وتعديل الحضور محصور بالأيام ذات البصمة الناقصة أو بلا بصمات.

create or replace function app.hr_deduction_keys() returns text[] language sql immutable as $$
  select array['auto_deduction_enabled','deduct_absence_enabled','deduct_shortfall_enabled','deduct_unpaid_leave_enabled','deduction_tiers','absent_day_deduction_days',
               'incomplete_punch_as_absent','grace_minutes_default','auto_deduction_amount_mode','fixed_absent_day_amount','fixed_shortfall_minute_amount',
               'max_auto_deduction_days_per_month','auto_deduction_cap_ratio','shortfall_method','shortfall_multiplier','shortfall_block_minutes',
               'hour_bank_credit_cap_days']
$$;
create or replace function app.hr_deduction_defaults() returns jsonb language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'auto_deduction_enabled', true, 'deduct_absence_enabled', true, 'deduct_shortfall_enabled', true, 'deduct_unpaid_leave_enabled', true,
    'deduction_tiers', '[{"from":1,"to":15,"minutes":0},{"from":16,"to":30,"minutes":30},{"from":31,"to":60,"minutes":60},{"from":61,"to":120,"minutes":120},{"from":121,"to":null,"day_fraction":0.5}]'::jsonb,
    'absent_day_deduction_days', 1, 'incomplete_punch_as_absent', false, 'grace_minutes_default', 15, 'auto_deduction_amount_mode', 'salary',
    'fixed_absent_day_amount', 0, 'fixed_shortfall_minute_amount', 0, 'max_auto_deduction_days_per_month', 0, 'auto_deduction_cap_ratio', 1,
    'shortfall_method', 'tiers', 'shortfall_multiplier', 1, 'shortfall_block_minutes', 30,
    'hour_bank_credit_cap_days', 2)
  || coalesce((select jsonb_object_agg(k, v) from jsonb_each(app.hr_policy()) kv(k, v) where k = any (app.hr_deduction_keys())), '{}'::jsonb)
$$;
update public.hr_policy set settings = settings - 'hour_bank_off_days_per_month' where settings ? 'hour_bank_off_days_per_month';
update public.hr_deduction_rules set settings = settings - 'hour_bank_off_days_per_month' where settings ? 'hour_bank_off_days_per_month';

-- ── ② ميزان الشهر (توقيع جديد ⇒ إسقاط التابع ثم الدالة) ──
drop function if exists public.ops_hour_bank_month(date);
drop function if exists app.hr_hour_bank(uuid, date);
create function app.hr_hour_bank(p_employee uuid, p_month date)
returns table(enabled boolean, shift_minutes int, days_in_month int, covered_days int, rest_days int, required_days numeric,
              required_minutes int, credited_minutes int, net_minutes int, deduction_minutes int, surplus_minutes int,
              credit_days numeric, credit_cap_days numeric, credit_capped boolean, grace_minutes int,
              days_counted int, days_absent int, days_leave_paid int, days_leave_unpaid int, days_incomplete int, days_short int)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; m_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
        rl jsonb := app.hr_deduction_rule_for(p_employee, m); per record; sh record;
        v_on boolean; v_grace int; v_cap numeric; v_shift int; v_req int := 0; v_sf int := 0; v_sur int := 0;
        v_rest int := 0; v_cnt int := 0; v_abs int := 0; v_lp int := 0; v_lu int := 0; v_inc int := 0; v_nshort int := 0; v_inc_pay boolean; v_raw_days numeric;
begin
  v_on := coalesce(rl ->> 'shortfall_method', 'tiers') = 'hour_bank'
          and coalesce((rl ->> 'auto_deduction_enabled')::boolean, true) and coalesce((rl ->> 'deduct_shortfall_enabled')::boolean, true);
  v_grace := coalesce((rl ->> 'grace_minutes_default')::int, 15);
  v_cap := coalesce((rl ->> 'hour_bank_credit_cap_days')::numeric, 2);
  v_inc_pay := app.hr_incomplete_payable(p_employee, m);
  select * into per from app.hr_month_period(m) p where p.employee_id = p_employee;
  if not found then per := null; end if;
  select coalesce(nullif(max(a.required_minutes), 0), 0) into v_shift from public.hr_attendance_days a where a.employee_id = p_employee and a.work_date between m and m_to and not a.is_rest_day;
  if v_shift = 0 then
    select * into sh from app.hr_effective_shift(p_employee, coalesce(per.period_from, m));
    if found then
      v_shift := case when sh.kind = 'flexible' and sh.required_hours is not null then round(sh.required_hours * 60)::int
                      else floor(extract(epoch from (sh.end_time - sh.start_time)) / 60)::int end;
      if v_shift <= 0 then v_shift := v_shift + 1440; end if;
    end if;
    if coalesce(v_shift, 0) <= 0 then v_shift := 480; end if;
  end if;
  select count(*) filter (where a.is_rest_day), count(*) filter (where a.status = 'absent' and not a.is_rest_day),
         count(*) filter (where a.status = 'incomplete' and not a.is_rest_day),
         count(*) filter (where a.status = 'leave' and not a.is_rest_day and lp.paid), count(*) filter (where a.status = 'leave' and not a.is_rest_day and not lp.paid),
         count(*) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit') and not a.is_rest_day),
         count(*) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit') and not a.is_rest_day and a.shortfall_minutes > 0 and not a.deduction_waived),
         coalesce(sum(a.required_minutes) filter (where not a.is_rest_day and (a.status in ('present', 'late', 'early_leave', 'time_permit') or (a.status = 'incomplete' and v_inc_pay))), 0)::int,
         -- النقص: مجموع نقص الأيام (قاعدة اليوم الواحد) — الإعفاء الموثّق يُصفّر يومه
         coalesce(sum(a.shortfall_minutes) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit') and not a.is_rest_day and not a.deduction_waived), 0)::int,
         coalesce(sum(a.overtime_minutes) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit') and not a.is_rest_day), 0)::int
    into v_rest, v_abs, v_inc, v_lp, v_lu, v_cnt, v_nshort, v_req, v_sf, v_sur
  from public.hr_attendance_days a
  cross join lateral (select exists (
      select 1 from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
      where l.employee_id = a.employee_id and l.status = 'approved' and l.kind = 'leave' and t.is_paid and a.work_date between l.start_date and l.end_date) as paid) lp
  where a.employee_id = p_employee and a.work_date between m and m_to;
  v_raw_days := round(v_sur::numeric / greatest(v_shift, 1), 3);
  return query select v_on, v_shift, coalesce(per.days_in_month, 0), coalesce(per.covered_days, 0), v_rest,
    (v_cnt + case when v_inc_pay then v_inc else 0 end)::numeric, v_req, v_req - v_sf + v_sur, v_sur - v_sf, v_sf, v_sur,
    least(v_raw_days, v_cap), v_cap, v_raw_days > v_cap, v_grace, v_cnt, v_abs, v_lp, v_lu, v_inc, v_nshort;
end$$;

create function public.ops_hour_bank_month(p_month date)
returns table(employee_id uuid, employee_number text, full_name text, department_name text, enabled boolean, shift_minutes int,
              covered_days int, days_counted int, days_absent int, days_leave_paid int, days_leave_unpaid int, days_short int, required_days numeric,
              required_minutes int, credited_minutes int, net_minutes int, deduction_minutes int, surplus_minutes int,
              credit_days numeric, credit_cap_days numeric, credit_capped boolean, grace_minutes int)
language sql stable security definer set search_path = public, app as $$
  select e.id, e.employee_number, e.full_name, d.name, hb.enabled, hb.shift_minutes,
         hb.covered_days, hb.days_counted, hb.days_absent, hb.days_leave_paid, hb.days_leave_unpaid, hb.days_short, hb.required_days,
         hb.required_minutes, hb.credited_minutes, hb.net_minutes, hb.deduction_minutes, hb.surplus_minutes,
         hb.credit_days, hb.credit_cap_days, hb.credit_capped, hb.grace_minutes
  from app.hr_month_summary(p_month) s
  join public.employees e on e.id = s.employee_id
  left join public.departments d on d.id = e.department_id
  cross join lateral app.hr_hour_bank(e.id, p_month) hb
  where app.has_role(array['ops_room', 'finance_officer', 'hr_officer', 'it_admin', 'deputy_director', 'super_admin'])
  order by d.name nulls last, app.hr_employee_sort_key(e.employee_number), e.full_name
$$;
grant execute on function public.ops_hour_bank_month(date) to authenticated;

-- التصدير: المبلغ محسوب أصلاً من الدقائق المقترحة (= مجموع النقص)؛ هنا تُكتب أعمدة البنك فقط
create or replace function app.hr_hour_bank_apply_export(p_export uuid, p_month date) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; n int := 0;
begin
  update public.hr_month_export_rows r set
    hour_bank_enabled = true, hour_bank_required_minutes = hb.required_minutes, hour_bank_credited_minutes = hb.credited_minutes,
    hour_bank_net_minutes = hb.net_minutes, hour_bank_credit_days = hb.credit_days, shift_minutes = hb.shift_minutes,
    auto_deduction_basis = case when r.auto_deduction_basis = 'disabled' then 'disabled' else 'hour_bank' end
  from (select x.id, hb.* from public.hr_month_export_rows x cross join lateral app.hr_hour_bank(x.employee_id, m) hb where x.export_id = p_export and hb.enabled) hb
  where r.id = hb.id;
  get diagnostics n = row_count;
  return n;
end$$;


-- الوقت الإضافي القديم لا يُقيَّد لمن هم على بنك الساعات (فائضهم يُقيَّد من البنك بسقفه)
create or replace function app.hr_overtime_credit(p_month date) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; r record; n int := 0; per_day int; v_days numeric;
begin
  if not app.hr_policy_bool('overtime_enabled', true) then return 0; end if;
  for r in select employee_id, overtime_minutes, shift_minutes from app.hr_month_summary(m) where overtime_minutes > 0 loop
    if (select hb.enabled from app.hr_hour_bank(r.employee_id, m) hb) then continue; end if;
    per_day := coalesce(app.hr_policy_int('overtime_minutes_per_leave_day', 0), 0);
    if per_day <= 0 then per_day := r.shift_minutes; end if;
    v_days := round(r.overtime_minutes::numeric / per_day, 3);
    if v_days > 0 then
      insert into public.hr_leave_ledger (employee_id, year, kind, days, period_month, note)
      values (r.employee_id, extract(year from m)::int, 'overtime', v_days, m, 'دوام إضافي ' || r.overtime_minutes || ' دقيقة في ' || to_char(m, 'YYYY-MM'))
      on conflict (employee_id, period_month) where kind = 'overtime' do update set days = excluded.days, note = excluded.note;
      n := n + 1;
    end if;
  end loop;
  return n;
end$$;

create or replace function app.hr_hour_bank_credit(p_month date) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; r record; hb record; n int := 0;
begin
  for r in select s.employee_id from app.hr_month_summary(m) s loop
    select * into hb from app.hr_hour_bank(r.employee_id, m);
    if not hb.enabled then continue; end if;
    if hb.credit_days > 0 then
      insert into public.hr_leave_ledger (employee_id, year, kind, days, period_month, note)
      values (r.employee_id, extract(year from m)::int, 'overtime', hb.credit_days, m,
              'بنك الساعات ' || to_char(m, 'YYYY-MM') || ': فائض ' || hb.surplus_minutes || ' دقيقة = ' || hb.credit_days || ' يوم'
              || case when hb.credit_capped then ' (بلغ السقف الشهري ' || hb.credit_cap_days || ' يوم)' else '' end)
      on conflict (employee_id, period_month) where kind = 'overtime' do update set days = excluded.days, note = excluded.note;
      n := n + 1;
    else
      delete from public.hr_leave_ledger l where l.employee_id = r.employee_id and l.period_month = m and l.kind = 'overtime';
    end if;
  end loop;
  return n;
end$$;

-- ── ③ صلاحيات غرفة العمليات ──
create or replace function public.ops_deduction_waive(p_employee uuid, p_date date, p_waive boolean, p_reason text) returns void
language plpgsql security definer set search_path = public, app as $$
declare a record;
begin
  -- 00218: الإعفاء من الاستقطاع ليس من صلاحية غرفة العمليات (يُنقل إلى وحدة معاون المدير المفوض)
  if app.has_role(array['ops_room']) and not app.has_role(array['super_admin']) then raise exception 'HR_WAIVE_NOT_ALLOWED'; end if;
  if not app.has_role(array['super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  if app.hr_month_locked(p_date) then raise exception 'HR_MONTH_LOCKED'; end if;
  select * into a from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  update public.hr_attendance_days set deduction_waived = p_waive, waive_reason = case when p_waive then trim(p_reason) else null end, waived_by = case when p_waive then auth.uid() else null end
  where id = a.id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, before, after, reason, actor)
  values (p_employee, p_date, case when p_waive then 'waive' else 'unwaive' end,
    jsonb_build_object('proposed_minutes', a.proposed_deduction_minutes, 'proposed_days', a.proposed_deduction_days, 'waived', a.deduction_waived),
    jsonb_build_object('waived', p_waive), trim(p_reason), auth.uid());
  perform app.hr_refresh_alerts(p_employee, p_date);
end$$;

-- التعديل محصور: اليوم بلا صف، أو بصمة ناقصة، أو غياب بلا بصمات. يوم ببصمتين (حاضر/متأخر/خروج مبكر/زمنية) لا يُعدَّل.
alter function public.ops_attendance_edit(uuid, date, timestamptz, timestamptz, text, text) set schema app;
create function public.ops_attendance_edit(p_employee uuid, p_date date, p_check_in timestamptz, p_check_out timestamptz, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare r record;
begin
  select * into r from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  if found and app.has_role(array['ops_room']) and not app.has_role(array['super_admin'])
     and r.status in ('present', 'late', 'early_leave', 'time_permit') and r.check_in is not null and r.check_out is not null then
    raise exception 'HR_EDIT_LIMITED';
  end if;
  perform app.ops_attendance_edit(p_employee, p_date, p_check_in, p_check_out, p_status, p_reason);
end$$;
grant execute on function public.ops_attendance_edit(uuid, date, timestamptz, timestamptz, text, text) to authenticated;

-- ── ④ المحرّك اليومي (نسخة 00216 + قاعدة اليوم الواحد) ──
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
      v_ot := greatest(0, a.worked_minutes - v_req);
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
      v_sur := greatest(0, v_extra - v_late_eff) + v_early_in;
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
