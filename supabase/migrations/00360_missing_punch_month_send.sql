-- 00400-ح: إرسال تلقائي للمعاون فقط؛ لا اعتماد ولا خصم.
alter table public.hr_missing_punch_month_drafts drop constraint hr_missing_punch_month_drafts_status_check;
alter table public.hr_missing_punch_month_drafts add constraint hr_missing_punch_month_drafts_status_check check(status in ('draft','sent'));
alter table public.hr_missing_punch_month_drafts add column sent_at timestamptz;
alter table public.hr_missing_punch_month_drafts add constraint hr_missing_punch_sent_time_check check ((status='draft' and sent_at is null) or (status='sent' and sent_at is not null));

-- الدالة داخلية لا تُمنح للعميل؛ المتصلون العموميون يفحصون دورهم، والمجدول لا ينتحل مستخدماً.
create or replace function app.hr_missing_punch_draft_snapshot(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public,app as $$
declare first_day date; last_day date; today date:=app.hr_local_date(now()); policy jsonb; threshold int; fixed_amount numeric; result jsonb;
begin
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
   select * from computed order by app.hr_employee_sort_key(employee_number),employee_id
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

create or replace function public.ops_missing_punch_draft_save(p_month date) returns jsonb
language plpgsql security definer set search_path=public,app as $$
declare m date; j jsonb; h public.hr_missing_punch_month_drafts%rowtype;
begin
 if auth.uid() is null or not app.has_role(array['ops_room','super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
 perform app.require_can('ops-room.attendance','edit');
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'HR_MISSING_DRAFT_ISOLATION'; end if;
 if p_month is null then raise exception 'HR_MONTH_REQUIRED'; end if;
 m:=date_trunc('month',p_month)::date;
 if (m+interval '1 month')::date>app.hr_local_date(now()) then raise exception 'HR_MISSING_MONTH_NOT_ENDED'; end if;
 perform app.hr_payroll_lock_range(m,m);
 if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
 if exists(select 1 from public.hr_missing_punch_month_drafts d where d.period_month=m and d.status='sent') then raise exception 'HR_MISSING_REPORT_SENT'; end if;
 j:=app.hr_missing_punch_draft_snapshot(m);
 if not coalesce((j->>'settings_configured')::boolean,false) then raise exception 'HR_MISSING_SETTINGS_REQUIRED'; end if;
 -- إدراج نسخة جديدة دون حذف النسخ السابقة. تُحذف كلها فقط مع المسودة عند قفل المالية المؤكد.
 insert into public.hr_missing_punch_month_drafts(period_month,current_revision,created_by,updated_by)
 values(m,1,auth.uid(),auth.uid())
 on conflict(period_month) do update set current_revision=hr_missing_punch_month_drafts.current_revision+1,updated_by=auth.uid(),updated_at=now()
 returning * into h;
 insert into public.hr_missing_punch_month_draft_revisions(draft_id,revision,snapshot,saved_by)
 values(h.id,h.current_revision,j,auth.uid());
 return jsonb_build_object('id',h.id,'month',h.period_month,'revision',h.current_revision,'saved_at',h.updated_at,
  'total_employees',j->'total_employees','total_confirmed_days',j->'total_confirmed_days',
  'total_review_days',j->'total_review_days','total_pending_days',j->'total_pending_days',
  'total_proposed_amount',j->'total_proposed_amount','threshold',j->'threshold','fixed_amount',j->'fixed_amount');
end$$;

create or replace function public.ops_missing_punch_draft_get(p_month date,p_limit int default 100,p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path=public,app as $$
declare m date; h public.hr_missing_punch_month_drafts%rowtype; j jsonb; rows_ jsonb;
begin
 if auth.uid() is null or not app.has_role(array['ops_room','hr_officer','it_admin','deputy_director','super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
 if p_month is null then raise exception 'HR_MONTH_REQUIRED'; end if;
 m:=date_trunc('month',p_month)::date;
 select * into h from public.hr_missing_punch_month_drafts where period_month=m;
 if not found then return jsonb_build_object('month',m,'exists',false,'finance_locked',app.hr_month_locked(m)); end if;
 select r.snapshot into j from public.hr_missing_punch_month_draft_revisions r where r.draft_id=h.id and r.revision=h.current_revision;
 if j is null then raise exception 'HR_MISSING_DRAFT_INCOMPLETE'; end if;
 select coalesce(jsonb_agg(q.row_ order by q.ord),'[]'::jsonb) into rows_ from (
   select v.row_,v.ord from jsonb_array_elements(j->'rows') with ordinality v(row_,ord)
   order by v.ord limit greatest(1,least(coalesce(p_limit,100),200)) offset greatest(0,coalesce(p_offset,0))
 ) q;
 return (j-'rows')||jsonb_build_object('exists',true,'id',h.id,'revision',h.current_revision,'saved_at',h.updated_at,'status',h.status,'sent_at',h.sent_at,
   'finance_locked',app.hr_month_locked(m),'rows',rows_);
end$$;

create or replace function public.finance_missing_punch_draft_exists(p_month date) returns boolean
language plpgsql stable security definer set search_path=public,app as $$
begin
 if auth.uid() is null or not app.has_role(array['finance_officer','super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
 perform app.require_can('finance.payroll','view');
 if p_month is null then raise exception 'HR_MONTH_REQUIRED'; end if;
 return exists(select 1 from public.hr_missing_punch_month_drafts where period_month=date_trunc('month',p_month)::date);
end$$;

create or replace function app.hr_missing_punch_draft_finance_guard() returns trigger
language plpgsql security definer set search_path=public,app as $$
begin
 if new.status='approved' and (tg_op='INSERT' or old.status is distinct from 'approved') then
   -- قراءة لقطة قديمة بعد انتظار القفل قد تخفي مسودة أُنشئت متزامناً.
   if current_setting('transaction_isolation')<>'read committed' then raise exception 'HR_MISSING_DRAFT_ISOLATION'; end if;
   perform app.hr_payroll_lock_range(new.period_month,new.period_month);
   if exists(select 1 from public.hr_missing_punch_month_drafts d where d.period_month=new.period_month) then
     if not exists(select 1 from app.hr_missing_punch_draft_close_intents x where x.transaction_id=txid_current() and x.export_id=new.id and x.actor=auth.uid()) then raise exception 'HR_MISSING_DRAFT_DELETE_CONFIRM'; end if;
     delete from public.notifications where entity_type='missing_punch_month_report' and entity_id in
       (select d.id from public.hr_missing_punch_month_drafts d where d.period_month=new.period_month);
     delete from public.hr_missing_punch_month_drafts where period_month=new.period_month;
   end if;
 end if;
 return new;
end$$;

-- نقطة بداية الاستدراك: الشهر السابق لتركيب هذه الجولة؛ لا إنشاء تلقائي للأشهر الأقدم.
create table app.hr_missing_punch_auto_config (singleton boolean primary key default true check(singleton), start_month date not null);
insert into app.hr_missing_punch_auto_config(singleton,start_month) values(true,(date_trunc('month',app.hr_local_date(now()))-interval '1 month')::date);
revoke all on app.hr_missing_punch_auto_config from public,anon,authenticated;

-- يعيد الحساب لحظة الإرسال، مرة واحدة للشهر. لا يغير الحضور أو الرواتب.
create function app.hr_missing_punch_send_month(p_month date) returns text
language plpgsql security definer set search_path=public,app as $$
declare m date; j jsonb; h public.hr_missing_punch_month_drafts%rowtype;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'HR_MISSING_DRAFT_ISOLATION'; end if;
 if p_month is null then raise exception 'HR_MONTH_REQUIRED'; end if;
 m:=date_trunc('month',p_month)::date;
 if (m+interval '1 month')::date>app.hr_local_date(now()) then raise exception 'HR_MISSING_MONTH_NOT_ENDED'; end if;
 perform app.hr_payroll_lock_range(m,m);
 if app.hr_month_locked(m) then return 'locked'; end if;
 select * into h from public.hr_missing_punch_month_drafts where period_month=m;
 if found and h.status='sent' then return 'already_sent'; end if;
 j:=app.hr_missing_punch_draft_snapshot(m);
 if not coalesce((j->>'settings_configured')::boolean,false) then raise exception 'HR_MISSING_SETTINGS_REQUIRED'; end if;
 insert into public.hr_missing_punch_month_drafts(period_month,status,current_revision,created_by,updated_by,sent_at)
 values(m,'sent',1,null,null,now())
 on conflict(period_month) do update set status='sent',sent_at=now(),current_revision=hr_missing_punch_month_drafts.current_revision+1,updated_by=null,updated_at=now()
 returning * into h;
 insert into public.hr_missing_punch_month_draft_revisions(draft_id,revision,snapshot,saved_by) values(h.id,h.current_revision,j,null);
 insert into public.notifications(user_id,title,body,type,link,entity_type,entity_id,action_label,dedupe_key)
 select distinct ur.user_id,'كشف البصمات الناقصة للمراجعة',format('وصل كشف شهر %s للمراجعة، دون اعتماد أو خصم.',to_char(m,'YYYY-MM')),'info',
   '/deputy/attendance-edits?tab=missing-punch-report&month='||to_char(m,'YYYY-MM-DD'),
   'missing_punch_month_report',h.id,'فتح الكشف','missing-punch-report:'||h.id::text
 from public.user_roles ur where ur.role='deputy_director'
 on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
 return 'sent';
end$$;
revoke all on function app.hr_missing_punch_send_month(date) from public,anon,authenticated,service_role;

-- كل يوم 00:15 بتوقيت بغداد، حتى إن كانت منطقة ساعة cron مختلفة؛ يعيد محاولة الأشهر الفائتة غير المقفلة.
create function app.hr_missing_punch_run_due(p_now timestamptz) returns void
language plpgsql security definer set search_path=public,app as $$
declare m date; begin
 if extract(hour from p_now at time zone 'Asia/Baghdad')<>0 or extract(minute from p_now at time zone 'Asia/Baghdad')<>15 then return; end if;
 for m in select g::date from app.hr_missing_punch_auto_config c
   cross join lateral generate_series(c.start_month::timestamp,(date_trunc('month',app.hr_local_date(now()))-interval '1 month')::timestamp,interval '1 month') g
   where not exists(select 1 from public.hr_missing_punch_month_drafts d where d.period_month=g::date and d.status='sent')
     and not app.hr_month_locked(g::date) order by g
 loop
   begin perform app.hr_missing_punch_send_month(m);
   exception when others then
     -- فشل شهر لا يمنع محاولة غيره؛ يظهر السبب في سجل التكامل ويعاد غداً.
     begin
       insert into public.integration_logs(provider,direction,endpoint,status,payload,error_note)
       values('biometric','outbound','missing_punch_month_send','error',jsonb_build_object('month',m),left(sqlerrm,300));
     exception when others then raise warning 'missing punch send error could not be logged for %',m; end;
   end;
 end loop;
end$$;
revoke all on function app.hr_missing_punch_run_due(timestamptz) from public,anon,authenticated,service_role;
create function app.hr_missing_punch_run_scheduled() returns void language sql security definer set search_path=public,app as $$ select app.hr_missing_punch_run_due(now()) $$;
revoke all on function app.hr_missing_punch_run_scheduled() from public,anon,authenticated,service_role;
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
   perform cron.unschedule(jobid) from cron.job where jobname='hr_missing_punch_month_send';
   perform cron.schedule('hr_missing_punch_month_send','*/15 * * * *',$job$ select app.hr_missing_punch_run_scheduled() $job$);
 end if;
end $$;

-- وارد مستقل للمعاون فقط. التقسيم للعرض لا يحد حجم الكشف المحفوظ.
create function public.deputy_missing_punch_report(p_month date,p_limit int default 100,p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path=public,app as $$
declare m date; h public.hr_missing_punch_month_drafts%rowtype; j jsonb; fresh jsonb; rows_ jsonb; scheduled boolean:=false;
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
 select r.snapshot into j from public.hr_missing_punch_month_draft_revisions r where r.draft_id=h.id and r.revision=h.current_revision;
 if j is null then raise exception 'HR_MISSING_DRAFT_INCOMPLETE'; end if;
 fresh:=app.hr_missing_punch_draft_snapshot(m);
 select coalesce(jsonb_agg(q.row_ order by q.ord),'[]'::jsonb) into rows_ from (
   select v.row_,v.ord from jsonb_array_elements(j->'rows') with ordinality v(row_,ord)
   order by v.ord limit greatest(1,least(coalesce(p_limit,100),200)) offset greatest(0,coalesce(p_offset,0))
 ) q;
 return (j-'rows')||jsonb_build_object('exists',true,'id',h.id,'revision',h.current_revision,'sent_at',h.sent_at,
   'finance_locked',app.hr_month_locked(m),'automatic_send_scheduled',scheduled,
   'results_changed',(fresh-'finance_locked') is distinct from (j-'finance_locked'),'rows',rows_);
end$$;
revoke all on function public.deputy_missing_punch_report(date,int,int) from public,anon;
grant execute on function public.deputy_missing_punch_report(date,int,int) to authenticated;

-- إذا فُعّلت pg_cron بعد الترحيل، يمكن للتطوير تسجيل المهمة من الواجهة دون إعادة الترحيل.
create function public.it_missing_punch_schedule_repair() returns void
language plpgsql security definer set search_path=public,app as $$
begin
 perform app.require_it();
 perform app.require_can('it.integrations.auto-deductions','edit');
 if not exists(select 1 from pg_extension where extname='pg_cron') then raise exception 'HR_CRON_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('hr_missing_punch_month_send_schedule',0));
 perform cron.unschedule(jobid) from cron.job where jobname='hr_missing_punch_month_send';
 perform cron.schedule('hr_missing_punch_month_send','*/15 * * * *',$job$ select app.hr_missing_punch_run_scheduled() $job$);
end$$;
revoke all on function public.it_missing_punch_schedule_repair() from public,anon;
grant execute on function public.it_missing_punch_schedule_repair() to authenticated;

-- تحديث وصف الاحتفاظ فقط؛ سياسة حماية الجداول لا تتغير.
alter function app.data_retention_catalog() rename to data_retention_catalog_00359;
create function app.data_retention_catalog() returns table(data_key text,portal_key text,label text,description text,table_name text,time_column text,keep_where text,safety_lock text,deletable boolean,default_months int,default_export_required boolean)
language sql immutable as $$
 select c.data_key,c.portal_key,
   case c.data_key when 'hr_missing_punch_month_drafts' then 'مسودات وكشوف الناقصة غير المعتمدة'
     when 'hr_missing_punch_month_draft_revisions' then 'نسخ كشوف الناقصة غير المعتمدة' else c.label end,
   case c.data_key when 'hr_missing_punch_month_drafts' then 'مسودة أو كشف مرسل للمراجعة، يحذف ونسخه مع إقفال المالية بعد التأكيد.'
     when 'hr_missing_punch_month_draft_revisions' then 'نسخ المسودة والكشف المرسل غير المعتمد قبل إقفال المالية.' else c.description end,
   c.table_name,c.time_column,c.keep_where,c.safety_lock,c.deletable,c.default_months,c.default_export_required
 from app.data_retention_catalog_00359() c
$$;
