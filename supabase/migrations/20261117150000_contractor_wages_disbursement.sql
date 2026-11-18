-- ═══════════════════════════════════════════════════════════════
-- أجور المتعهدين على مسار الصرف (بقواعد البصمة): «اعتماد وإرسال» ← طلب صرف للمدير المفوض ← قراره ← صرف المالية من القاصة
--
--   الواقع قبل هذا الترحيل: كشف أجور المتعهدين (finance_contractor_wages_sheet) يحسب الأجر من العدد المعتمد من غرفة العمليات وحده،
--   ولا يقرأ البصمة، ولا يمر بالمدير المفوض، ولا يخصم من القاصة.
--
--   ما يضيفه (قرارات المالك):
--     • «اعتماد وإرسال» من صفحة أجور المتعهدين ينشئ طلب صرف واحداً للشهر (النوع contractor_wages) بأرقام وأسماء مجمّدة،
--       ويصل للمدير المفوض عبر مسار الصرف نفسه (قرار ← صرف المالية ← حركة قاصة واحدة نهائية).
--     • غياب البصمة يوقف أجر اليوم كله: أجر المتعهد وأجور عماله (N−1) معاً.
--       الغياب = حالة absent، أو إجازة معتمدة (leave)، أو لا سجل حضور لذلك اليوم.
--       البصمة الناقصة (دخول بلا خروج أو العكس) تُدفع كما يعاملها نظام الموظفين افتراضياً، ولا تظهر للمدير المفوض.
--     • نقص الدقائق = shortfall_minutes من محرك الحضور (الشفت المرن يسجّل نقصه خروجاً مبكراً لا تأخيراً، فالعمود الموحَّد هو الصحيح).
--       يُستقطع من أجر المتعهد اليومي وحده: الأجر × النقص ÷ الدقائق المطلوبة لذلك اليوم (required_minutes من المحرك، لا رقم ثابت)،
--       مقرَّباً لأقرب دينار وبسقف أجره اليومي. السماح = grace_minutes_default من قاعدة الاستقطاع للمتعهد نفسه (الافتراضي 15):
--       النقص ضمن السماح لا يُستقطع، وإن تجاوزه يُستقطع النقص كله (كما يفعل نظام الموظفين).
--       وتُحترم مفاتيح القاعدة نفسها: لا استقطاع إن كان المتعهد مستثنى أو auto_deduction_enabled أو deduct_shortfall_enabled معطّلة.
--     • شروط الإرسال (تُرفض العملية بالرمز المذكور إن لم تتحقق):
--         الشهر مقفل من غرفة العمليات ............ CONTRACTOR_WAGES_MONTH_NOT_LOCKED
--         لا طلب قائم لهذا الشهر .................. DISBURSEMENT_ACTIVE_EXISTS
--         حضور الشهر مؤكَّد (كشرط كشف الموظفين) .... HR_ATTENDANCE_NOT_CONFIRMED
--         أجور محدَّدة لكل متعهد له أيام صرف ....... CONTRACTOR_WAGES_RATES_MISSING:عدد
--         كل متعهد مربوط ببصمة (موظف برقم بصمة) .... CONTRACTOR_WAGES_NO_FINGERPRINT:عدد
--         يوجد أيام صرف معتمدة ..................... CONTRACTOR_WAGES_NO_DAYS
--         الصافي أكبر من صفر ....................... CONTRACTOR_WAGES_NOTHING_PAYABLE (لا يُذكر مع «لا بصمة»: يُعرض السبب الجذري وحده)
--     • الرفض يعيد الطلب للمالية بالسبب والشهر يبقى مقفلاً؛ إعادة الإرسال (resubmit أو «اعتماد وإرسال» ثانية) تُنشئ نسخة جديدة
--       تُحسب من البيانات الحالية، فيمكن تصحيح الأجر اليومي بعد الرفض.
--     • تجميد المدخلات: ما دام للشهر طلب قائم (بانتظار القرار/معتمد/مصروف) لا يُعاد فتحه من غرفة العمليات
--       (CONTRACTOR_MONTH_HAS_DISBURSEMENT) ولا تُعدَّل أجوره اليومية (DISBURSEMENT_RATES_FROZEN).
--
--   ما لا يلمسه: لا تعديل على finance_contractor_wages_sheet ولا finance_contractor_wage_days (يبقيان كما هما)،
--   ولا على أي دالة قاصة، ولا على جداول طلبات الصرف (تُستعمل كما أنشأتها الترحيلة السابقة).
--   يعيد تعريف ثلاث دوال قائمة بإضافة حارس واحد في كل منها دون أي تغيير آخر في نصها:
--     ops_contractor_month_reopen · finance_contractor_rates_set · finance_contractor_rates_copy_previous
--   ويعيد تعريف app.disbursement_resubmit__raw بفرع جديد لأجور المتعهدين (فرع الموظفين كما هو حرفياً).
--
--   يعتمد على الترحيلتين السابقتين (أنواع القاصة + جداول الطلبات) — تُنفَّذ قبل هذا الملف.
--   التراجع: إعادة تعريف الدوال الأربع المذكورة بنصوصها السابقة، ثم حذف الدوال الجديدة (لا بيانات قبل أول إرسال).
-- ═══════════════════════════════════════════════════════════════

do $guard$ begin
  if to_regclass('public.payroll_disbursements') is null then
    raise exception 'M3_REQUIRES_M2: نفّذ ترحيلة طلبات الصرف (20261117140000) قبل هذه الترحيلة';
  end if;
end $guard$;

-- ① أيام الصرف لكل متعهد بقواعد البصمة (داخلية — لا تُنادى من الواجهة)
--    يوم الصرف = يوم له عدد معتمد > 0 من المصدر المعتمد في شهر مقفل (كما يفعل كشف الأجور الحالي).
--    مدفوع (paid): حاضر/متأخر/خروج مبكر/زمنية/بصمة ناقصة. موقوف (blocked): غياب أو إجازة معتمدة أو لا سجل حضور.
create or replace function app.contractor_wage_days(p_month date, p_contractor uuid default null)
returns table (
  contractor_user_id uuid, log_date date, headcount integer, workers integer, employee_id uuid,
  att_status text, check_in timestamptz, check_out timestamptz,
  required_minutes integer, shortfall_minutes integer, grace_minutes integer, deduct_minutes integer,
  state text, block_reason text,
  base_pay numeric, blocked_pay numeric, deduction numeric, day_pay numeric)
language sql stable security definer set search_path = public, app as $$
  with m as (
    select date_trunc('month', p_month)::date as f
  ), ap as (
    select x.approved_source from public.contractor_month_approvals x join m on x.month = m.f where x.is_locked
  ), d as (
    select c.contractor_user_id, c.log_date, c.headcount
      from public.contractor_daily_counts c cross join m cross join ap
     where c.source = ap.approved_source and c.headcount > 0
       and c.log_date >= m.f and c.log_date < (m.f + interval '1 month')::date
       and (p_contractor is null or c.contractor_user_id = p_contractor)
  ), j as (
    select d.contractor_user_id, d.log_date, d.headcount, greatest(0, d.headcount - 1) as workers,
           r.contractor_daily_wage as cw, r.worker_daily_wage as ww,
           e.id as employee_id, h.id as att_id, h.status as att_status, h.check_in, h.check_out,
           coalesce(h.required_minutes, 0) as req, coalesce(h.shortfall_minutes, 0) as short
      from d
      left join public.contractor_rates r on r.contractor_user_id = d.contractor_user_id and r.month = (select f from m)
      left join lateral (select e0.id from public.employees e0 where e0.user_id = d.contractor_user_id order by e0.id limit 1) e on true
      left join public.hr_attendance_days h on h.employee_id = e.id and h.work_date = d.log_date
  ), g as (
    select j.*,
           case when j.att_id is not null and j.att_status in ('present', 'late', 'early_leave', 'time_permit', 'incomplete') then 'paid' else 'blocked' end as st,
           case when j.att_id is null then 'no_record'
                when j.att_status in ('present', 'late', 'early_leave', 'time_permit', 'incomplete') then null
                else j.att_status end as why
      from j
  ), k as (
    select g.*,
           -- قاعدة الاستقطاع للمتعهد نفسه (قابلة للتخصيص من وحدة قواعد الاستقطاع)؛ تُقرأ فقط لأيام فيها نقص
           case when g.st = 'paid' and g.att_status <> 'incomplete' and g.req > 0 and g.short > 0
                then app.hr_deduction_rule_for(g.employee_id, g.log_date) end as rule
      from g
  ), n as (
    select k.*,
           case when k.rule is null then 0 else coalesce((k.rule ->> 'grace_minutes_default')::int, 15) end as grace,
           -- يُستقطع النقص كله إن تجاوز السماح، ما لم تُعطَّل القاعدة (استثناء المتعهد أو إيقاف الاستقطاع التلقائي أو استقطاع النقص)
           case when k.rule is not null
                 and coalesce((k.rule ->> 'auto_deduction_enabled')::boolean, true) and coalesce((k.rule ->> 'deduct_shortfall_enabled')::boolean, true)
                 and k.short > coalesce((k.rule ->> 'grace_minutes_default')::int, 15) then k.short else 0 end as ded_min,
           case when k.cw is null then null else k.cw + k.ww * k.workers end as base
      from k
  )
  select n.contractor_user_id, n.log_date, n.headcount, n.workers, n.employee_id, n.att_status, n.check_in, n.check_out,
         n.req, n.short, n.grace, n.ded_min, n.st, n.why,
         n.base,
         case when n.base is null then null when n.st = 'blocked' then n.base else 0 end,
         case when n.base is null then null when n.ded_min > 0 then least(n.cw, round(n.cw * n.ded_min / n.req, 0)) else 0 end,
         case when n.base is null then null when n.st = 'blocked' then 0
              else n.base - case when n.ded_min > 0 then least(n.cw, round(n.cw * n.ded_min / n.req, 0)) else 0 end end
    from n
$$;

-- ② حالة الشهر وشروط الإرسال (داخلية؛ تقرأ منها دالة الجاهزية العامة ودالة الإنشاء فلا يتباعد المنطقان)
create or replace function app.contractor_wages_state(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  m date := date_trunc('month', p_month)::date;
  v_locked boolean; v_att_req boolean := app.hr_policy_bool('require_attendance_confirmation', true); v_att_ok boolean; v_pending int;
  v_n int := 0; v_no_rate int := 0; v_no_fp int := 0; v_net numeric := 0; v_gross numeric := 0; v_ded numeric := 0;
  v_active public.payroll_disbursements; v_rej public.payroll_disbursements; v_bl text[] := '{}';
begin
  v_locked := exists (select 1 from public.contractor_month_approvals x where x.month = m and x.is_locked);
  v_att_ok := app.hr_month_confirmed(m);
  v_pending := (select count(*) from public.hr_attendance_pending_auto p where p.period_month = m);
  with per as (
    select w.contractor_user_id, bool_or(w.base_pay is null) as no_rate, sum(w.day_pay) as net, sum(w.base_pay) as gross, sum(w.blocked_pay + w.deduction) as ded,
           exists (select 1 from public.employees e where e.user_id = w.contractor_user_id and e.biometric_pin is not null) as has_fp
      from app.contractor_wage_days(m) w group by w.contractor_user_id)
  select count(*), count(*) filter (where per.no_rate), count(*) filter (where not per.has_fp),
         coalesce(sum(per.net), 0), coalesce(sum(per.gross), 0), coalesce(sum(per.ded), 0)
    into v_n, v_no_rate, v_no_fp, v_net, v_gross, v_ded from per;
  select * into v_active from public.payroll_disbursements d
   where d.kind = 'contractor_wages' and d.period_month = m and d.status in ('pending_approval', 'approved', 'paid') limit 1;
  select * into v_rej from public.payroll_disbursements d
   where d.kind = 'contractor_wages' and d.period_month = m and d.status = 'rejected' order by d.version desc limit 1;
  if not v_locked then v_bl := array_append(v_bl, 'month_not_locked'); end if;
  if v_active.id is not null then v_bl := array_append(v_bl, 'active_request'); end if;
  if v_att_req and (not v_att_ok or v_pending > 0) then v_bl := array_append(v_bl, 'attendance_not_confirmed'); end if;
  if v_no_rate > 0 then v_bl := array_append(v_bl, 'rates_missing'); end if;
  if v_no_fp > 0 then v_bl := array_append(v_bl, 'no_fingerprint'); end if;
  if v_locked and v_n = 0 then v_bl := array_append(v_bl, 'no_days'); end if;
  -- «لا شيء مستحق» نتيجة منطقية لغياب البصمة كلها: لا تُذكر معه (يُذكر السبب الجذري فقط)
  if v_locked and v_n > 0 and v_no_rate = 0 and v_no_fp = 0 and v_net <= 0 then v_bl := array_append(v_bl, 'nothing_payable'); end if;
  return jsonb_build_object(
    'month', m, 'locked', v_locked,
    'attendance_required', v_att_req, 'attendance_confirmed', v_att_ok, 'attendance_pending_auto', v_pending,
    'contractors', v_n, 'missing_rates', v_no_rate, 'no_fingerprint', v_no_fp,
    'gross_total', case when v_no_rate > 0 then null else v_gross end,
    'deductions_total', case when v_no_rate > 0 then null else v_ded end,
    'net_total', case when v_no_rate > 0 then null else v_net end,
    'active_request', case when v_active.id is null then null else jsonb_build_object('id', v_active.id, 'request_no', v_active.request_no, 'status', v_active.status, 'version', v_active.version, 'net_total', v_active.net_total) end,
    'latest_rejected', case when v_rej.id is null then null else jsonb_build_object('id', v_rej.id, 'request_no', v_rej.request_no, 'version', v_rej.version, 'net_total', v_rej.net_total, 'decision_note', v_rej.decision_note) end,
    'blockers', to_jsonb(v_bl), 'can_send', cardinality(v_bl) = 0);
end$$;

-- ③ إنشاء طلب أجور المتعهدين (داخلية): تتحقق من الشروط وتجمّد الأرقام والأسماء وتُشعر المدير المفوض
create or replace function app.disbursement_open_contractors(p_month date, p_note text default null, p_supersedes uuid default null) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  m date := date_trunc('month', p_month)::date; s jsonb; v_b text; v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_id uuid; v_no text; v_ver int; v_sup uuid; v_sup_net numeric; v_prev numeric; v_by uuid := auth.uid();
  v_cnt int; v_pay int; v_gross numeric; v_ded numeric; v_net numeric; u record; v_amt text; v_label text := app.disbursement_kind_label('contractor_wages');
begin
  s := app.contractor_wages_state(m);
  v_b := s -> 'blockers' ->> 0;
  if v_b is not null then
    raise exception '%', case v_b
      when 'month_not_locked' then 'CONTRACTOR_WAGES_MONTH_NOT_LOCKED'
      when 'active_request' then 'DISBURSEMENT_ACTIVE_EXISTS'
      when 'attendance_not_confirmed' then 'HR_ATTENDANCE_NOT_CONFIRMED'
      when 'rates_missing' then 'CONTRACTOR_WAGES_RATES_MISSING:' || (s ->> 'missing_rates')
      when 'no_fingerprint' then 'CONTRACTOR_WAGES_NO_FINGERPRINT:' || (s ->> 'no_fingerprint')
      when 'no_days' then 'CONTRACTOR_WAGES_NO_DAYS'
      else 'CONTRACTOR_WAGES_NOTHING_PAYABLE' end;
  end if;
  with per as (select w.contractor_user_id, sum(w.day_pay) as net, sum(w.base_pay) as gross, sum(w.blocked_pay + w.deduction) as ded from app.contractor_wage_days(m) w group by w.contractor_user_id)
  select count(*), count(*) filter (where per.net > 0), sum(per.gross), sum(per.ded), sum(per.net) into v_cnt, v_pay, v_gross, v_ded, v_net from per;
  v_ver := coalesce((select max(d.version) from public.payroll_disbursements d where d.kind = 'contractor_wages' and d.period_month = m), 0) + 1;
  v_sup := coalesce(p_supersedes, (select d.id from public.payroll_disbursements d where d.kind = 'contractor_wages' and d.period_month = m and d.status = 'rejected' order by d.version desc limit 1));
  v_prev := (select d.net_total from public.payroll_disbursements d where d.kind = 'contractor_wages' and d.period_month = (m - interval '1 month')::date and d.status in ('approved', 'paid') order by d.version desc limit 1);
  v_no := app.disbursement_next_no();
  insert into public.payroll_disbursements (request_no, kind, period_month, version, supersedes_id, people_count, payable_count, gross_total, deductions_total, net_total, prev_net_total, requested_by)
  values (v_no, 'contractor_wages', m, v_ver, v_sup, v_cnt, v_pay, v_gross, v_ded, v_net, v_prev, v_by) returning id into v_id;
  insert into public.payroll_disbursement_lines (disbursement_id, person_id, person_number, full_name, group_name, sub_group_name, job_title, gross_amount, deductions_total, net_amount, adjusted, has_deduction, has_advance, details, sort_key)
  select v_id, w.contractor_user_id, emp.employee_number, app.manager_display_name(w.contractor_user_id),
         coalesce(app.parent_sector_name(sc.parent_sector), 'بلا قطاع رئيسي'), coalesce(sc.name, 'بلا قطاع'), 'متعهد',
         sum(w.base_pay), sum(w.blocked_pay + w.deduction), sum(w.day_pay), false, sum(w.blocked_pay + w.deduction) > 0, false,
         jsonb_build_object(
           'contractor_daily_wage', r.contractor_daily_wage, 'worker_daily_wage', r.worker_daily_wage,
           'pay_days', count(*), 'paid_days', count(*) filter (where w.state = 'paid'), 'blocked_days', count(*) filter (where w.state = 'blocked'),
           'late_days', count(*) filter (where w.deduct_minutes > 0), 'deduction_minutes', coalesce(sum(w.deduct_minutes), 0),
           'blocked_amount', sum(w.blocked_pay), 'deduction_amount', sum(w.deduction),
           'contractor_pay', r.contractor_daily_wage * count(*), 'workers_pay', r.worker_daily_wage * coalesce(sum(w.workers), 0), 'workers_days', coalesce(sum(w.workers), 0),
           'days', jsonb_agg(jsonb_build_object('date', w.log_date, 'headcount', w.headcount, 'state', w.state, 'reason', w.block_reason,
                                                'required', w.required_minutes, 'shortfall', w.shortfall_minutes, 'grace', w.grace_minutes, 'deduct_minutes', w.deduct_minutes,
                                                'base', w.base_pay, 'deduction', w.deduction, 'pay', w.day_pay) order by w.log_date)),
         coalesce(sc.parent_sector, '') || '|' || lpad(coalesce(sc.id, 0)::text, 4, '0') || '|' || app.manager_display_name(w.contractor_user_id)
    from app.contractor_wage_days(m) w
    join public.contractor_rates r on r.contractor_user_id = w.contractor_user_id and r.month = m
    left join public.contractor_profiles cp on cp.user_id = w.contractor_user_id
    left join public.sectors sc on sc.id = cp.sector_id
    left join lateral (select e.employee_number from public.employees e where e.user_id = w.contractor_user_id order by e.id limit 1) emp on true
   group by w.contractor_user_id, emp.employee_number, sc.parent_sector, sc.name, sc.id, r.contractor_daily_wage, r.worker_daily_wage;
  insert into public.payroll_disbursement_events (disbursement_id, event, actor, note, amount) values (v_id, 'created', v_by, v_note, v_net);
  v_amt := to_char(v_net, 'FM999,999,999,990');
  if v_sup is not null then
    -- إعادة إرسال بعد رفض: تُسجَّل على النسخة المرفوضة، والإشعار بصيغة «أُعيد إرسال»
    select d.net_total into v_sup_net from public.payroll_disbursements d where d.id = v_sup;
    insert into public.payroll_disbursement_events (disbursement_id, event, actor, note, amount) values (v_sup, 'resubmitted', v_by, v_note, v_sup_net);
    for u in select distinct ur.user_id from public.user_roles ur where ur.role = 'super_admin' loop
      perform app.hr_notify(u.user_id, 'أُعيد إرسال طلب صرف ' || v_label || ' بانتظار قرارك',
        format('%s (النسخة %s) · شهر %s · %s د.ع%s', v_no, v_ver, to_char(m, 'YYYY-MM'), v_amt, case when v_note is null then '' else ' · ملاحظة المالية: ' || v_note end),
        '/admin/disbursements/' || v_id::text, 'disb_created:' || v_id::text, 'warning');
    end loop;
  else
    for u in select distinct ur.user_id from public.user_roles ur where ur.role = 'super_admin' loop
      perform app.hr_notify(u.user_id, 'طلب صرف جديد بانتظار قرارك',
        format('%s · %s · شهر %s · %s متعهداً · %s د.ع', v_no, v_label, to_char(m, 'YYYY-MM'), v_pay, v_amt),
        '/admin/disbursements/' || v_id::text, 'disb_created:' || v_id::text, 'warning');
    end loop;
  end if;
  return v_id;
end$$;

-- ④ القراءة للمالية والمدير المفوض: جاهزية الشهر، ثم الكشف بعد البصمة، ثم تفصيل الأيام
create or replace function public.finance_contractor_wages_readiness(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  return app.contractor_wages_state(coalesce(p_month, app.baghdad_today()));
end$$;

create or replace function public.finance_contractor_wages_adjusted(p_month date default null)
returns table (
  contractor_user_id uuid, contractor_name text, area_name text, sector_id smallint, parent_sector text,
  fingerprint_linked boolean, rates_set boolean,
  pay_days integer, paid_days integer, blocked_days integer, late_days integer, deduction_minutes integer,
  contractor_daily_wage numeric, worker_daily_wage numeric,
  gross_pay numeric, blocked_pay numeric, deduction_amount numeric, net_pay numeric)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, app.baghdad_today()))::date; v_locked boolean;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  v_locked := exists (select 1 from public.contractor_month_approvals x where x.month = m and x.is_locked);
  return query
  select cp.user_id, app.manager_display_name(cp.user_id), s.name, s.id, s.parent_sector,
         exists (select 1 from public.employees e where e.user_id = cp.user_id and e.biometric_pin is not null),
         r.id is not null,
         coalesce(x.pay_days, 0)::int, coalesce(x.paid_days, 0)::int, coalesce(x.blocked_days, 0)::int, coalesce(x.late_days, 0)::int, coalesce(x.ded_min, 0)::int,
         coalesce(r.contractor_daily_wage, 0), coalesce(r.worker_daily_wage, 0),
         case when not v_locked or r.id is null then null else coalesce(x.gross, 0) end,
         case when not v_locked or r.id is null then null else coalesce(x.blocked, 0) end,
         case when not v_locked or r.id is null then null else coalesce(x.ded, 0) end,
         case when not v_locked or r.id is null then null else coalesce(x.net, 0) end
    from public.contractor_profiles cp
    join public.sectors s on s.id = cp.sector_id
    left join public.contractor_rates r on r.contractor_user_id = cp.user_id and r.month = m
    left join lateral (
      select count(*) as pay_days, count(*) filter (where w.state = 'paid') as paid_days, count(*) filter (where w.state = 'blocked') as blocked_days,
             count(*) filter (where w.deduct_minutes > 0) as late_days, coalesce(sum(w.deduct_minutes), 0) as ded_min,
             sum(w.base_pay) as gross, sum(w.blocked_pay) as blocked, sum(w.deduction) as ded, sum(w.day_pay) as net
        from app.contractor_wage_days(m, cp.user_id) w) x on true
   where cp.is_active or r.id is not null
      or exists (select 1 from public.contractor_daily_counts c where c.contractor_user_id = cp.user_id and c.log_date >= m and c.log_date < (m + interval '1 month')::date)
   order by s.parent_sector, s.id, app.manager_display_name(cp.user_id);
end$$;

create or replace function public.finance_contractor_wage_days_adjusted(p_contractor uuid, p_month date default null)
returns table (
  log_date date, headcount integer, workers integer, state text, block_reason text,
  check_in timestamptz, check_out timestamptz, required_minutes integer, shortfall_minutes integer, grace_minutes integer, deduct_minutes integer,
  base_pay numeric, deduction numeric, day_pay numeric, edit_reason text)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, app.baghdad_today()))::date; last_d date;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  last_d := least((m + interval '1 month' - interval '1 day')::date, app.baghdad_today());
  return query
  select g.d::date, w.headcount, w.workers, w.state, w.block_reason, w.check_in, w.check_out, w.required_minutes, w.shortfall_minutes, w.grace_minutes, w.deduct_minutes,
         w.base_pay, w.deduction, w.day_pay,
         (select c.edit_reason from public.contractor_daily_counts c join public.contractor_month_approvals a on a.month = m and a.is_locked and c.source = a.approved_source
           where c.contractor_user_id = p_contractor and c.log_date = g.d::date limit 1)
    from generate_series(m, last_d, interval '1 day') g(d)
    left join app.contractor_wage_days(m, p_contractor) w on w.log_date = g.d::date
   order by g.d;
end$$;

-- ⑤ «اعتماد وإرسال» (المالية): حارس التكرار/التزامن ثم الأصل، كبقية دوال الكتابة (00291)
create or replace function app.finance_contractor_wages_close__raw(p_month date, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; d public.payroll_disbursements;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'DISBURSEMENT_FORBIDDEN'; end if;
  v_id := app.disbursement_open_contractors(p_month, p_note);
  select * into d from public.payroll_disbursements where id = v_id;
  return app.disbursement_json(d);
end$$;

create or replace function public.finance_contractor_wages_close(p_month date, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.guard_duplicate('finance_contractor_wages_close', jsonb_build_object('p_month', p_month, 'p_note', p_note));
  perform app.guard_record_lock(md5('contractor_wages_close:' || coalesce(date_trunc('month', p_month)::date::text, ''))::uuid);
  return app.finance_contractor_wages_close__raw(p_month, p_note);
end$$;

-- ⑥ إعادة الإرسال بعد الرفض: فرع الموظفين كما في الترحيلة السابقة حرفياً (نسخة بالأرقام المجمَّدة نفسها)،
--    وفرع المتعهدين يحسب النسخة الجديدة من البيانات الحالية (الشهر مقفل لكن الأجور اليومية قد تُصحَّح بعد الرفض)
create or replace function app.disbursement_resubmit__raw(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d public.payroll_disbursements; n public.payroll_disbursements; v_note text := nullif(trim(coalesce(p_note, '')), ''); u record; v_label text; v_no text; v_new uuid;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'DISBURSEMENT_FORBIDDEN'; end if;
  select * into d from public.payroll_disbursements where id = p_id for update;
  if d.id is null then raise exception 'DISBURSEMENT_NOT_FOUND'; end if;
  if d.status <> 'rejected' then raise exception 'DISBURSEMENT_NOT_REJECTED'; end if;
  if exists (select 1 from public.payroll_disbursements x where x.kind = d.kind and x.period_month = d.period_month and x.status in ('pending_approval', 'approved', 'paid')) then
    raise exception 'DISBURSEMENT_ACTIVE_EXISTS';
  end if;
  if d.kind = 'contractor_wages' then
    v_new := app.disbursement_open_contractors(d.period_month, p_note, d.id);
    select * into n from public.payroll_disbursements where id = v_new;
    return app.disbursement_json(n);
  end if;
  v_no := app.disbursement_next_no();
  insert into public.payroll_disbursements (request_no, kind, period_month, version, source_export_id, supersedes_id, people_count, payable_count, gross_total, deductions_total, net_total, prev_net_total, requested_by)
  values (v_no, d.kind, d.period_month, (select max(x.version) from public.payroll_disbursements x where x.kind = d.kind and x.period_month = d.period_month) + 1,
          d.source_export_id, d.id, d.people_count, d.payable_count, d.gross_total, d.deductions_total, d.net_total, d.prev_net_total, auth.uid())
  returning * into n;
  insert into public.payroll_disbursement_lines (disbursement_id, person_id, person_number, full_name, group_name, sub_group_name, job_title, gross_amount, deductions_total, net_amount, adjusted, has_deduction, has_advance, details, sort_key)
  select n.id, l.person_id, l.person_number, l.full_name, l.group_name, l.sub_group_name, l.job_title, l.gross_amount, l.deductions_total, l.net_amount, l.adjusted, l.has_deduction, l.has_advance, l.details, l.sort_key
    from public.payroll_disbursement_lines l where l.disbursement_id = d.id;
  insert into public.payroll_disbursement_events (disbursement_id, event, actor, note, amount) values (d.id, 'resubmitted', auth.uid(), v_note, d.net_total);
  insert into public.payroll_disbursement_events (disbursement_id, event, actor, note, amount) values (n.id, 'created', auth.uid(), v_note, n.net_total);
  v_label := app.disbursement_kind_label(n.kind);
  for u in select distinct ur.user_id from public.user_roles ur where ur.role = 'super_admin' loop
    perform app.hr_notify(u.user_id, 'أُعيد إرسال طلب صرف ' || v_label || ' بانتظار قرارك',
      format('%s (النسخة %s) · شهر %s · %s د.ع%s', n.request_no, n.version, to_char(n.period_month, 'YYYY-MM'), to_char(n.net_total, 'FM999,999,999,990'), case when v_note is null then '' else ' · ملاحظة المالية: ' || v_note end),
      '/admin/disbursements/' || n.id::text, 'disb_created:' || n.id::text, 'warning');
  end loop;
  return app.disbursement_json(n);
end$$;

-- ⑦ حراس تجميد المدخلات: النص السابق للدوال الثلاث حرفياً + فحص واحد (طلب قائم لهذا الشهر)
create or replace function public.ops_contractor_month_reopen(p_month date, p_reason text)
returns contractor_month_approvals
language plpgsql security definer set search_path to 'public', 'app' as $$
declare u uuid; m date := date_trunc('month', p_month)::date; a public.contractor_month_approvals;
begin
  perform app.require_ops_room(); u := auth.uid();
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'CONTRACTOR_REASON_REQUIRED'; end if;
  if exists (select 1 from public.payroll_disbursements d where d.kind = 'contractor_wages' and d.period_month = m and d.status in ('pending_approval', 'approved', 'paid')) then
    raise exception 'CONTRACTOR_MONTH_HAS_DISBURSEMENT';
  end if;
  update public.contractor_month_approvals set is_locked = false, reopened_by = u, reopened_at = now(), reopen_reason = trim(p_reason)
  where month = m and is_locked returning * into a;
  if a.month is null then raise exception 'CONTRACTOR_MONTH_NOT_LOCKED'; end if;
  insert into public.contractor_audit_log(actor_id, action, log_date, reason) values (u, 'month_reopen', m, trim(p_reason));
  return a;
end$$;

create or replace function public.finance_contractor_rates_set(p_contractor uuid, p_month date, p_contractor_daily numeric, p_worker_daily numeric, p_note text default null::text)
returns contractor_rates
language plpgsql security definer set search_path to 'public', 'app' as $$
declare m date := date_trunc('month', p_month)::date; before_j jsonb; r public.contractor_rates;
begin
  if not app.has_role(array['finance_officer','super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  if p_contractor_daily is null or p_worker_daily is null or p_contractor_daily < 0 or p_worker_daily < 0 then raise exception 'CONTRACTOR_WAGE_INVALID'; end if;
  if length(coalesce(p_note, '')) > 300 then raise exception 'CONTRACTOR_NOTE_INVALID'; end if;
  if not exists (select 1 from public.contractor_profiles cp where cp.user_id = p_contractor) then raise exception 'CONTRACTOR_NOT_ASSIGNED'; end if;
  if exists (select 1 from public.payroll_disbursements d where d.kind = 'contractor_wages' and d.period_month = m and d.status in ('pending_approval', 'approved', 'paid')) then
    raise exception 'DISBURSEMENT_RATES_FROZEN';
  end if;
  select to_jsonb(x) - 'id' into before_j from public.contractor_rates x where x.contractor_user_id = p_contractor and x.month = m;
  insert into public.contractor_rates (contractor_user_id, month, contractor_daily_wage, worker_daily_wage, note, set_by)
  values (p_contractor, m, p_contractor_daily, p_worker_daily, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (contractor_user_id, month) do update
    set contractor_daily_wage = excluded.contractor_daily_wage, worker_daily_wage = excluded.worker_daily_wage, note = excluded.note, set_by = auth.uid(), set_at = now(), updated_at = now()
  returning * into r;
  insert into public.contractor_audit_log(actor_id, action, contractor_user_id, sector_id, log_date, before_data, after_data)
  values (auth.uid(), 'finance_rates_set', p_contractor, (select cp.sector_id from public.contractor_profiles cp where cp.user_id = p_contractor), m, before_j, to_jsonb(r) - 'id');
  return r;
end$$;

create or replace function public.finance_contractor_rates_copy_previous(p_month date)
returns integer
language plpgsql security definer set search_path to 'public', 'app' as $$
declare m date := date_trunc('month', p_month)::date; n int;
begin
  if not app.has_role(array['finance_officer','super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  if exists (select 1 from public.payroll_disbursements d where d.kind = 'contractor_wages' and d.period_month = m and d.status in ('pending_approval', 'approved', 'paid')) then
    raise exception 'DISBURSEMENT_RATES_FROZEN';
  end if;
  insert into public.contractor_rates (contractor_user_id, month, contractor_daily_wage, worker_daily_wage, note, set_by)
  select p.contractor_user_id, m, p.contractor_daily_wage, p.worker_daily_wage, p.note, auth.uid()
  from public.contractor_rates p
  join public.contractor_profiles cp on cp.user_id = p.contractor_user_id and cp.is_active
  where p.month = (m - interval '1 month')::date
    and not exists (select 1 from public.contractor_rates c where c.contractor_user_id = p.contractor_user_id and c.month = m);
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.contractor_audit_log(actor_id, action, log_date, after_data) values (auth.uid(), 'finance_rates_copy_previous', m, jsonb_build_object('copied', n));
  end if;
  return n;
end$$;

-- ⑧ الامتيازات: القراءة والإرسال للمسجَّلين (والدور يُفحص داخل كل دالة)، والداخلية لا تُنادى من الواجهة
revoke all on function public.finance_contractor_wages_readiness(date), public.finance_contractor_wages_adjusted(date),
  public.finance_contractor_wage_days_adjusted(uuid, date), public.finance_contractor_wages_close(date, text) from public, anon;
grant execute on function public.finance_contractor_wages_readiness(date), public.finance_contractor_wages_adjusted(date),
  public.finance_contractor_wage_days_adjusted(uuid, date), public.finance_contractor_wages_close(date, text) to authenticated;
revoke all on function app.contractor_wage_days(date, uuid), app.contractor_wages_state(date), app.disbursement_open_contractors(date, text, uuid),
  app.finance_contractor_wages_close__raw(date, text) from public, anon, authenticated;
