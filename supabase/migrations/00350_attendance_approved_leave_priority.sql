-- 00399-ب: الإجازة المعتمدة تتقدم على التعديل اليدوي؛ لا تُمس أوقات البصمات.
-- هذا الإصلاح لا يغيّر بعد احتساب تغطية الزمنيات.
alter table public.hr_attendance_days add column if not exists approved_leave_original jsonb;

alter table public.hr_attendance_audit drop constraint if exists hr_attendance_audit_action_check;
alter table public.hr_attendance_audit add constraint hr_attendance_audit_action_check
  check (action in ('edit','reset_auto','deduction_add','deduction_delete','export','approve','waive','unwaive','confirm','reopen','auto_blocked','deputy_approve','leave_sync'));

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
revoke all on function app.hr_evaluate_day_00350_base(uuid,date) from public, anon, authenticated;

-- لا يمكن لتعديل يدوي لاحق أن يحجب إجازة معتمدة أو يمحو أصل الحالة المحفوظ.
-- مشتقات اليوم والإعفاءات لا تمس هذه الحقول وتستمر كالمعتاد.
create or replace function app.hr_approved_leave_manual_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare e uuid := new.employee_id; d date := new.work_date;
begin
  if current_setting('app.hr_leave_sync', true) = 'on' then return new; end if;
  if new.source <> 'manual' then return new; end if;
  if tg_op = 'UPDATE' and (new.source, new.status, new.check_in, new.check_out, new.late_minutes, new.early_minutes, new.worked_minutes, new.approved_leave_original)
       is not distinct from (old.source, old.status, old.check_in, old.check_out, old.late_minutes, old.early_minutes, old.worked_minutes, old.approved_leave_original) then return new; end if;
  -- التعديل اليدوي يتسلسل مع اعتماد الإجازة والراتب، ويعيد التحقق بعد الانتظار.
  perform app.hr_payroll_lock_range(d,d);
  if app.hr_month_locked(d) then raise exception 'HR_MONTH_LOCKED'; end if;
  if exists (select 1 from public.hr_leaves l where l.employee_id=e and l.status='approved' and l.kind='leave' and d between l.start_date and l.end_date) then
    if tg_op = 'UPDATE' then
      -- التراجع الموثق عن تعديل سابق يستعيد الأصل تحت غطاء الإجازة، لا فوقها.
      new.approved_leave_original := jsonb_build_object('status',new.status,'late_minutes',new.late_minutes,'early_minutes',new.early_minutes);
      new.status := 'leave'; new.late_minutes := 0; new.early_minutes := 0;
      return new;
    end if;
    -- مسار التعديل المفرد/الجماعي يستخدم INSERT ... ON CONFLICT: يُرفض قبل استبدال الإجازة.
    raise exception 'HR_APPROVED_LEAVE_CONFLICT';
  end if;
  return new;
end$$;
revoke all on function app.hr_approved_leave_manual_guard() from public, anon, authenticated;
drop trigger if exists trg_hr_approved_leave_manual_guard on public.hr_attendance_days;
create trigger trg_hr_approved_leave_manual_guard before insert or update on public.hr_attendance_days
  for each row execute function app.hr_approved_leave_manual_guard();

-- تغيير إجازة في شهر معتمد حضورياً لكنه غير مقفل مالياً: إعادة فتح الحضورية
-- حتى لا تعتمد المالية كشفاً سابقاً؛ التغييرات الأخرى المعلقة لا تُحذف.
create or replace function app.hr_leave_reopen_confirmed(p_employee uuid, p_date date) returns void
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month',p_date)::date; changed int;
begin
  if current_setting('app.attendance_confirming', true) = 'on' then return; end if;
  update public.hr_attendance_confirmations set status='reopened', reopened_at=now(), reopened_by=auth.uid(),
    reopen_reason='تغيير إجازة معتمدة بعد اعتماد الحضورية — يلزم إعادة التدقيق والاعتماد', updated_at=now()
  where period_month=m and status='confirmed';
  get diagnostics changed = row_count;
  if changed > 0 then
    insert into public.hr_attendance_audit(employee_id,work_date,action,reason,actor,after)
    values (p_employee,p_date,'reopen','أُعيد فتح حضورية الشهر آلياً بسبب تغيير إجازة معتمدة',auth.uid(),jsonb_build_object('month',m));
    perform app.notify_by_role(array['ops_room','it_admin'], 'إعادة تدقيق الحضورية بعد تغيير إجازة',
      'أُعيد فتح حضورية شهر ' || to_char(m,'YYYY-MM') || ' بسبب إجازة معتمدة؛ يلزم إعادة التدقيق والاعتماد قبل التصدير.', 'warning', '/ops/attendance');
  end if;
end$$;
revoke all on function app.hr_leave_reopen_confirmed(uuid,date) from public, anon, authenticated;

create or replace function app.hr_evaluate_day(p_employee uuid, p_date date) returns void
language plpgsql security definer set search_path = public, app as $$
declare a public.hr_attendance_days%rowtype; v_has_leave boolean; b jsonb; n jsonb; old_sync text;
begin
  if p_employee is null or p_date is null then return; end if;
  -- الإجازات أو أصل الحالة اليدوية المتأثرة فقط تتسلسل مع اعتماد المالية؛ لا نقفل الشهر لكل بصمة عادية.
  if exists (select 1 from public.hr_leaves l where l.employee_id=p_employee and l.status='approved' and l.kind='leave' and p_date between l.start_date and l.end_date)
     or exists (select 1 from public.hr_attendance_days x where x.employee_id=p_employee and x.work_date=p_date and (x.approved_leave_original is not null or (x.source='auto' and x.status='leave'))) then
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

-- توحيد قفل أشهر الإجازة مع الاعتماد المالي لمنع السباق عند اعتماد كشف وإجازة في الوقت نفسه.
create or replace function app.hr_payroll_lock_range(p_from date,p_to date) returns void
language plpgsql security definer set search_path = public, app as $$
declare m record;
begin
  for m in select mm::date as d from generate_series(date_trunc('month',p_from),date_trunc('month',p_to),interval '1 month') mm order by mm loop
    perform pg_advisory_xact_lock(hashtextextended('hr-payroll-month:' || m.d::text,0));
  end loop;
end$$;
revoke all on function app.hr_payroll_lock_range(date,date) from public, anon, authenticated;

-- المدى قد يعبر شهراً مقفلاً في وسطه، لا عند الطرفين فقط. تبقى أغلفة الحراسة العامة كما هي.
create or replace function app.hr_leave_decide__raw(p_leave uuid, p_approve boolean, p_note text default null) returns void
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

create or replace function app.hr_leave_cancel__raw(p_leave uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare l record; me uuid := app.current_employee_id(); d date;
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
    d := l.start_date; while d <= l.end_date loop perform app.hr_evaluate_day(l.employee_id, d); d := d + 1; end loop;
    perform app.hr_refresh_alerts(l.employee_id, l.start_date); perform app.hr_refresh_alerts(l.employee_id, l.end_date);
  end if;
end$$;
-- التراجع يأخذ أقفال الأشهر قبل أقفال صفوف الحضور.
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
        late_minutes = coalesce((b ->> 'late_minutes')::int, 0), early_minutes = coalesce((b ->> 'early_minutes')::int, 0), worked_minutes = coalesce((b ->> 'worked_minutes')::int, 0),
        status = b ->> 'status', source = 'manual', edited_by = auth.uid(), edited_at = now(), edit_reason = v_reason, updated_at = now()
      where employee_id = it.employee_id and work_date = it.work_date;
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

-- اعتماد المالية ينتظر قفل الشهر نفسه ثم يعيد قراءة الحالة.
create or replace function app.finance_payroll_approve__raw(p_export uuid, p_force boolean default false)
returns void language plpgsql security definer set search_path = public, app as $$
declare x record; st jsonb; n_bad int;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select * into x from public.hr_month_exports where id = p_export;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  perform app.hr_payroll_lock_range(x.period_month,x.period_month);
  select * into x from public.hr_month_exports where id = p_export;
  if x.status <> 'exported' then raise exception 'HR_EXPORT_NOT_EDITABLE'; end if;
  if x.review_status <> 'approved' then raise exception 'HR_DEPUTY_REVIEW_PENDING'; end if;
  select count(*) into n_bad from public.finance_payroll_reconcile(x.period_month) rc where rc.row_id in (select id from public.hr_month_export_rows where export_id = p_export) and not rc.money_ok;
  if n_bad > 0 then raise exception 'HR_PAYROLL_RECONCILE_MISMATCH'; end if;
  if exists (select 1 from public.hr_month_export_rows where export_id = p_export and final_net is null) then raise exception 'HR_SALARY_MISSING'; end if;
  st := app.hr_month_export_status(x.period_month);
  if app.advance_export_mismatch(p_export) > 0 then raise exception 'HR_ADVANCE_STALE'; end if;   -- 00304: لا تجاوز بالقوة — أقساط السلف في الكشف لا تطابق الواقع
  if (st ->> 'needs_reexport')::boolean and not coalesce(p_force, false) then raise exception 'HR_EXPORT_STALE'; end if;
  update public.hr_month_exports set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_export;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select r.employee_id, x.period_month, 'approve', jsonb_build_object('export_id', p_export, 'final_net', r.final_net, 'deputy_relief', r.review_relief_amount, 'forced_stale', (st ->> 'needs_reexport')::boolean and p_force), 'اعتماد راتب الشهر', auth.uid()
  from public.hr_month_export_rows r where r.export_id = p_export;
  perform app.advance_post_installments(p_export);
  perform app.payroll_carry_uncollected(p_export);   -- 00256
end$$;

-- تصحيح التعارضات السابقة في المفتوح، وتسجيل المقفول للمراجعة فقط دون تغيير أي حضور أو راتب مقفل.
create or replace function app.hr_leave_reconcile_existing() returns void
language plpgsql security definer set search_path = public, app as $$
declare r record;
begin
  for r in
    select a.employee_id,a.work_date,a.status,to_jsonb(a) as before_row
    from public.hr_attendance_days a
    where a.status <> 'leave' and exists (select 1 from public.hr_leaves l where l.employee_id=a.employee_id and l.kind='leave' and l.status='approved' and a.work_date between l.start_date and l.end_date)
    order by a.work_date,a.employee_id
  loop
    perform app.hr_payroll_lock_range(r.work_date,r.work_date);
    if app.hr_month_locked(r.work_date) then
      if not exists (select 1 from public.hr_attendance_audit x where x.employee_id=r.employee_id and x.work_date=r.work_date and x.action='auto_blocked'
        and x.reason='تعارض إجازة معتمدة مع حضور شهر مقفل مالياً — للمراجعة دون تعديل') then
        insert into public.hr_attendance_audit(employee_id,work_date,action,before,after,reason,actor)
        values (r.employee_id,r.work_date,'auto_blocked',r.before_row,jsonb_build_object('status','leave'),
          'تعارض إجازة معتمدة مع حضور شهر مقفل مالياً — للمراجعة دون تعديل',auth.uid());
      end if;
    else
      perform app.hr_evaluate_day(r.employee_id,r.work_date);
    end if;
  end loop;
end$$;
revoke all on function app.hr_leave_reconcile_existing() from public, anon, authenticated;
select app.hr_leave_reconcile_existing();
