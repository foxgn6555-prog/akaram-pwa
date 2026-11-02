-- 00400-ج: لا تضيع حالة ناقصة لو وصلت بصمة حقيقية قبل لقطة اليوم التالي.
-- لا يُفترض أن تأخر السحب مخالفة: الحالة غير محسومة وتظهر للمراجعة فقط.
alter table public.hr_missing_punch_register add column requires_review boolean not null default false;
alter table public.hr_missing_punch_register add column later_punch timestamptz;
alter table public.hr_missing_punch_register drop constraint hr_missing_punch_register_detected_by_check;
alter table public.hr_missing_punch_register add constraint hr_missing_punch_register_detected_by_check
  check(detected_by in ('manual_correction','daily_snapshot','audit_backfill','real_arrival'));

-- التصحيح اليدوي المثبت ببصمة واحدة يزيل الالتباس مع إبقاء الدليل القديم.
create or replace function app.hr_record_missing_punch_correction() returns trigger
language plpgsql security definer set search_path=public,app as $$
declare c jsonb; side text; real_ts timestamptz;
begin
  if new.action <> 'edit' then return new; end if;
  c:=new.after->'manual_punch_correction'; side:=c->>'missing_side';
  if side not in ('in','out') or c->>'original_punch' is null then return new; end if;
  real_ts:=(c->>'original_punch')::timestamptz;
  insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by,correction_audit_id)
  values(new.employee_id,new.work_date,real_ts,side,'manual_correction',new.id)
  on conflict(employee_id,work_date) do update set
    missing_side=coalesce(public.hr_missing_punch_register.missing_side,excluded.missing_side),
    correction_audit_id=coalesce(public.hr_missing_punch_register.correction_audit_id,excluded.correction_audit_id),
    requires_review=false;
  return new;
end$$;

-- نقرأ قبل استبدال حالة الحضور، بعد قفل الشهر والصف بنفس ترتيب 00352.
-- صف الحضور الأصلي auto وله طرف واحد. بصمتان حقيقيتان مختلفتان لا تعنيان غرامة:
-- قد تكونا وصلتا على دفعتين؛ لذلك تسجلان للمراجعة فقط حتى إن كان الشهر مقفلاً مالياً.
-- الإجازة المعتمدة وأصل «حضور بلا بصمة» المعتمد مستثنيان. لا نعدّل الحضور أو الراتب هنا.
alter function app.hr_evaluate_day(uuid,date) rename to hr_evaluate_day_00354_prior;
revoke all on function app.hr_evaluate_day_00354_prior(uuid,date) from public,anon,authenticated;
create function app.hr_evaluate_day(p_employee uuid,p_date date) returns void
language plpgsql security definer set search_path=public,app as $$
declare a public.hr_attendance_days%rowtype; c jsonb; orig timestamptz; extra timestamptz; first_ts timestamptz; last_ts timestamptz; n int; lo timestamptz; hi timestamptz;
begin
  if p_employee is null or p_date is null then return; end if;
  perform app.hr_payroll_lock_range(p_date,p_date);
  select * into a from public.hr_attendance_days where employee_id=p_employee and work_date=p_date for update;
  if a.id is not null and a.status='incomplete' and a.source='auto' and not a.is_rest_day
    and ((a.expected_out is not null and a.expected_out<=now()) or (a.expected_out is null and p_date<app.hr_local_date(now())))
    and ((a.check_in is null) <> (a.check_out is null))
    and not exists(select 1 from public.hr_leaves l where l.employee_id=p_employee and l.kind='leave' and l.status='approved' and p_date between l.start_date and l.end_date)
    and not exists(select 1 from public.hr_attendance_audit au where au.employee_id=p_employee and au.work_date=p_date
      and au.action='edit' and au.after->'manual_punch_correction'->>'missing_side'='both') then
    -- فشل التسجيل لا يجوز أن يمنع استقبال/احتساب البصمة. يُسجّل السبب لمراجعة التطوير.
    begin
      orig:=coalesce(a.check_in,a.check_out); c:=app.hr_missing_punch_context(p_employee,p_date,true);
      if c->>'skipped'='لا يوجد شفت ساري' then
        lo:=(p_date::timestamp-app.hr_tz()) at time zone 'UTC'; hi:=lo+interval '1 day';
        select count(distinct bp.punched_at),min(bp.punched_at),max(bp.punched_at) into n,first_ts,last_ts
          from public.biometric_punches bp where bp.employee_id=p_employee and bp.punched_at>=lo and bp.punched_at<hi;
      elsif not (c ? 'skipped') then
        n:=coalesce((c->>'count')::int,0); first_ts:=(c->>'real')::timestamptz; last_ts:=(c->>'last')::timestamptz;
      else n:=0;
      end if;
      extra:=case when first_ts is distinct from orig then first_ts else last_ts end;
      if n>=2 and extra is not null and extra<>orig then
        insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,detected_by,requires_review,later_punch)
        values(p_employee,p_date,orig,'real_arrival',true,extra)
        on conflict(employee_id,work_date) do update
          set requires_review=true, later_punch=excluded.later_punch
          where hr_missing_punch_register.detected_by='daily_snapshot'
            and hr_missing_punch_register.correction_audit_id is null;
      end if;
    exception when others then
      begin insert into public.integration_logs(provider,direction,endpoint,status,payload)
        values('biometric','inbound','missing_punch_review','error',jsonb_build_object('employee_id',p_employee,'date',p_date,'error',left(sqlerrm,300)));
      exception when others then null; end;
    end;
  end if;
  perform app.hr_evaluate_day_00354_prior(p_employee,p_date);
end$$;
revoke all on function app.hr_evaluate_day(uuid,date) from public,anon,authenticated;

-- الحارس الآمن يسجل بالقيمة المسموحة error؛ فشل التقييم لا يُسقط البصمة الواردة.
create or replace function app.hr_evaluate_day_safe(p_employee uuid,p_date date) returns boolean
language plpgsql security definer set search_path=public,app as $$
begin
 if p_employee is null or p_date is null then return false; end if;
 perform app.hr_evaluate_day(p_employee,p_date); return not app.hr_month_locked(p_date);
exception when others then
 begin insert into public.integration_logs(provider,direction,endpoint,status,payload)
   values('biometric','inbound','hr_evaluate_day','error',jsonb_build_object('employee_id',p_employee,'date',p_date,'error',left(sqlerrm,300)));
 exception when others then null; end;
 return false;
end$$;
revoke all on function app.hr_evaluate_day_safe(uuid,date) from public,anon,authenticated;

-- إعادة ربط أو تصحيح وقت بصمة حقيقية يعيد احتساب اليومين المتأثرين والموظفَين، بالترتيب نفسه.
-- تحديث metadata بلا تغيير الوقت أو الموظف لا يعيد الاحتساب؛ ويُحترم إيقاف الاحتساب الآلي.
create or replace function app.trg_biometric_punches_evaluate_upd() returns trigger
language plpgsql security definer set search_path=public,app as $$
declare r record; m record;
begin
  if pg_trigger_depth()>1 or not app.hr_policy_bool('auto_evaluate_enabled',true) then return null; end if;
  for r in
    select distinct z.employee_id,d.work_date from (
      select n.employee_id,n.punched_at from new_punches n join old_punches o on o.id=n.id
        where n.employee_id is distinct from o.employee_id or n.punched_at is distinct from o.punched_at
      union all
      select o.employee_id,o.punched_at from new_punches n join old_punches o on o.id=n.id
        where n.employee_id is distinct from o.employee_id or n.punched_at is distinct from o.punched_at
    ) z cross join lateral (values(app.hr_local_date(z.punched_at)),(app.hr_local_date(z.punched_at)-1)) d(work_date)
    where z.employee_id is not null order by d.work_date,z.employee_id
  loop perform app.hr_evaluate_day_safe(r.employee_id,r.work_date); end loop;
  for m in
    select distinct z.employee_id,date_trunc('month',app.hr_local_date(z.punched_at))::date as month from (
      select n.employee_id,n.punched_at from new_punches n join old_punches o on o.id=n.id
        where n.employee_id is distinct from o.employee_id or n.punched_at is distinct from o.punched_at
      union all
      select o.employee_id,o.punched_at from new_punches n join old_punches o on o.id=n.id
        where n.employee_id is distinct from o.employee_id or n.punched_at is distinct from o.punched_at
    ) z where z.employee_id is not null
  loop begin perform app.hr_refresh_alerts(m.employee_id,m.month); exception when others then null; end; end loop;
  return null;
end$$;
-- لقطة الشهر واليوم تحترم ترتيب أقفال المالية دون انتظار شهر مشغول.
create or replace function app.hr_capture_missing_punch_daily() returns integer
language plpgsql security definer set search_path=public,app as $$
declare r record; c jsonb; n int:=0; changed int; skipped int:=0;
begin
  for r in select a.employee_id,a.work_date from public.hr_attendance_days a
    where a.work_date >= (date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date
      and a.work_date < app.hr_local_date(now())
      and a.status='incomplete' and a.expected_out is not null and a.expected_out<=now()
      and not a.is_rest_day
      and not exists(select 1 from public.hr_missing_punch_register reg where reg.employee_id=a.employee_id and reg.work_date=a.work_date)
      and not exists(select 1 from public.hr_leaves l where l.employee_id=a.employee_id and l.kind='leave' and l.status='approved' and a.work_date between l.start_date and l.end_date)
    order by a.work_date,a.employee_id
  loop
    -- لا تنتظر شهراً مشغولاً: تجنب عكس أقفال دفعة تصحيحات، وسيعاد الفحص في اللقطة التالية.
    if not pg_try_advisory_xact_lock(hashtextextended('hr-payroll-month:'||date_trunc('month',r.work_date)::date::text,0)) then skipped:=skipped+1; continue; end if;
    -- أعد التحقق بعد القفل، فقد تغيّرت الحالة بعد بدء قراءة قائمة اللقطة.
    perform 1 from public.hr_attendance_days a where a.employee_id=r.employee_id and a.work_date=r.work_date
      and a.status='incomplete' and a.expected_out is not null and a.expected_out<=now() and not a.is_rest_day
      and not exists(select 1 from public.hr_leaves l where l.employee_id=a.employee_id and l.kind='leave' and l.status='approved' and a.work_date between l.start_date and l.end_date)
      for update;
    if not found then continue; end if;
    c:=app.hr_missing_punch_context(r.employee_id,r.work_date,true);
    if not (c ? 'skipped') and coalesce((c->>'count')::int,0)=1 then
      insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,detected_by)
      values(r.employee_id,r.work_date,(c->>'real')::timestamptz,'daily_snapshot')
      on conflict(employee_id,work_date) do nothing;
      get diagnostics changed=row_count; n:=n+changed;
    end if;
  end loop;
  if skipped>0 then
    begin insert into public.integration_logs(provider,direction,endpoint,status,payload,error_note)
      values('biometric','inbound','missing_punch_snapshot','error',jsonb_build_object('skipped_candidates',skipped),
        'شهر مشغول؛ تتكرر محاولة اللقطة التالية');
    exception when others then null; end;
  end if;
  return n;
end$$;
revoke all on function app.hr_capture_missing_punch_daily() from public,anon,authenticated;

-- في القائمة تظل الوقائع الملتبسة مرئية للمراجعة وغير محسومة.
create or replace function public.ops_missing_punch_register(p_month date,p_limit int default 100,p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path=public,app as $$
declare first_day date; last_day date; result jsonb; scheduler_active boolean:=false;
begin
  if auth.uid() is null or not app.has_role(array['ops_room','hr_officer','it_admin','deputy_director','super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_month is null then raise exception 'HR_MONTH_REQUIRED'; end if;
  first_day:=date_trunc('month',p_month)::date; last_day:=(first_day+interval '1 month')::date;
  with evidence as (
    select r.employee_id,r.work_date,r.original_punch,r.missing_side,r.detected_by,r.detected_at,r.correction_audit_id,r.requires_review as needs_review,r.later_punch
    from public.hr_missing_punch_register r where r.work_date>=first_day and r.work_date<last_day
    union all
    select a.employee_id,a.work_date,nullif(c.j->>'real','')::timestamptz,null::text,'current'::text,null::timestamptz,null::uuid,
           coalesce((c.j->>'count')::int,0)<>1,null::timestamptz as later_punch
    from public.hr_attendance_days a cross join lateral (select app.hr_missing_punch_context(a.employee_id,a.work_date,true) j) c
    where a.work_date>=first_day and a.work_date<last_day and a.status='incomplete' and not a.is_rest_day
      and ((a.expected_out is not null and a.expected_out<=now()) or (a.expected_out is null and a.work_date<app.hr_local_date(now())))
      and not exists(select 1 from public.hr_missing_punch_register r where r.employee_id=a.employee_id and r.work_date=a.work_date)
  ), enriched as (
    select v.*,e.employee_number,e.full_name,d.name as department_name,b.name as branch_name,a.status as current_status,
      exists(select 1 from public.hr_leaves l where l.employee_id=v.employee_id and l.kind='leave' and l.status='approved' and v.work_date between l.start_date and l.end_date) as approved_leave
    from evidence v join public.employees e on e.id=v.employee_id
    left join public.departments d on d.id=e.department_id left join public.branches b on b.id=e.branch_id
    left join public.hr_attendance_days a on a.employee_id=v.employee_id and a.work_date=v.work_date
  ), page as (
    select * from enriched order by work_date desc,employee_number,employee_id limit greatest(1,least(coalesce(p_limit,100),500)) offset greatest(0,coalesce(p_offset,0))
  )
  select jsonb_build_object('month',first_day,'total',(select count(*) from enriched),'rows',coalesce((select jsonb_agg(to_jsonb(p) order by p.work_date desc,p.employee_number,p.employee_id) from page p),'[]'::jsonb)) into result;
  if exists(select 1 from pg_extension where extname='pg_cron') then
    execute 'select exists(select 1 from cron.job where jobname=$1 and active)' into scheduler_active using 'hr_missing_punch_capture_daily';
  end if;
  return result||jsonb_build_object('automatic_capture_scheduled',scheduler_active);
end$$;
revoke all on function public.ops_missing_punch_register(date,int,int) from public,anon;
grant execute on function public.ops_missing_punch_register(date,int,int) to authenticated;
