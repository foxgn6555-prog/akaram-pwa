-- 00400-ط: إعادة التحقق وحفظ أدلة الكشف للمعاون فقط؛ لا اعتماد ولا خصم ولا تغيير في إقفال المالية.
alter table public.hr_missing_punch_month_draft_revisions add column evidence jsonb;
alter table public.hr_missing_punch_month_draft_revisions add constraint hr_missing_punch_evidence_object_check check(evidence is null or jsonb_typeof(evidence)='object');

-- لقطة الحساب مع الأدلة في استعلام واحد ولقطة قاعدة بيانات واحدة.
-- بصمات نافذة الأيام المجاورة للمرشحين تحفظ للمراجعة، ولا تعني جميعها الشفت نفسه.
create function app.hr_missing_punch_recheck_pack(p_month date) returns jsonb
language sql stable security definer set search_path=public,app set timezone='UTC' as $$
 with boundaries as (
   select date_trunc('month',p_month)::date first_day,(date_trunc('month',p_month)+interval '1 month')::date last_day,app.hr_local_date(now()) today
 ), candidates as (
   select r.id register_id,r.employee_id,r.work_date,r.detected_by source
   from public.hr_missing_punch_register r cross join boundaries b where r.work_date>=b.first_day and r.work_date<b.last_day
   union all
   select null::uuid,a.employee_id,a.work_date,'current'::text
   from public.hr_attendance_days a cross join boundaries b
   where a.work_date>=b.first_day and a.work_date<b.last_day and a.status='incomplete' and not a.is_rest_day
     and (a.work_date<b.today or (a.expected_out is not null and a.expected_out<=now()))
     and not exists(select 1 from public.hr_missing_punch_register r where r.employee_id=a.employee_id and r.work_date=a.work_date)
 ), cases as (
   select c.employee_id,c.work_date,c.register_id,c.source,
     (select to_jsonb(sh) from app.hr_effective_shift(c.employee_id,c.work_date) sh) as shift,
     case when c.register_id is not null then app.hr_missing_punch_review_evidence(c.register_id)
       else jsonb_build_object(
         'register',null,'context',app.hr_missing_punch_context(c.employee_id,c.work_date,true),
         'attendance',(select jsonb_build_object('status',a.status,'source',a.source,'check_in',a.check_in,'check_out',a.check_out,
           'expected_in',a.expected_in,'expected_out',a.expected_out,'is_rest_day',a.is_rest_day)
           from public.hr_attendance_days a where a.employee_id=c.employee_id and a.work_date=c.work_date),
         'leave',exists(select 1 from public.hr_leaves l where l.employee_id=c.employee_id and l.kind='leave' and l.status='approved' and c.work_date between l.start_date and l.end_date),
         'punches',coalesce((select jsonb_agg(jsonb_build_object('id',bp.id,'at',bp.punched_at,'device',bp.device_serial,'direction',bp.direction,'method',bp.method,'received_at',bp.created_at) order by bp.punched_at,bp.id)
           from public.biometric_punches bp where bp.employee_id=c.employee_id
             and bp.punched_at>=((c.work_date-1)::timestamp-app.hr_tz()) at time zone 'UTC'
             and bp.punched_at<((c.work_date+3)::timestamp-app.hr_tz()) at time zone 'UTC'),'[]'::jsonb)) end as evidence,
     (select jsonb_build_object('id',d.id,'decision',d.decision,'reason',d.reason,'actor',d.actor,'decided_at',d.created_at,'evidence_hash',d.evidence_hash)
       from public.hr_missing_punch_review_decisions d where d.register_id=c.register_id order by d.id desc limit 1) as last_decision
   from candidates c
 ), packaged as (
   select jsonb_build_object('timezone_offset',app.hr_tz()::text,
     'punch_window_hours',app.hr_policy()->'punch_window_hours',
     'punch_window_auto_cap',app.hr_policy()->'punch_window_auto_cap',
     'cases',coalesce((select jsonb_agg(to_jsonb(c) order by c.work_date,c.employee_id,c.register_id) from cases c),'[]'::jsonb)) as evidence
 )
 select jsonb_build_object('snapshot',app.hr_missing_punch_draft_snapshot(p_month),'evidence',p.evidence,'evidence_hash',md5(p.evidence::text)) from packaged p
$$;
revoke all on function app.hr_missing_punch_recheck_pack(date) from public,anon,authenticated,service_role;

-- إعادة التحقق تُنشئ نسخة قابلة للمراجعة فقط؛ لا تُعد موافقة أو خصماً.
create function public.deputy_missing_punch_report_recheck(p_month date,p_revision int) returns jsonb
language plpgsql security definer set search_path=public,app as $$
declare m date; h public.hr_missing_punch_month_drafts%rowtype; pack jsonb; j jsonb;
begin
 if auth.uid() is null or not app.has_role(array['deputy_director']) then raise exception 'HR_FORBIDDEN'; end if;
 perform app.require_can('deputy.attendance-edits','execute');
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'HR_MISSING_DRAFT_ISOLATION'; end if;
 if p_month is null then raise exception 'HR_MONTH_REQUIRED'; end if;
 m:=date_trunc('month',p_month)::date;
 perform app.hr_payroll_lock_range(m,m);
 if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
 select * into h from public.hr_missing_punch_month_drafts where period_month=m for update;
 if not found or h.status<>'sent' then raise exception 'HR_MISSING_REPORT_NOT_SENT'; end if;
 if p_revision is null or p_revision<>h.current_revision then raise exception 'HR_MISSING_REPORT_CHANGED'; end if;
 pack:=app.hr_missing_punch_recheck_pack(m); j:=pack->'snapshot';
 if not coalesce((j->>'settings_configured')::boolean,false) then raise exception 'HR_MISSING_SETTINGS_REQUIRED'; end if;
 update public.hr_missing_punch_month_drafts set current_revision=current_revision+1,updated_by=auth.uid(),updated_at=now() where id=h.id returning * into h;
 insert into public.hr_missing_punch_month_draft_revisions(draft_id,revision,snapshot,evidence,saved_by)
 values(h.id,h.current_revision,j,pack->'evidence',auth.uid());
 return jsonb_build_object('id',h.id,'revision',h.current_revision,'saved_at',h.updated_at);
end$$;
revoke all on function public.deputy_missing_punch_report_recheck(date,int) from public,anon;
grant execute on function public.deputy_missing_punch_report_recheck(date,int) to authenticated;

-- حالة اللقطة وأدلتها؛ الوارد المرسل سابقاً يتطلب إعادة تحقق أولاً ليُحفظ دليلها.
create or replace function public.deputy_missing_punch_report(p_month date,p_limit int default 100,p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path=public,app as $$
declare m date; h public.hr_missing_punch_month_drafts%rowtype; j jsonb; ev jsonb; pack jsonb; rows_ jsonb; scheduled boolean:=false;
begin
 if auth.uid() is null or not app.has_role(array['deputy_director']) then raise exception 'HR_FORBIDDEN'; end if;
 perform app.require_can('deputy.attendance-edits','view');
 if p_month is null then raise exception 'HR_MONTH_REQUIRED'; end if;
 m:=date_trunc('month',p_month)::date;
 if exists(select 1 from pg_extension where extname='pg_cron') then
   execute 'select exists(select 1 from cron.job where jobname=$1 and active)' into scheduled using 'hr_missing_punch_month_send';
 end if;
 select * into h from public.hr_missing_punch_month_drafts where period_month=m and status='sent';
 if not found then return jsonb_build_object('month',m,'exists',false,'finance_locked',app.hr_month_locked(m),'automatic_send_scheduled',scheduled); end if;
 select r.snapshot,r.evidence into j,ev from public.hr_missing_punch_month_draft_revisions r where r.draft_id=h.id and r.revision=h.current_revision;
 if j is null then raise exception 'HR_MISSING_DRAFT_INCOMPLETE'; end if;
 pack:=app.hr_missing_punch_recheck_pack(m);
 select coalesce(jsonb_agg(q.row_ order by q.ord),'[]'::jsonb) into rows_ from (
   select v.row_,v.ord from jsonb_array_elements(j->'rows') with ordinality v(row_,ord)
   order by v.ord limit greatest(1,least(coalesce(p_limit,100),200)) offset greatest(0,coalesce(p_offset,0))
 ) q;
 return (j-'rows')||jsonb_build_object('exists',true,'id',h.id,'revision',h.current_revision,'sent_at',h.sent_at,
   'rechecked_at',case when ev is not null then h.updated_at else null end,'has_evidence',ev is not null,
   'evidence_changed',ev is not null and ev is distinct from pack->'evidence',
   'finance_locked',app.hr_month_locked(m),'automatic_send_scheduled',scheduled,
   'results_changed',((pack->'snapshot')-'finance_locked') is distinct from (j-'finance_locked'),'rows',rows_);
end$$;

-- أدلة نسخة واحدة، لموظف وتاريخ محددين؛ لا يمكن طلب نسخة قديمة أو كشف خارج المعاون.
create function public.deputy_missing_punch_report_case(p_month date,p_revision int,p_employee uuid,p_date date) returns jsonb
language plpgsql stable security definer set search_path=public,app as $$
declare m date; h public.hr_missing_punch_month_drafts%rowtype; ev jsonb; c jsonb;
begin
 if auth.uid() is null or not app.has_role(array['deputy_director']) then raise exception 'HR_FORBIDDEN'; end if;
 perform app.require_can('deputy.attendance-edits','view');
 if p_month is null or p_date is null or p_employee is null then raise exception 'HR_MONTH_REQUIRED'; end if;
 m:=date_trunc('month',p_month)::date;
 select * into h from public.hr_missing_punch_month_drafts where period_month=m and status='sent';
 if not found then raise exception 'HR_MISSING_REPORT_NOT_SENT'; end if;
 if p_revision is null or p_revision<>h.current_revision then raise exception 'HR_MISSING_REPORT_CHANGED'; end if;
 select r.evidence into ev from public.hr_missing_punch_month_draft_revisions r where r.draft_id=h.id and r.revision=h.current_revision;
 if ev is null then raise exception 'HR_MISSING_RECHECK_REQUIRED'; end if;
 select v into c from jsonb_array_elements(ev->'cases') v where v->>'employee_id'=p_employee::text and v->>'work_date'=p_date::text limit 1;
 if c is null then raise exception 'HR_NOT_FOUND'; end if;
 return c;
end$$;
revoke all on function public.deputy_missing_punch_report_case(date,int,uuid,date) from public,anon;
grant execute on function public.deputy_missing_punch_report_case(date,int,uuid,date) to authenticated;
