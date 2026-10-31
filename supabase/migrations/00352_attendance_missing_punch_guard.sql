-- 00399-د: تصحيح بصمة مفقودة واحدة فقط، مع إبقاء البصمات الحقيقية كما هي.
alter table public.hr_attendance_days add column if not exists manual_punch_correction jsonb;

-- نافذة البصمات مطابقة للمحرك: نستخدم الشفت الساري لا الوقت المضاف يدوياً.
create or replace function app.hr_missing_punch_context(p_employee uuid,p_date date,p_reconcile boolean default false) returns jsonb
language plpgsql stable security definer set search_path=public,app as $$
declare a public.hr_attendance_days%rowtype; sh record; v_start timestamptz; v_end timestamptz; exp_in timestamptz; exp_out timestamptz;
  win_min int; cap_min int; n int; first_p timestamptz; last_p timestamptz; v_rest boolean; v_leave boolean;
begin
 select * into a from public.hr_attendance_days where employee_id=p_employee and work_date=p_date;
 select * into sh from app.hr_effective_shift(p_employee,p_date);
 if sh.shift_id is null then return jsonb_build_object('skipped','لا يوجد شفت ساري'); end if;
 v_start:=((p_date+sh.start_time)::timestamp-app.hr_tz()) at time zone 'UTC';
 v_end:=((p_date+sh.end_time)::timestamp-app.hr_tz()) at time zone 'UTC';
 if v_end<=v_start then v_end:=v_end+interval '1 day'; end if;
 v_rest:=not (extract(dow from p_date)::smallint=any(sh.work_days));
 if v_rest then return jsonb_build_object('skipped','يوم راحة'); end if;
 select exists(select 1 from public.hr_leaves l where l.employee_id=p_employee and l.status='approved' and l.kind='leave' and p_date between l.start_date and l.end_date) into v_leave;
 if not p_reconcile and (v_leave or a.status='leave') then return jsonb_build_object('skipped','يوم إجازة لا يُعدّل يدوياً'); end if;
 win_min:=greatest(1,least(12,app.hr_policy_int('punch_window_hours',4)))*60;
 if app.hr_policy_bool('punch_window_auto_cap',true) then
   cap_min:=floor(extract(epoch from(interval '24 hours'-(v_end-v_start)))/120)::int;
   win_min:=greatest(30,least(win_min,cap_min));
 end if;
 select count(distinct punched_at),min(punched_at),max(punched_at) into n,first_p,last_p
 from public.biometric_punches where employee_id=p_employee and punched_at>=v_start-make_interval(mins=>win_min) and punched_at<v_end+make_interval(mins=>win_min);
 exp_in:=coalesce(a.expected_in,v_start); exp_out:=coalesce(a.expected_out,v_end);
 if not p_reconcile and a.id is not null and a.check_in is not null and a.check_out is not null then return jsonb_build_object('skipped','اليوم مكتمل أو معدّل مسبقاً'); end if;
 if not p_reconcile and n=1 and ((a.check_in is not null and a.check_in<>first_p) or (a.check_out is not null and a.check_out<>first_p)) then return jsonb_build_object('skipped','وقت الصف لا يطابق البصمة الحقيقية؛ يلزم المراجعة'); end if;
 if not p_reconcile and n>1 then return jsonb_build_object('skipped','أكثر من بصمة حقيقية؛ يلزم المراجعة ولا تعدّل مباشرة'); end if;
 if not p_reconcile and a.source='manual' and a.status not in ('absent','incomplete') then return jsonb_build_object('skipped','حالة يدوية سابقة تحتاج مراجعة'); end if;
 return jsonb_build_object('count',n,'real',first_p,'last',last_p,'shift_start',v_start,'shift_end',v_end,'expected_in',exp_in,'expected_out',exp_out,'flexible',sh.kind='flexible','required_minutes',round(coalesce(sh.required_hours,0)*60)::int);
end$$;
revoke all on function app.hr_missing_punch_context(uuid,date,boolean) from public,anon,authenticated;

-- الحضور بلا أي بصمة لا يطبّق إلا من طلب معتمد لدى HR؛ حفظ البصمة الحقيقية شرط إلزامي.
alter function app.attendance_edit_apply_day(uuid,date,timestamptz,timestamptz,text,text) rename to attendance_edit_apply_day_00351_raw;
revoke all on function app.attendance_edit_apply_day_00351_raw(uuid,date,timestamptz,timestamptz,text,text) from public,anon,authenticated;
create or replace function app.hr_apply_punch_correction(p_employee uuid,p_date date,p_check_in timestamptz,p_check_out timestamptz,p_status text,p_reason text,p_approved_no_punch boolean default false)
returns jsonb language plpgsql security definer set search_path=public,app as $$
declare c jsonb; n int; real_ts timestamptz; proposed_ts timestamptz; exp_in timestamptz; exp_out timestamptz; side text; res jsonb; a jsonb;
begin
 if p_date>app.hr_local_date(now()) then raise exception 'HR_FUTURE_DATE'; end if;
 perform app.hr_payroll_lock_range(p_date,p_date);
 if app.hr_month_locked(p_date) then raise exception 'HR_MONTH_LOCKED'; end if;
 if app.hr_month_confirmed(p_date) then raise exception 'HR_ATTENDANCE_CONFIRMED'; end if;
 perform 1 from public.hr_attendance_days where employee_id=p_employee and work_date=p_date for update;
 if exists(select 1 from public.hr_leaves l where l.employee_id=p_employee and l.status='approved' and l.kind='leave' and p_date between l.start_date and l.end_date) then raise exception 'HR_APPROVED_LEAVE_CONFLICT'; end if;
 c:=app.hr_missing_punch_context(p_employee,p_date);
 if c ? 'skipped' then raise exception 'HR_EDIT_LIMITED'; end if;
 if coalesce(p_status,'') not in ('auto','present') or p_check_in is null or p_check_out is null or p_check_in>=p_check_out then raise exception 'HR_EDIT_STATUS_OR_TIME'; end if;
 n:=(c->>'count')::int; real_ts:=(c->>'real')::timestamptz;
 if n=0 then
   if not coalesce(p_approved_no_punch,false) then raise exception 'HR_EDIT_APPROVAL_REQUIRED'; end if;
   side:='both'; exp_in:=(c->>'shift_start')::timestamptz; exp_out:=case when (c->>'flexible')::boolean then exp_in+make_interval(mins=>(c->>'required_minutes')::int) else (c->>'shift_end')::timestamptz end;
   if p_check_in is distinct from exp_in or p_check_out is distinct from exp_out then raise exception 'HR_EDIT_SHIFT_BOUNDS'; end if;
 else
   if p_check_in=real_ts and p_check_out<>real_ts then side:='out'; proposed_ts:=p_check_out;
   elsif p_check_out=real_ts and p_check_in<>real_ts then side:='in'; proposed_ts:=p_check_in;
   else raise exception 'HR_EDIT_PUNCH_PRESERVE'; end if;
   exp_in:=case when side='in' then (c->>'shift_start')::timestamptz else (c->>'expected_in')::timestamptz end;
   exp_out:=case when side='in' then (c->>'shift_end')::timestamptz else (c->>'expected_out')::timestamptz end;
   if proposed_ts<exp_in or proposed_ts>exp_out then raise exception 'HR_EDIT_SHIFT_BOUNDS'; end if;
 end if;
 res:=app.attendance_edit_apply_day_00351_raw(p_employee,p_date,p_check_in,p_check_out,'auto',p_reason);
 if (c->>'flexible')::boolean then
   exp_in:=greatest((c->>'shift_start')::timestamptz,p_check_in);
   exp_out:=exp_in+make_interval(mins=>(c->>'required_minutes')::int);
   update public.hr_attendance_days set expected_in=exp_in,expected_out=exp_out,late_minutes=0,
     early_minutes=greatest(0,floor(extract(epoch from(exp_out-p_check_out))/60)::int),
     status=app.hr_status_of(p_check_in,p_check_out,0,greatest(0,floor(extract(epoch from(exp_out-p_check_out))/60)::int),false),approved_permit_original=null
   where employee_id=p_employee and work_date=p_date;
   perform app.hr_evaluate_day(p_employee,p_date);
 end if;
 update public.hr_attendance_days set manual_punch_correction=jsonb_build_object('missing_side',side,'original_punch',real_ts,'manual_in',case when side in ('in','both') then p_check_in end,'manual_out',case when side in ('out','both') then p_check_out end)
 where employee_id=p_employee and work_date=p_date;
 select to_jsonb(x) into a from public.hr_attendance_days x where employee_id=p_employee and work_date=p_date;
 update public.hr_attendance_audit set after=a where id=(select id from public.hr_attendance_audit where employee_id=p_employee and work_date=p_date and action='edit' and reason=trim(p_reason) and actor is not distinct from auth.uid() order by created_at desc,id desc limit 1);
 return jsonb_set(res,'{after}',a);
end$$;
revoke all on function app.hr_apply_punch_correction(uuid,date,timestamptz,timestamptz,text,text,boolean) from public,anon,authenticated;
create or replace function app.attendance_edit_apply_day(p_employee uuid,p_date date,p_check_in timestamptz,p_check_out timestamptz,p_status text,p_reason text) returns jsonb
language sql security definer set search_path=public,app as $$
 select app.hr_apply_punch_correction(p_employee,p_date,p_check_in,p_check_out,p_status,p_reason,false)
$$;
revoke all on function app.attendance_edit_apply_day(uuid,date,timestamptz,timestamptz,text,text) from public,anon,authenticated;

create or replace function public.ops_attendance_edit(p_employee uuid,p_date date,p_check_in timestamptz,p_check_out timestamptz,p_status text,p_reason text)
returns void language plpgsql security definer set search_path=public,app as $$
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
 perform app.attendance_edit_apply_day(p_employee,p_date,p_check_in,p_check_out,p_status,p_reason);
end$$;

-- الجماعي يقترح بداية/نهاية الشفت حسب البصمة المفقودة، ويبقي الأصل كما هو.
create or replace function app.attendance_edit_validate_payload(p_action text,p_payload jsonb) returns void language plpgsql immutable as $$
begin
 if p_action is distinct from 'full_presence' then raise exception 'HR_EDIT_STATUS_OR_TIME'; end if;
 if coalesce(p_payload->>'missing_side','') not in ('in','out') then raise exception 'HR_EDIT_STATUS_OR_TIME'; end if;
end$$;
create or replace function app.attendance_edit_proposed(p_employee uuid,p_date date,p_action text,p_payload jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,app as $$
declare c jsonb; n int; actual timestamptz; pin timestamptz; pout timestamptz; side text:=coalesce(p_payload->>'missing_side','out');
begin
 c:=app.hr_missing_punch_context(p_employee,p_date); if c ? 'skipped' then return c; end if;
 n:=(c->>'count')::int; actual:=(c->>'real')::timestamptz;
 if n=0 then pin:=(c->>'shift_start')::timestamptz; pout:=case when (c->>'flexible')::boolean then pin+make_interval(mins=>(c->>'required_minutes')::int) else (c->>'shift_end')::timestamptz end;
 elsif side='in' then pin:=(c->>'shift_start')::timestamptz; pout:=actual;
 else pin:=actual; pout:=(c->>'expected_out')::timestamptz; end if;
 if pin is null or pout is null or pin>=pout then return jsonb_build_object('skipped','البصمة لا تناسب طرف الشفت المختار؛ راجعها مفرداً'); end if;
 return jsonb_build_object('status','auto','check_in',pin,'check_out',pout,'needs_approval',n=0);
end$$;
create or replace function app.attendance_action_label(p text) returns text language sql immutable as $$
 select case p when 'full_presence' then 'إكمال البصمة الناقصة أو طلب حضور بلا بصمة' when 'set_status' then 'تغيير حالة اليوم (طلب سابق)' when 'set_times' then 'تعديل أوقات الدخول/الخروج (طلب سابق)' else coalesce(p,'—') end
$$;

-- التحقق يعاد داخل معاملة التطبيق، والطلب المعتمد وحده يسمح بغياب البصمات كلها.
create or replace function app.attendance_edit_apply(p_id uuid) returns void language plpgsql security definer set search_path = public, app as $$
declare q public.attendance_edit_requests; it record; res jsonb; n_ok int := 0; v_min int := 0; v_reason text; u uuid; v_actor text := app.manager_display_name(auth.uid());
        v_title text; v_body text;
begin
  select * into q from public.attendance_edit_requests where id = p_id for update;
  perform app.hr_payroll_lock_range((select min(x) from unnest(q.dates) x),(select max(x) from unnest(q.dates) x));
  perform app.attendance_edit_validate_dates(q.dates);
  v_reason := q.reason || ' [طلب تعديل حضور ' || left(q.id::text, 8) || ']';
  perform set_config('app.attendance_bulk', 'on', true);
  for it in select * from public.attendance_edit_items where request_id = p_id and skipped_reason is null order by employee_id, work_date loop
    res := app.hr_apply_punch_correction(it.employee_id, it.work_date, (it.proposed ->> 'check_in')::timestamptz, (it.proposed ->> 'check_out')::timestamptz, it.proposed ->> 'status', v_reason, q.mode='hr_request');
    update public.attendance_edit_items set before = nullif(res -> 'before', 'null'::jsonb), after = res -> 'after', applied = true where id = it.id;   -- «قبل» الفعلي لحظة التطبيق (للتراجع الدقيق)
    n_ok := n_ok + 1;
    v_min := v_min + (coalesce((res -> 'before' ->> 'late_minutes')::int, 0) + coalesce((res -> 'before' ->> 'early_minutes')::int, 0))
                   - (coalesce((res -> 'after' ->> 'late_minutes')::int, 0) + coalesce((res -> 'after' ->> 'early_minutes')::int, 0));
  end loop;
  perform set_config('app.attendance_bulk', 'off', true);
  update public.attendance_edit_requests set status = 'applied', applied_by = auth.uid(), applied_at = now(), items_count = n_ok, minutes_fixed = v_min, updated_at = now() where id = p_id;
  -- تبليغ مجمّع واحد: المعاون + التطوير المركزية (+ غرفة العمليات عندما تنفّذه HR)
  v_title := 'تعديل حضور جماعي' || case q.mode when 'hr_request' then ' (بطلب — اعتمدته الموارد البشرية)' else ' (مباشر)' end || ' — ' || q.scope_label;
  v_body := app.attendance_action_label(q.action) || ' · ' || q.employees_count || ' موظف × ' || q.days_count || ' يوم = ' || n_ok || ' يوم عمل' || case when v_min <> 0 then ' · صُحّح ' || v_min || ' دقيقة' else '' end
            || ' · السبب: ' || q.reason || ' · نفّذه ' || coalesce(v_actor, '—');
  for u in select distinct ur.user_id from public.user_roles ur where ur.role in ('deputy_director', 'it_admin') and ur.user_id is distinct from auth.uid() loop
    perform app.hr_notify(u, v_title, v_body, case when exists (select 1 from public.user_roles x where x.user_id = u and x.role = 'deputy_director') then '/deputy/attendance-edits' else '/it/integrations/biometric/attendance-audit' end,
                          'att_edit_applied:' || q.id::text || ':' || u::text, 'warning');
  end loop;
  if q.requested_by is distinct from auth.uid() then
    perform app.hr_notify(q.requested_by, 'نُفّذ طلب تعديل الحضور — ' || q.scope_label, v_body, '/ops-room/attendance', 'att_edit_done:' || q.id::text, 'info');
  end if;
end$$;

create or replace function app.attendance_edit_create__raw(p_scope_kind text, p_scope_ids uuid[], p_dates date[], p_action text, p_payload jsonb, p_reason text, p_mode text default 'direct')
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare emps uuid[]; v_id uuid; v_role text; v_chain uuid; n int; u uuid; q public.attendance_edit_requests;
begin
  v_role := case when app.has_role(array['ops_room']) then 'ops_room' when app.has_role(array['deputy_director']) then 'deputy_director' when app.has_role(array['super_admin']) then 'super_admin' end;
  if v_role is null then raise exception 'HR_FORBIDDEN'; end if;
  if p_mode not in ('direct', 'hr_request') then raise exception 'ATT_EDIT_MODE_INVALID'; end if;
  if p_mode = 'hr_request' and v_role = 'deputy_director' then raise exception 'ATT_EDIT_MODE_INVALID'; end if;   -- المعاون ينفّذ مباشرة فقط
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'HR_REASON_REQUIRED'; end if;
  perform app.attendance_edit_validate_dates(p_dates);
  perform app.attendance_edit_validate_payload(p_action, p_payload);
  select coalesce(array_agg(x), '{}') into emps from app.attendance_edit_scope_employees(p_scope_kind, p_scope_ids) x;
  if cardinality(emps) = 0 then raise exception 'ATT_EDIT_SCOPE_EMPTY'; end if;
  if cardinality(emps) * cardinality(p_dates) > 5000 then raise exception 'ATT_EDIT_TOO_LARGE'; end if;

  insert into public.attendance_edit_requests (mode, status, scope_kind, scope_ids, scope_label, dates, action, payload, reason, requested_by, requester_role, employees_count, days_count)
  values (p_mode, 'approved', p_scope_kind, p_scope_ids, app.attendance_scope_label(p_scope_kind, p_scope_ids), (select array_agg(distinct d order by d) from unnest(p_dates) d), p_action, coalesce(p_payload, '{}'::jsonb), trim(p_reason), auth.uid(), v_role,
          cardinality(emps), (select count(distinct d) from unnest(p_dates) d))
  returning id into v_id;
  insert into public.attendance_edit_items (request_id, employee_id, work_date, before, proposed, skipped_reason)
  select v_id, e, d, (select to_jsonb(a) from public.hr_attendance_days a where a.employee_id = e and a.work_date = d), pr - 'skipped', case when p_mode='direct' and coalesce((pr->>'needs_approval')::boolean,false) then 'لا بصمات: يُرسل طلب حضور لاعتماده' else pr->>'skipped' end
  from (select e, d, app.attendance_edit_proposed(e, d, p_action, p_payload) pr from unnest(emps) e cross join (select distinct x from unnest(p_dates) x) dd(d)) t;
  select count(*) into n from public.attendance_edit_items where request_id = v_id and skipped_reason is null;
  if n = 0 then delete from public.attendance_edit_requests where id = v_id; raise exception 'ATT_EDIT_NOTHING_TO_APPLY'; end if;
  update public.attendance_edit_requests set items_count = n where id = v_id;

  if p_mode = 'direct' then
    perform app.attendance_edit_apply(v_id);
  else
    v_chain := app.approval_open('attendance_edit', v_id, auth.uid());
    if v_chain is not null then
      update public.attendance_edit_requests set status = 'pending_approval', chain_id = v_chain where id = v_id;
    else
      -- بلا سلسلة مضبوطة: يصل الموارد البشرية مباشرة
      update public.attendance_edit_requests set approved_at = now() where id = v_id;
      perform app.attendance_edit_notify_hr(v_id);
    end if;
  end if;
  select * into q from public.attendance_edit_requests where id = v_id;
  return jsonb_build_object('id', v_id, 'status', q.status, 'mode', q.mode, 'employees', q.employees_count, 'days', q.days_count, 'items', q.items_count, 'minutes_fixed', q.minutes_fixed,
                            'via_chain', q.chain_id is not null, 'scope_label', q.scope_label);
end$$;

-- وصول بصمة حقيقية لاحقاً يستبدل الوقت الافتراضي تلقائياً في الشهر المفتوح، مع سجل واضح.
-- الشهر المعتمد حضورياً ينتظر إعادة التدقيق، والمقفل مالياً للمراجعة دون تعديل.
alter function app.hr_evaluate_day(uuid,date) rename to hr_evaluate_day_00351_prior;
revoke all on function app.hr_evaluate_day_00351_prior(uuid,date) from public,anon,authenticated;
create or replace function app.hr_evaluate_day(p_employee uuid,p_date date) returns void
language plpgsql security definer set search_path=public,app as $$
declare a public.hr_attendance_days%rowtype; c jsonb; n int; first_p timestamptz; last_p timestamptz; b jsonb; after_ jsonb; why text;
begin
 if p_employee is null or p_date is null then return; end if;
 -- تسلسل التصحيح، وصول البصمة، وقرار المالية قبل قراءة الصف.
 perform app.hr_payroll_lock_range(p_date,p_date);
 select * into a from public.hr_attendance_days where employee_id=p_employee and work_date=p_date for update;
 if a.manual_punch_correction is not null then
   c:=app.hr_missing_punch_context(p_employee,p_date,true);
   n:=coalesce((c->>'count')::int,0); first_p:=(c->>'real')::timestamptz; last_p:=(c->>'last')::timestamptz;
   if n>=2 or (n=1 and a.manual_punch_correction->>'missing_side'='both') then
     if app.hr_month_locked(p_date) then
       why:='وصول بصمة حقيقية ليوم مصحّح في شهر مقفل مالياً — للمراجعة دون تعديل';
     elsif app.hr_month_confirmed(p_date) then
       why:='وصول بصمة حقيقية ليوم مصحّح بعد اعتماد الحضورية — للمراجعة قبل إعادة الاعتماد';
       insert into public.hr_attendance_pending_auto(period_month,employee_id,work_date,would_be_status)
       values(date_trunc('month',p_date)::date,p_employee,p_date,null)
       on conflict(period_month,employee_id,work_date) do update set would_be_status=excluded.would_be_status;
     elsif not exists(select 1 from public.hr_leaves l where l.employee_id=p_employee and l.status='approved' and l.kind='leave' and p_date between l.start_date and l.end_date) then
       b:=to_jsonb(a);
       update public.hr_attendance_days set source='auto',manual_punch_correction=null,approved_permit_original=null,approved_leave_original=null where id=a.id;
       perform app.hr_evaluate_day_00351_prior(p_employee,p_date);
       select to_jsonb(x) into after_ from public.hr_attendance_days x where id=a.id;
       insert into public.hr_attendance_audit(employee_id,work_date,action,before,after,reason,actor)
       values(p_employee,p_date,'reset_auto',b,after_,'وصلت البصمة الحقيقية فأُلغي الوقت الافتراضي وأُعيد الاحتساب من دفتر البصمات؛ إن بقيت بصمة واحدة يلزم تحديد طرفها',auth.uid());
       return;
     end if;
     if why is not null and not exists(select 1 from public.hr_attendance_audit x where x.employee_id=p_employee and x.work_date=p_date and x.action='auto_blocked' and x.reason=why and x.after->>'check_in'=first_p::text and x.after->>'check_out'=last_p::text) then
       insert into public.hr_attendance_audit(employee_id,work_date,action,before,after,reason,actor)
       values(p_employee,p_date,'auto_blocked',to_jsonb(a),jsonb_build_object('check_in',first_p::text,'check_out',last_p::text),why,auth.uid());
     end if;

   end if;
 end if;
 if app.hr_month_locked(p_date) then return; end if;
 perform app.hr_evaluate_day_00351_prior(p_employee,p_date);
end$$;
revoke all on function app.hr_evaluate_day(uuid,date) from public,anon,authenticated;

-- نمر أيضاً بالمقفل لتسجيل المراجعة فقط؛ أي فشل لا يعطّل استقبال البصمة.
create or replace function app.hr_evaluate_day_safe(p_employee uuid,p_date date) returns boolean
language plpgsql security definer set search_path=public,app as $$
begin
 if p_employee is null or p_date is null then return false; end if;
 perform app.hr_evaluate_day(p_employee,p_date); return not app.hr_month_locked(p_date);
exception when others then
 insert into public.integration_logs(provider,direction,endpoint,status,payload)
 values('biometric','inbound','hr_evaluate_day','failed',jsonb_build_object('employee_id',p_employee,'date',p_date,'error',left(sqlerrm,300)));
 return false;
end$$;

create or replace function app.trg_biometric_punches_evaluate() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare r record; m record;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if not app.hr_policy_bool('auto_evaluate_enabled', true) then return null; end if;
  for r in
    select distinct n.employee_id, d.work_date
    from new_punches n
    cross join lateral (values (app.hr_local_date(n.punched_at)), (app.hr_local_date(n.punched_at) - 1)) as d(work_date)
    where n.employee_id is not null
    order by d.work_date,n.employee_id
  loop
    perform app.hr_evaluate_day_safe(r.employee_id, r.work_date);
  end loop;
  for m in
    select distinct n.employee_id, date_trunc('month', app.hr_local_date(n.punched_at))::date as month
    from new_punches n where n.employee_id is not null
  loop
    begin
      perform app.hr_refresh_alerts(m.employee_id, m.month);
    exception when others then null;
    end;
  end loop;
  return null;
end$$;

create or replace function app.trg_biometric_punches_evaluate_upd() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare r record; m record;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  for r in
    select distinct n.employee_id, d.work_date
    from new_punches n join old_punches o on o.id = n.id
    cross join lateral (values (app.hr_local_date(n.punched_at)), (app.hr_local_date(n.punched_at) - 1)) as d(work_date)
    where n.employee_id is not null and n.employee_id is distinct from o.employee_id
    order by d.work_date,n.employee_id
  loop
    perform app.hr_evaluate_day_safe(r.employee_id, r.work_date);
  end loop;
  for m in
    select distinct n.employee_id, date_trunc('month', app.hr_local_date(n.punched_at))::date as month
    from new_punches n join old_punches o on o.id = n.id
    where n.employee_id is not null and n.employee_id is distinct from o.employee_id
  loop
    begin perform app.hr_refresh_alerts(m.employee_id, m.month); exception when others then null; end;
  end loop;
  return null;
end$$;

-- تعرض الواجهة الشفت الساري والبصمة الأصلية من الدفتر دون افتراض اتجاهها.
create or replace function public.ops_attendance_correction_options(p_employee uuid,p_date date) returns jsonb
language plpgsql stable security definer set search_path=public,app as $$
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
 return app.hr_missing_punch_context(p_employee,p_date);
end$$;
revoke all on function public.ops_attendance_correction_options(uuid,date) from public,anon;
grant execute on function public.ops_attendance_correction_options(uuid,date) to authenticated;

-- التراجع لا يطغى على بصمة حقيقية وصلت بعد التطبيق.
create or replace function app.attendance_edit_revert__raw(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare q public.attendance_edit_requests; it record; b jsonb; c jsonb; cur public.hr_attendance_days%rowtype; n int := 0; u uuid; v_reason text;
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
    select * into cur from public.hr_attendance_days where employee_id=it.employee_id and work_date=it.work_date for update;
    if it.after->'manual_punch_correction' is not null and it.after->'manual_punch_correction'<>'null'::jsonb then
      if cur.source='auto' and cur.manual_punch_correction is null then
        -- وصلت بصمات حقيقية بعد التطبيق: لا نعيد وضع صورة قديمة فوقها.
        null;
      elsif cur.manual_punch_correction is distinct from it.after->'manual_punch_correction' then
        raise exception 'ATT_EDIT_CHANGED_SINCE_APPLY';
      elsif coalesce(b->>'source','auto') <> 'manual' then
        delete from public.hr_attendance_days where employee_id=it.employee_id and work_date=it.work_date;
        perform app.hr_evaluate_day(it.employee_id,it.work_date);
      else
        update public.hr_attendance_days set check_in=(b->>'check_in')::timestamptz, check_out=(b->>'check_out')::timestamptz,
          late_minutes=coalesce((b->>'late_minutes')::int,0), early_minutes=coalesce((b->>'early_minutes')::int,0), worked_minutes=coalesce((b->>'worked_minutes')::int,0),
          status=b->>'status',source='manual',manual_punch_correction=null,approved_permit_original=null,edited_by=auth.uid(),edited_at=now(),edit_reason=v_reason,updated_at=now()
        where employee_id=it.employee_id and work_date=it.work_date;
        perform app.hr_evaluate_day(it.employee_id,it.work_date);
      end if;
    else
      -- طلب تاريخي بلا بيانات مصدر: إن تعارض الأصل المحفوظ مع دفتر البصمات الحالي
      -- فلا نخمّن ولا نستبدل الحقيقة بصورة قديمة؛ يلزم تدقيق يدوي.
      c:=app.hr_missing_punch_context(it.employee_id,it.work_date,true);
      if coalesce((c->>'count')::int,0)>0 and not coalesce((
        coalesce(b->>'source','')='auto' and (
          (c->>'count')::int=1 and (b->>'check_in')::timestamptz=(c->>'real')::timestamptz and b->>'check_out' is null
          or (c->>'count')::int>1 and (b->>'check_in')::timestamptz=(c->>'real')::timestamptz and (b->>'check_out')::timestamptz=(c->>'last')::timestamptz
        )
      ),false) then raise exception 'ATT_EDIT_CHANGED_SINCE_APPLY'; end if;
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
