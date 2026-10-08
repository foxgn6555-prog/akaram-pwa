-- 00197 · طلب إجازة/زمنية بأثر رجعي (ليوم سابق) — مسموح بشروط وبشفافية كاملة
--
-- المشكلة: موظف أبلغ مسؤوله شفهياً وغاب يوم 15، ولم يُسجَّل الطلب ⇒ ظهر «غائب» واستُقطع. يوم 17 يريد تسجيل الطلب.
-- الحل:
--  ① يُسمح بالطلب ليوم سابق ضمن مهلة من التطوير المركزية (backdated_max_days، افتراضي 7 أيام؛ HR بلا مهلة) ويمكن إيقافه كلياً (backdated_requests_enabled).
--  ② سبب إلزامي (≥ 5 أحرف) يشرح التأخر، ويُحفظ مع الطلب مع عدد أيام التأخر وحالة الحضور المسجّلة لذلك اليوم قبل الطلب (غائب/متأخر…).
--  ③ يظهر لكل مدير في سلسلة الموافقات (approval_my_tasks.details) شارة «بأثر رجعي» + السبب + الحالة السابقة + عدد طلبات الموظف بأثر رجعي هذا الشهر.
--  ④ تنبيه HR تلقائياً عند بلوغ الموظف حد التكرار الشهري (backdated_alert_per_month، افتراضي 3).
--  ⑤ عند الموافقة النهائية يُعاد احتساب اليوم (غائب ⇒ إجازة / حاضر (زمنية)) ويُلغى الاستقطاع المقترح؛ وتُبلَّغ غرفة العمليات لأن حضور يوم سابق تغيّر. الشهر المقفل مالياً يُرفض.

alter table public.hr_leaves
  add column if not exists is_backdated boolean not null default false,
  add column if not exists backdated_reason text,
  add column if not exists backdated_days int not null default 0,
  add column if not exists backdated_prior_status text;
create index if not exists idx_hr_leaves_backdated on public.hr_leaves (employee_id, created_at) where is_backdated;

update public.hr_policy set settings = settings || jsonb_build_object('backdated_requests_enabled', true, 'backdated_max_days', 7, 'backdated_alert_per_month', 3)
where id = 1 and not (settings ? 'backdated_max_days');

-- التحقق من المفاتيح الجديدة في سياسة التطوير المركزية
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
  if coalesce((cur ->> 'evaluate_lookback_days')::int, 2) not between 1 and 31 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'grace_minutes_default')::int, 15) not between 0 and 120 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce(cur ->> 'salary_day_basis', 'fixed_30') not in ('fixed_30', 'calendar_days') then raise exception 'HR_POLICY_INVALID'; end if;
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
  select bool_or(k in ('auto_deduction_enabled','deduct_absence_enabled','deduct_shortfall_enabled','deduct_unpaid_leave_enabled','deduction_tiers','absent_day_deduction_days','incomplete_punch_as_absent','grace_minutes_default'))
    into v_reeval from jsonb_object_keys(p_patch) k;
  update public.hr_policy set settings = cur, updated_by = auth.uid(), updated_at = now() where id = 1;
  if coalesce(v_reeval, false) and not app.hr_month_locked(date_trunc('month', app.hr_local_date(now()))::date) then
    perform app.hr_evaluate_month(date_trunc('month', app.hr_local_date(now()))::date);
  end if;
  return cur;
end$$;

-- الطلب (التوقيع القديم يُحذف حتى لا يلتبس على PostgREST)
drop function if exists public.hr_leave_request(uuid, uuid, date, date, time, time, text, text);
create or replace function public.hr_leave_request(p_employee uuid, p_type uuid, p_start date, p_end date, p_start_time time default null, p_end_time time default null,
                                                   p_notes text default null, p_attachment text default null, p_backdated_reason text default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare lt record; e record; me uuid := app.current_employee_id(); v_days numeric; v_minutes int := 0; v_id uuid; bal jsonb; v_cost numeric; v_max_min int; v_month_permits int;
        chain public.approval_chains; v_chain uuid; v_today date := app.hr_local_date(now()); v_back int := 0; v_prior text; v_hr boolean := app.has_role(array['hr_officer', 'super_admin']);
        v_bd_max int := app.hr_policy_int('backdated_max_days', 7); v_bd_count int := 0; v_bd_alert int := app.hr_policy_int('backdated_alert_per_month', 3); v_mgr uuid; v_title text; u uuid;
begin
  select * into lt from public.hr_leave_types where id = p_type and is_active;
  if not found then raise exception 'HR_LEAVE_TYPE_INVALID'; end if;
  select * into e from public.employees where id = p_employee and archived_at is null;
  if not found or e.employment_status = 'terminated' then raise exception 'HR_NOT_FOUND'; end if;
  if not (app.has_role(array['hr_officer', 'super_admin']) or p_employee = me or (me is not null and e.manager_id = me)) then raise exception 'HR_FORBIDDEN'; end if;
  if e.biometric_pin is null and not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_NO_BIOMETRIC'; end if;
  chain := app.approval_chain_for(e.user_id, lt.kind);
  if e.manager_id is null and chain.id is null and not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_NO_MANAGER'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'HR_DATE_INVALID'; end if;
  if lt.requires_attachment and coalesce(p_attachment, '') = '' then raise exception 'HR_ATTACHMENT_REQUIRED'; end if;
  -- 00197 · طلب بأثر رجعي (ليوم سابق): مسموح بشروط — مفعَّل من التطوير المركزية، ضمن المهلة (HR بلا مهلة)، بسبب إلزامي، والشهر غير مقفل
  if p_start < v_today then
    v_back := v_today - p_start;
    if not app.hr_policy_bool('backdated_requests_enabled', true) then raise exception 'HR_BACKDATED_DISABLED'; end if;
    if not v_hr and v_back > v_bd_max then raise exception 'HR_BACKDATED_TOO_OLD'; end if;
    if length(trim(coalesce(p_backdated_reason, ''))) < 5 then raise exception 'HR_BACKDATED_REASON_REQUIRED'; end if;
    if app.hr_month_locked(p_start) or app.hr_month_locked(p_end) then raise exception 'HR_MONTH_LOCKED'; end if;
    select a.status into v_prior from public.hr_attendance_days a where a.employee_id = p_employee and a.work_date = p_start;
    select count(*) into v_bd_count from public.hr_leaves x where x.employee_id = p_employee and x.is_backdated and x.status in ('pending', 'approved')
      and date_trunc('month', x.created_at at time zone 'UTC') = date_trunc('month', now() at time zone 'UTC');
    v_bd_count := v_bd_count + 1;
  end if;

  if lt.kind = 'time_permit' then
    if p_start <> p_end or p_start_time is null or p_end_time is null or p_end_time <= p_start_time then raise exception 'HR_PERMIT_TIME_INVALID'; end if;
    v_minutes := extract(epoch from (p_end_time - p_start_time))::int / 60;
    v_max_min := coalesce(lt.max_minutes, app.hr_policy_int('permit_max_minutes', 180));
    if v_minutes > v_max_min then raise exception 'HR_PERMIT_TOO_LONG'; end if;
    if (app.hr_policy() ->> 'permits_max_per_month') is not null then
      select count(*) into v_month_permits from public.hr_leaves where employee_id = p_employee and kind = 'time_permit' and status in ('pending', 'approved')
        and date_trunc('month', start_date) = date_trunc('month', p_start);
      if v_month_permits >= app.hr_policy_int('permits_max_per_month', 999) then raise exception 'HR_PERMIT_MONTH_LIMIT'; end if;
    end if;
    v_days := 0;
  else
    v_days := (p_end - p_start) + 1;
    if lt.max_days_per_request is not null and v_days > lt.max_days_per_request then raise exception 'HR_LEAVE_TOO_LONG'; end if;
  end if;
  if exists (select 1 from public.hr_leaves x where x.employee_id = p_employee and x.status in ('pending', 'approved') and x.start_date <= p_end and x.end_date >= p_start
             and (x.kind = 'leave' or lt.kind = 'leave' or (x.start_time < p_end_time and x.end_time > p_start_time))) then
    raise exception 'HR_LEAVE_OVERLAP';
  end if;
  if lt.consumes_balance then
    bal := app.hr_balance_of(p_employee, extract(year from p_start)::int);
    v_cost := case when lt.kind = 'leave' then v_days else round(1.0 / app.hr_policy_int('permits_per_leave_day', 3), 3) end;
    if (bal ->> 'remaining')::numeric < v_cost then raise exception 'HR_BALANCE_INSUFFICIENT'; end if;
  end if;

  insert into public.hr_leaves (employee_id, kind, leave_type, leave_type_id, start_date, end_date, start_time, end_time, status, notes, created_by, requested_by, manager_id, days, minutes, attachment_path,
                                is_backdated, backdated_reason, backdated_days, backdated_prior_status)
  values (p_employee, lt.kind, lt.code, lt.id, p_start, p_end, p_start_time, p_end_time, 'pending', nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid(), e.manager_id, v_days, v_minutes, p_attachment,
          v_back > 0, case when v_back > 0 then trim(p_backdated_reason) end, v_back, case when v_back > 0 then v_prior end)
  returning id into v_id;
  if v_back > 0 then
    -- تنبيه HR عند تكرار الطلبات بأثر رجعي في الشهر (حد من التطوير المركزية)
    if v_bd_count >= v_bd_alert then
      for u in select ur.user_id from public.user_roles ur where ur.role = 'hr_officer' loop
        perform app.hr_notify(u, 'تكرار طلبات بأثر رجعي: ' || e.full_name, 'الطلب رقم ' || v_bd_count || ' بأثر رجعي هذا الشهر (الحد ' || v_bd_alert || ') — ' || lt.name || ' ليوم ' || p_start::text || ' · السبب: ' || trim(p_backdated_reason), '/hr/leaves', 'backdated_alert:' || v_id::text, 'warning');
      end loop;
    end if;
  end if;

  if chain.id is not null then
    v_chain := app.approval_open(lt.kind, v_id, e.user_id);
    update public.hr_leaves set chain_id = v_chain where id = v_id;
  else
    perform app.hr_notify(app.hr_manager_user(p_employee), case when v_back > 0 then '⚠ طلب بأثر رجعي: ' else 'طلب ' end || lt.name || ' بانتظار موافقتك',
      case when v_back > 0 then 'ليوم سابق قبل ' || v_back || ' يوم — السبب: ' || trim(p_backdated_reason) || ' · ' else '' end || e.full_name || ' · ' || p_start::text || case when lt.kind = 'leave' and p_end <> p_start then ' → ' || p_end::text else '' end
        || case when lt.kind = 'time_permit' then ' · ' || to_char(p_start_time, 'HH24:MI') || '–' || to_char(p_end_time, 'HH24:MI') else '' end,
      '/manager/leaves', 'leave_req:' || v_id::text, 'info');
  end if;
  return v_id;
end$$;
grant execute on function public.hr_leave_request(uuid, uuid, date, date, time, time, text, text, text) to authenticated;

-- القرار
create or replace function public.hr_leave_decide(p_leave uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare l record; lt record; e record; v_cost numeric; bal jsonb; d date; final boolean := true; step_no int; u uuid;
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
    if app.hr_month_locked(l.start_date) or app.hr_month_locked(l.end_date) then raise exception 'HR_MONTH_LOCKED'; end if;
    if lt.consumes_balance then
      bal := app.hr_balance_of(l.employee_id, extract(year from l.start_date)::int);
      v_cost := case when lt.kind = 'leave' then l.days else round(1.0 / app.hr_policy_int('permits_per_leave_day', 3), 3) end;
      if (bal ->> 'remaining')::numeric < v_cost then raise exception 'HR_BALANCE_INSUFFICIENT'; end if;
      insert into public.hr_leave_ledger (employee_id, year, kind, days, leave_id, note, created_by)
      values (l.employee_id, extract(year from l.start_date)::int, case when lt.kind = 'leave' then 'consume' else 'permit' end, -v_cost, l.id, lt.name || ' ' || l.start_date::text, auth.uid());
    end if;
    update public.hr_leaves set status = 'approved', approved_by = auth.uid(), approved_at = now(), decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '') where id = p_leave;
    d := l.start_date; while d <= l.end_date loop perform app.hr_evaluate_day(l.employee_id, d); d := d + 1; end loop;
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

-- مهام الموافقة: تفاصيل «بأثر رجعي» للإجازات والزمنيات
create or replace function public.approval_my_tasks()
returns table(task_id uuid, request_kind text, request_id uuid, step_no int, total_steps int, step_label text, requester_user_id uuid, requester_name text, requester_role text, requester_role_label text,
              area_name text, parent_sector text, type_name text, start_date date, end_date date, start_time time, end_time time, days numeric, minutes int, notes text, attachment_path text, created_at timestamptz, previous_steps jsonb, items jsonb, ref_no text, details jsonb)
language plpgsql stable security definer set search_path = public, app as $$
begin
  return query
  with base as (
    select t.*, e.user_id as req_user, e.full_name as req_name, lt.name as type_name, l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.notes, l.attachment_path, l.created_at as req_created, null::jsonb as items, null::text as ref_no,
      case when l.is_backdated then jsonb_build_object('backdated', true, 'reason', l.backdated_reason, 'days_late', l.backdated_days, 'prior_status', l.backdated_prior_status,
        'month_count', (select count(*) from public.hr_leaves x where x.employee_id = l.employee_id and x.is_backdated and x.status in ('pending', 'approved') and date_trunc('month', x.created_at at time zone 'UTC') = date_trunc('month', l.created_at at time zone 'UTC')),
        'alert_threshold', app.hr_policy_int('backdated_alert_per_month', 3)) end as details, null::text as fixed_role
    from public.approval_tasks t join public.hr_leaves l on l.id = t.request_id and t.request_kind in ('leave','time_permit') join public.employees e on e.id = l.employee_id left join public.hr_leave_types lt on lt.id = l.leave_type_id
    where t.status = 'pending' and auth.uid() = any(t.approvers) and l.status = 'pending'
    union all
    select t.*, r.manager_id, r.manager_name, 'مستلزمات القواطع', null, null, null, null, null, null, r.notes, null, r.created_at, r.items, r.ref_no, null, null
    from public.approval_tasks t join public.sector_supply_requests r on r.id = t.request_id and t.request_kind = 'supplies'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and r.approval_status = 'pending'
    union all
    select t.*, q.requester_user_id, app.manager_display_name(q.requester_user_id), 'إنهاء خدمة', q.last_day, q.last_day, null, null, null, null, q.reason, q.attachment_path, q.created_at, null, null,
      jsonb_build_object('target_name', q.target_name, 'target_label', q.target_label, 'target_kind', q.target_kind, 'type', q.termination_type, 'type_label', app.termination_type_label(q.termination_type), 'last_day', q.last_day), q.requester_role
    from public.approval_tasks t join public.termination_requests q on q.id = t.request_id and t.request_kind = 'termination'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and q.status = 'pending'
    union all
    select t.*, a.requested_by, coalesce(a.requested_by_name, app.manager_display_name(a.requested_by)), 'سلفة', null, null, null, null, null, null, a.notes, null, a.created_at, null, a.ref_no,
      jsonb_build_object('employee_name', a.employee_name, 'employee_number', a.employee_number, 'type_name', a.type_name, 'amount', a.amount, 'requested_amount', a.requested_amount,
        'method', a.repayment_method, 'method_label', app.advance_method_label(a.repayment_method), 'installments', a.installments, 'monthly_amount', a.monthly_amount, 'percent', a.percent,
        'estimated_installment', app.advance_installment_amount(a, app.advance_monthly_salary(a.employee_id))), 'ops_room'
    from public.approval_tasks t join public.advances a on a.id = t.request_id and t.request_kind = 'advance'
    where t.status = 'pending' and auth.uid() = any(t.approvers) and a.status = 'pending'
  )
  select b.id, b.request_kind, b.request_id, b.step_no,
    (select count(*)::int from public.approval_tasks x where x.request_kind = b.request_kind and x.request_id = b.request_id and x.status <> 'skipped'),
    b.step_label, b.req_user, b.req_name, coalesce(c.requester_role, b.fixed_role), app.approval_role_label(coalesce(c.requester_role, b.fixed_role)),
    (select string_agg(s.name, '، ') from public.sectors s where s.parent_sector = any(app.user_parent_sectors(b.req_user))
       and (s.id in (select cp.sector_id from public.contractor_profiles cp where cp.user_id = b.req_user and cp.is_active)
            or s.id in (select unnest(mp.sectors) from public.manager_profiles mp where mp.user_id = b.req_user))),
    (select string_agg(app.parent_sector_name(x), '، ') from unnest(app.user_parent_sectors(b.req_user)) x),
    b.type_name, b.start_date, b.end_date, b.start_time, b.end_time, b.days, b.minutes, b.notes, b.attachment_path, b.req_created,
    coalesce((select jsonb_agg(jsonb_build_object('step_no', p.step_no, 'label', p.step_label, 'status', p.status, 'decided_by', app.manager_display_name(p.decided_by), 'decided_at', p.decided_at, 'note', p.note) order by p.step_no)
              from public.approval_tasks p where p.request_kind = b.request_kind and p.request_id = b.request_id and p.step_no < b.step_no), '[]'::jsonb),
    b.items, b.ref_no, b.details
  from base b left join public.approval_chains c on c.id = b.chain_id
  order by b.req_created;
end$$;
revoke all on function public.approval_my_tasks() from public, anon;
grant execute on function public.approval_my_tasks() to authenticated;

-- قائمة الطلبات: أعمدة بأثر رجعي
drop function if exists public.hr_leaves_list(text, date, date, text, uuid, text, int);
create or replace function public.hr_leaves_list(p_scope text, p_from date default null, p_to date default null, p_status text default null, p_department uuid default null, p_search text default null, p_limit int default 500)
returns table(id uuid, employee_id uuid, employee_number text, full_name text, department_name text, kind text, type_code text, type_name text, is_paid boolean, consumes_balance boolean,
              start_date date, end_date date, start_time time, end_time time, days numeric, minutes int, status text, notes text, attachment_path text,
              manager_id uuid, manager_name text, requested_by uuid, decided_at timestamptz, decision_note text, cancelled_reason text, created_at timestamptz, can_decide boolean,
              is_backdated boolean, backdated_reason text, backdated_days int)
language plpgsql stable security definer set search_path = public, app as $$
declare me uuid := app.current_employee_id();
begin
  return query
  select l.id, l.employee_id, e.employee_number, e.full_name, d.name, l.kind, lt.code, lt.name, lt.is_paid, lt.consumes_balance,
         l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.status, l.notes, l.attachment_path,
         l.manager_id, m.full_name, l.requested_by, l.decided_at, l.decision_note, l.cancelled_reason, l.created_at,
         (l.status = 'pending' and app.hr_can_decide(l.id)), l.is_backdated, l.backdated_reason, l.backdated_days
  from public.hr_leaves l
  join public.employees e on e.id = l.employee_id
  left join public.employees m on m.id = l.manager_id
  left join public.departments d on d.id = e.department_id
  left join public.hr_leave_types lt on lt.id = l.leave_type_id
  where case p_scope
          when 'mine' then l.employee_id = me
          when 'team' then (l.manager_id = me or e.manager_id = me or app.hr_can_decide(l.id))
          else app.has_role(array['hr_officer', 'ops_room', 'finance_officer', 'super_admin']) end
    and (p_from is null or l.end_date >= p_from) and (p_to is null or l.start_date <= p_to)
    and (p_status is null or l.status = p_status)
    and (p_department is null or e.department_id = p_department or e.department_id in (select dd.id from public.departments dd where dd.parent_id = p_department))
    and (p_search is null or e.full_name ilike '%' || p_search || '%' or e.employee_number ilike '%' || p_search || '%')
  order by (l.status = 'pending') desc, l.created_at desc
  limit p_limit;
end$$;
grant execute on function public.hr_leaves_list(text, date, date, text, uuid, text, int) to authenticated;
