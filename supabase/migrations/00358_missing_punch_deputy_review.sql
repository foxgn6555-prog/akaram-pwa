-- 00400-و: حسم دليل الناقصة من المعاون وحده، بدون كشف أو أي كتابة مالية.
-- الاحتفاظ بالتاريخ؛ القرار صالح فقط ما دام الدليل الذي اطلع عليه المعاون لم يتغير.
create table public.hr_missing_punch_review_decisions (
  id bigint generated always as identity primary key,
  register_id uuid not null references public.hr_missing_punch_register(id) on delete cascade,
  decision text not null check (decision in ('confirmed','excluded')),
  reason text not null check (length(trim(reason)) between 10 and 1000),
  evidence jsonb not null,
  evidence_hash text not null,
  actor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index hr_missing_punch_review_latest on public.hr_missing_punch_review_decisions(register_id,id desc);
alter table public.hr_missing_punch_review_decisions enable row level security;
revoke all on public.hr_missing_punch_review_decisions from public,anon,authenticated;
revoke all on sequence public.hr_missing_punch_review_decisions_id_seq from public,anon,authenticated;

-- تشمل النافذة المتحفظة الأيام المجاورة حتى لا يبقى قرار قديم ساريًا بعد إعادة ربط البصمة أو تعديل وقتها.
-- تحديث البيانات الخام فقط لا يُبطل المراجعة؛ تغيير وقت/جهاز/اتجاه/طريقة/ارتباط أو وقت استقبال يُبطلها.
create function app.hr_missing_punch_review_evidence(p_id uuid) returns jsonb
language sql stable security definer set search_path=public,app as $$
 select jsonb_build_object(
  'register',jsonb_build_object('id',r.id,'employee_id',r.employee_id,'date',r.work_date,'original',r.original_punch,
    'later',r.later_punch,'source',r.detected_by,'side',r.missing_side,'correction',r.correction_audit_id,'requires_review',r.requires_review),
  'context',app.hr_missing_punch_context(r.employee_id,r.work_date,true),
  'attendance',(select jsonb_build_object('status',a.status,'source',a.source,'check_in',a.check_in,'check_out',a.check_out,
    'expected_in',a.expected_in,'expected_out',a.expected_out,'is_rest_day',a.is_rest_day)
    from public.hr_attendance_days a where a.employee_id=r.employee_id and a.work_date=r.work_date),
  'leave',exists(select 1 from public.hr_leaves l where l.employee_id=r.employee_id and l.kind='leave' and l.status='approved' and r.work_date between l.start_date and l.end_date),
  'punches',coalesce((select jsonb_agg(jsonb_build_object('id',bp.id,'at',bp.punched_at,'device',bp.device_serial,'direction',bp.direction,'method',bp.method,'received_at',bp.created_at) order by bp.punched_at,bp.id)
    from public.biometric_punches bp where bp.employee_id=r.employee_id
      and bp.punched_at>=((r.work_date-1)::timestamp-app.hr_tz()) at time zone 'UTC'
      and bp.punched_at<((r.work_date+3)::timestamp-app.hr_tz()) at time zone 'UTC'),'[]'::jsonb))
 from public.hr_missing_punch_register r where r.id=p_id
$$;
revoke all on function app.hr_missing_punch_review_evidence(uuid) from public,anon,authenticated;

create function app.hr_missing_punch_review_result(p_id uuid) returns text
language sql stable security definer set search_path=public,app as $$
 select d.decision from public.hr_missing_punch_review_decisions d
 where d.register_id=p_id and d.id=(select max(x.id) from public.hr_missing_punch_review_decisions x where x.register_id=p_id)
   and d.evidence_hash=md5(app.hr_missing_punch_review_evidence(p_id)::text)
$$;
revoke all on function app.hr_missing_punch_review_result(uuid) from public,anon,authenticated;

-- قائمة المرشحين المسجلين؛ الحالات الحية بلا سجل تبقى في المعاينة للمراجعة ولا يُسمح بحسمها هنا.
create function public.deputy_missing_punch_reviews(p_month date,p_limit int default 50,p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path=public,app as $$
declare m date; result jsonb;
begin
 if auth.uid() is null or not app.has_role(array['deputy_director']) then raise exception 'HR_FORBIDDEN'; end if;
 if p_month is null then raise exception 'HR_MONTH_REQUIRED'; end if;
 m:=date_trunc('month',p_month)::date;
 with candidates as (
   select r.id,r.employee_id,r.work_date,r.original_punch,r.later_punch,r.detected_by,r.requires_review,
     e.employee_number,e.full_name,d.name as department_name,b.name as branch_name,
     app.hr_missing_punch_review_evidence(r.id) as evidence,
     app.hr_missing_punch_review_result(r.id) as current_decision,
     last_dec.decision as last_decision,last_dec.reason as last_reason,last_dec.created_at as last_decided_at,app.manager_display_name(last_dec.actor) as last_actor_name
   from public.hr_missing_punch_register r
   join public.employees e on e.id=r.employee_id
   left join public.departments d on d.id=e.department_id left join public.branches b on b.id=e.branch_id
   left join lateral (select x.decision,x.reason,x.created_at,x.actor from public.hr_missing_punch_review_decisions x where x.register_id=r.id order by x.id desc limit 1) last_dec on true
   where r.work_date>=m and r.work_date<(m+interval '1 month')::date and r.correction_audit_id is null
     and (r.requires_review or exists(select 1 from public.hr_missing_punch_review_decisions prior where prior.register_id=r.id) or (r.detected_by='daily_snapshot' and (
       app.hr_missing_punch_context(r.employee_id,r.work_date,true) ? 'skipped'
       or coalesce((app.hr_missing_punch_context(r.employee_id,r.work_date,true)->>'count')::int,0)<>1
       or nullif(app.hr_missing_punch_context(r.employee_id,r.work_date,true)->>'real','')::timestamptz is distinct from r.original_punch)))
 ), page as (
   select *,md5(evidence::text) as evidence_hash from candidates order by work_date desc,employee_number,id
   limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,coalesce(p_offset,0))
 )
 select jsonb_build_object('month',m,'finance_locked',app.hr_month_locked(m),'total',(select count(*) from candidates),
   'rows',coalesce((select jsonb_agg(to_jsonb(p) order by work_date desc,employee_number,id) from page p),'[]'::jsonb)) into result;
 return result;
end$$;
revoke all on function public.deputy_missing_punch_reviews(date,int,int) from public,anon;
grant execute on function public.deputy_missing_punch_reviews(date,int,int) to authenticated;

create function public.deputy_missing_punch_review_decide(p_id uuid,p_decision text,p_reason text,p_evidence_hash text) returns void
language plpgsql security definer set search_path=public,app as $$
declare r public.hr_missing_punch_register%rowtype; ev jsonb; ctx jsonb;
begin
 if auth.uid() is null or not app.has_role(array['deputy_director']) then raise exception 'HR_FORBIDDEN'; end if;
 -- advisory locks require a fresh statement snapshot after waiting; never decide on an old RR/serializable snapshot.
 if current_setting('transaction_isolation') <> 'read committed' then raise exception 'HR_REVIEW_ISOLATION_UNSUPPORTED'; end if;
 if p_decision is null or p_decision not in ('confirmed','excluded') then raise exception 'HR_REVIEW_DECISION_INVALID'; end if;
 if length(trim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'HR_REVIEW_REASON_REQUIRED'; end if;
 select * into r from public.hr_missing_punch_register where id=p_id;
 if not found then raise exception 'HR_NOT_FOUND'; end if;
 perform app.hr_payroll_lock_range(r.work_date,r.work_date);
 select * into r from public.hr_missing_punch_register where id=p_id for update;
 if not found then raise exception 'HR_NOT_FOUND'; end if;
 if app.hr_month_locked(r.work_date) then raise exception 'HR_MONTH_LOCKED'; end if;
 if r.correction_audit_id is not null then raise exception 'HR_REVIEW_NOT_CANDIDATE'; end if;
 ev:=app.hr_missing_punch_review_evidence(r.id); ctx:=ev->'context';
 if coalesce((ev->>'leave')::boolean,false) then raise exception 'HR_APPROVED_LEAVE_CONFLICT'; end if;
 if not (r.requires_review or exists(select 1 from public.hr_missing_punch_review_decisions prior where prior.register_id=r.id) or (r.detected_by='daily_snapshot' and (ctx ? 'skipped' or coalesce((ctx->>'count')::int,0)<>1 or nullif(ctx->>'real','')::timestamptz is distinct from r.original_punch))) then raise exception 'HR_REVIEW_NOT_CANDIDATE'; end if;
 if p_evidence_hash is null or p_evidence_hash is distinct from md5(ev::text) then raise exception 'HR_REVIEW_EVIDENCE_CHANGED'; end if;
 insert into public.hr_missing_punch_review_decisions(register_id,decision,reason,evidence,evidence_hash,actor)
 values(r.id,p_decision,trim(p_reason),ev,md5(ev::text),auth.uid());
end$$;
revoke all on function public.deputy_missing_punch_review_decide(uuid,text,text,text) from public,anon;
grant execute on function public.deputy_missing_punch_review_decide(uuid,text,text,text) to authenticated;

alter function app.platform_reset_catalog() rename to platform_reset_catalog_00357;
create function app.platform_reset_catalog() returns table(key text,label text,grp text,sort int,tables text[],buckets text[])
language sql immutable as $$
 select c.key,c.label,c.grp,c.sort,case when c.key='attendance' then c.tables||array['hr_missing_punch_review_decisions'] else c.tables end,c.buckets from app.platform_reset_catalog_00357() c
$$;
alter function app.data_retention_catalog() rename to data_retention_catalog_00357;
create function app.data_retention_catalog() returns table(data_key text,portal_key text,label text,description text,table_name text,time_column text,keep_where text,safety_lock text,deletable boolean,default_months int,default_export_required boolean)
language sql immutable as $$
 select * from app.data_retention_catalog_00357()
 union all select 'hr_missing_punch_review_decisions','hr','قرارات مراجعة البصمة الناقصة','أسباب وبيانات مراجعة المعاون للأدلة.','hr_missing_punch_review_decisions',null::text,null::text,'محمي من الحذف الزمني التلقائي',false,0,true
$$;

-- تدخل نتيجة المعاون الحديثة في المعاينة فقط، ولا تنشئ أي خصم.
-- 00400-هـ: معاينة قراءة فقط لحساب كشف الناقصة؛ لا مسودة أو اعتماد أو خصم مالي.
-- تحسب كل بلوغ للحد، وتشمل التصحيحات المثبتة، وتستبعد الإجازة المعتمدة والأدلة الملتبسة.
create or replace function public.ops_missing_punch_month_preview(p_month date,p_limit int default 100,p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path=public,app as $$
declare first_day date; last_day date; today date:=app.hr_local_date(now()); policy jsonb; threshold int; fixed_amount numeric; result jsonb;
begin
 if auth.uid() is null or not app.has_role(array['ops_room','hr_officer','it_admin','deputy_director','super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
 if p_month is null then raise exception 'HR_MONTH_REQUIRED'; end if;
 first_day:=date_trunc('month',p_month)::date; last_day:=(first_day+interval '1 month')::date;
 if first_day>date_trunc('month',today)::date then raise exception 'HR_FUTURE_MONTH'; end if;
 policy:=app.hr_policy();
 -- قد تسبق السياسة القديمة حارس التحقق؛ لا نقسم على صفر ولا نفترض مبلغاً غير صالح.
 if jsonb_typeof(policy->'missing_punch_threshold')='number' and jsonb_typeof(policy->'missing_punch_fixed_amount')='number' then
   if (policy->>'missing_punch_threshold')::numeric between 1 and 31
      and (policy->>'missing_punch_threshold')::numeric=trunc((policy->>'missing_punch_threshold')::numeric)
      and (policy->>'missing_punch_fixed_amount')::numeric between 0 and 999999999999.99
      and (policy->>'missing_punch_fixed_amount')::numeric=round((policy->>'missing_punch_fixed_amount')::numeric,2) then
     threshold:=(policy->>'missing_punch_threshold')::numeric::int;
     fixed_amount:=(policy->>'missing_punch_fixed_amount')::numeric;
   end if;
 end if;
 with evidence as (
   -- التصحيح الموثق يبقى محسوباً حتى بعد وصول بصمة أخرى؛ اللقطة العادية يعاد فحصها.
   select r.employee_id,r.work_date,r.original_punch,r.detected_by,r.requires_review,r.correction_audit_id, app.hr_missing_punch_review_result(r.id) as deputy_decision, exists(select 1 from public.hr_missing_punch_review_decisions prior where prior.register_id=r.id) as had_review,
     null::text as source,null::timestamptz as expected_out,null::boolean as single_side,
     case when r.detected_by='daily_snapshot' and r.correction_audit_id is null then app.hr_missing_punch_context(r.employee_id,r.work_date,true) else null end as ctx
   from public.hr_missing_punch_register r where r.work_date>=first_day and r.work_date<last_day
   union all
   -- الحالة غير الملتقطة ليست سجلاً دائماً؛ تدخل في المعاينة فقط بعد نهاية الشفت وفحص الأصل.
   select a.employee_id,a.work_date,coalesce(a.check_in,a.check_out),'current'::text,false,null::uuid,null::text,false,
     a.source,a.expected_out,((a.check_in is null) <> (a.check_out is null)),app.hr_missing_punch_context(a.employee_id,a.work_date,true)
   from public.hr_attendance_days a
   where a.work_date>=first_day and a.work_date<last_day and a.status='incomplete' and not a.is_rest_day
     and (a.work_date<today or (a.expected_out is not null and a.expected_out<=now()))
     and not exists(select 1 from public.hr_missing_punch_register r where r.employee_id=a.employee_id and r.work_date=a.work_date)
 ), marked as (
   select v.*, case
     when exists(select 1 from public.hr_leaves l where l.employee_id=v.employee_id and l.kind='leave' and l.status='approved' and v.work_date between l.start_date and l.end_date) then 'leave'
     when v.detected_by='current' and v.expected_out>now() then 'pending'
     when v.deputy_decision='confirmed' then 'confirmed'
     when v.deputy_decision='excluded' then 'excluded'
     when v.requires_review then 'review'
     when v.detected_by in ('manual_correction','audit_backfill') or v.correction_audit_id is not null then 'confirmed'
     when v.had_review then 'review'
     when v.detected_by in ('daily_snapshot','current')
          and (v.detected_by<>'current' or (v.source='auto' and v.single_side and v.expected_out is not null and v.expected_out<=now()))
          and not (coalesce(v.ctx,'{}'::jsonb) ? 'skipped') and coalesce((v.ctx->>'count')::int,0)=1
          and nullif(v.ctx->>'real','')::timestamptz=v.original_punch then 'confirmed'
     else 'review' end as classification
   from evidence v
 ), grouped as (
   select m.employee_id,e.employee_number,e.full_name,d.name as department_name,b.name as branch_name,
     count(*) filter(where m.classification='confirmed')::int as confirmed_days,
     count(*) filter(where m.classification='review')::int as review_days,
     count(*) filter(where m.classification='leave')::int as excluded_leave_days,
     count(*) filter(where m.classification='excluded')::int as excluded_review_days,
     count(*) filter(where m.classification='pending')::int as pending_days,
     count(*) filter(where m.classification='confirmed' and m.detected_by='current')::int as current_unrecorded_days,
     jsonb_agg(jsonb_build_object('date',m.work_date,'classification',m.classification,'source',m.detected_by) order by m.work_date) as dates
   from marked m join public.employees e on e.id=m.employee_id
   left join public.departments d on d.id=e.department_id left join public.branches b on b.id=e.branch_id
   group by m.employee_id,e.employee_number,e.full_name,d.name,b.name
 ), computed as (
   select g.*,case when threshold is null then null else (g.confirmed_days/threshold) end as threshold_reached,
     case when threshold is null then null else (g.confirmed_days/threshold)*fixed_amount end as proposed_amount
   from grouped g
 ), page as (
   select * from computed order by app.hr_employee_sort_key(employee_number),employee_id limit greatest(1,least(coalesce(p_limit,100),200)) offset greatest(0,coalesce(p_offset,0))
 )
 select jsonb_build_object('month',first_day,'month_ended',last_day<=today,'finance_locked',app.hr_month_locked(first_day),
   'settings_configured',threshold is not null,'threshold',threshold,'fixed_amount',fixed_amount,
   'total_employees',(select count(*) from computed),
   'total_confirmed_days',coalesce((select sum(confirmed_days) from computed),0),
   'total_review_days',coalesce((select sum(review_days) from computed),0),
   'total_pending_days',coalesce((select sum(pending_days) from computed),0),
   'total_proposed_amount',case when threshold is null then null else coalesce((select sum(proposed_amount) from computed),0) end,
   'rows',coalesce((select jsonb_agg(to_jsonb(p) order by app.hr_employee_sort_key(p.employee_number),p.employee_id) from page p),'[]'::jsonb)) into result;
 return result;
end$$;
revoke all on function public.ops_missing_punch_month_preview(date,int,int) from public,anon;
grant execute on function public.ops_missing_punch_month_preview(date,int,int) to authenticated;

-- توضيح قرار المعاون الحالي في سجل غرفة العمليات.
create or replace function public.ops_missing_punch_register(p_month date,p_limit int default 100,p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path=public,app as $$
declare first_day date; last_day date; result jsonb; scheduler_active boolean:=false;
begin
  if auth.uid() is null or not app.has_role(array['ops_room','hr_officer','it_admin','deputy_director','super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_month is null then raise exception 'HR_MONTH_REQUIRED'; end if;
  first_day:=date_trunc('month',p_month)::date; last_day:=(first_day+interval '1 month')::date;
  with evidence as (
    select r.employee_id,r.work_date,r.original_punch,r.missing_side,r.detected_by,r.detected_at,r.correction_audit_id,(r.correction_audit_id is null and (r.requires_review or exists(select 1 from public.hr_missing_punch_review_decisions prior where prior.register_id=r.id) or (r.detected_by='daily_snapshot' and (app.hr_missing_punch_context(r.employee_id,r.work_date,true) ? 'skipped' or coalesce((app.hr_missing_punch_context(r.employee_id,r.work_date,true)->>'count')::int,0)<>1 or nullif(app.hr_missing_punch_context(r.employee_id,r.work_date,true)->>'real','')::timestamptz is distinct from r.original_punch)))) as needs_review,r.later_punch,app.hr_missing_punch_review_result(r.id) as deputy_decision
    from public.hr_missing_punch_register r where r.work_date>=first_day and r.work_date<last_day
    union all
    select a.employee_id,a.work_date,nullif(c.j->>'real','')::timestamptz,null::text,'current'::text,null::timestamptz,null::uuid,
           coalesce((c.j->>'count')::int,0)<>1,null::timestamptz as later_punch,null::text as deputy_decision
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
