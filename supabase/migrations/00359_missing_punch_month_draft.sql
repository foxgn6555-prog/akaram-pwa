-- 00400-ز: مسودة محفوظة فقط. لا إنشاء طلب أو خصم أو اعتماد؛ أرقامها ليست نهائية.
create table public.hr_missing_punch_month_drafts (
 id uuid primary key default gen_random_uuid(),
 period_month date not null unique check(period_month=date_trunc('month',period_month)::date),
 status text not null default 'draft' check(status='draft'),
 current_revision int not null check(current_revision>=1),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
create table public.hr_missing_punch_month_draft_revisions (
 draft_id uuid not null references public.hr_missing_punch_month_drafts(id) on delete cascade,
 revision int not null check(revision>=1),
 snapshot jsonb not null,
 saved_by uuid references auth.users(id) on delete set null,
 saved_at timestamptz not null default now(),
 primary key(draft_id,revision)
);
alter table public.hr_missing_punch_month_drafts enable row level security;
alter table public.hr_missing_punch_month_draft_revisions enable row level security;
revoke all on public.hr_missing_punch_month_drafts,public.hr_missing_punch_month_draft_revisions from public,anon,authenticated;

-- احتساب المسودة في استعلام واحد ولقطة واحدة، مع كل الصفوف (لا يقتصر على صفحة المعاينة).
-- يجب إبقاء التصنيف مطابقاً للمعاينة؛ اختبار المسودة يطابق النتائج عبر أكثر من صفحة.
create function app.hr_missing_punch_draft_snapshot(p_month date)
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
revoke all on function app.hr_missing_punch_draft_snapshot(date) from public,anon,authenticated;

create function public.ops_missing_punch_draft_save(p_month date) returns jsonb
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
revoke all on function public.ops_missing_punch_draft_save(date) from public,anon;
grant execute on function public.ops_missing_punch_draft_save(date) to authenticated;

create function public.ops_missing_punch_draft_get(p_month date,p_limit int default 100,p_offset int default 0) returns jsonb
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
 return (j-'rows')||jsonb_build_object('exists',true,'id',h.id,'revision',h.current_revision,'saved_at',h.updated_at,
   'finance_locked',app.hr_month_locked(m),'rows',rows_);
end$$;
revoke all on function public.ops_missing_punch_draft_get(date,int,int) from public,anon;
grant execute on function public.ops_missing_punch_draft_get(date,int,int) to authenticated;

-- المالية تعرف فقط وجود المسودة؛ لا تتلقى تفاصيل الأسماء أو المبالغ عبر هذا الإجراء.
create function public.finance_missing_punch_draft_exists(p_month date) returns boolean
language plpgsql stable security definer set search_path=public,app as $$
begin
 if auth.uid() is null or not app.has_role(array['finance_officer','super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
 perform app.require_can('finance.payroll','view');
 if p_month is null then raise exception 'HR_MONTH_REQUIRED'; end if;
 return exists(select 1 from public.hr_missing_punch_month_drafts where period_month=date_trunc('month',p_month)::date and status='draft');
end$$;
revoke all on function public.finance_missing_punch_draft_exists(date) from public,anon;
grant execute on function public.finance_missing_punch_draft_exists(date) to authenticated;

-- صلاحية استثنائية لمعاملة التأكيد فقط، لا تُقبل أعلام جلسة يمكن للعميل تزويرها.
create table app.hr_missing_punch_draft_close_intents (
 transaction_id bigint not null, export_id uuid not null, actor uuid not null,
 primary key(transaction_id,export_id)
);
revoke all on app.hr_missing_punch_draft_close_intents from public,anon,authenticated;

-- لا تتجاوز واجهة قديمة الاختيار الصريح. الحذف مع إقفال الرواتب في معاملة واحدة؛ أي فشل يرجعهما معاً.
create function app.hr_missing_punch_draft_finance_guard() returns trigger
language plpgsql security definer set search_path=public,app as $$
begin
 if new.status='approved' and (tg_op='INSERT' or old.status is distinct from 'approved') then
   -- قراءة لقطة قديمة بعد انتظار القفل قد تخفي مسودة أُنشئت متزامناً.
   if current_setting('transaction_isolation')<>'read committed' then raise exception 'HR_MISSING_DRAFT_ISOLATION'; end if;
   perform app.hr_payroll_lock_range(new.period_month,new.period_month);
   if exists(select 1 from public.hr_missing_punch_month_drafts d where d.period_month=new.period_month and d.status='draft') then
     if not exists(select 1 from app.hr_missing_punch_draft_close_intents x where x.transaction_id=txid_current() and x.export_id=new.id and x.actor=auth.uid()) then raise exception 'HR_MISSING_DRAFT_DELETE_CONFIRM'; end if;
     delete from public.hr_missing_punch_month_drafts where period_month=new.period_month and status='draft';
   end if;
 end if;
 return new;
end$$;
revoke all on function app.hr_missing_punch_draft_finance_guard() from public,anon,authenticated;
create trigger hr_missing_punch_draft_finance_guard before insert or update of status on public.hr_month_exports
for each row execute function app.hr_missing_punch_draft_finance_guard();

create function public.finance_payroll_approve_discard_missing_draft(p_export uuid,p_force boolean,p_discard boolean) returns void
language plpgsql security definer set search_path=public,app as $$
declare m date;
begin
 if auth.uid() is null or not app.has_role(array['finance_officer','super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'HR_MISSING_DRAFT_ISOLATION'; end if;
 if p_discard is distinct from true then raise exception 'HR_MISSING_DRAFT_DELETE_CONFIRM'; end if;
 select period_month into m from public.hr_month_exports where id=p_export;
 if m is null then raise exception 'HR_NOT_FOUND'; end if;
 perform app.hr_payroll_lock_range(m,m);
 insert into app.hr_missing_punch_draft_close_intents(transaction_id,export_id,actor) values(txid_current(),p_export,auth.uid());
 perform public.finance_payroll_approve(p_export,coalesce(p_force,false));
 delete from app.hr_missing_punch_draft_close_intents where transaction_id=txid_current() and export_id=p_export;
end$$;
revoke all on function public.finance_payroll_approve_discard_missing_draft(uuid,boolean,boolean) from public,anon;
grant execute on function public.finance_payroll_approve_discard_missing_draft(uuid,boolean,boolean) to authenticated;

alter function app.platform_reset_catalog() rename to platform_reset_catalog_00358;
create function app.platform_reset_catalog() returns table(key text,label text,grp text,sort int,tables text[],buckets text[])
language sql immutable as $$
 select c.key,c.label,c.grp,c.sort,case when c.key='attendance' then c.tables||array['hr_missing_punch_month_drafts','hr_missing_punch_month_draft_revisions'] else c.tables end,c.buckets from app.platform_reset_catalog_00358() c
$$;
alter function app.data_retention_catalog() rename to data_retention_catalog_00358;
create function app.data_retention_catalog() returns table(data_key text,portal_key text,label text,description text,table_name text,time_column text,keep_where text,safety_lock text,deletable boolean,default_months int,default_export_required boolean)
language sql immutable as $$
 select * from app.data_retention_catalog_00358()
 union all select 'hr_missing_punch_month_drafts','hr','مسودات كشف الناقصة','مسودة غير مرسلة، تحذف مع نسخها عند إقفال المالية بعد التأكيد.', 'hr_missing_punch_month_drafts',null::text,null::text,'محمي من الحذف الزمني التلقائي',false,0,true
 union all select 'hr_missing_punch_month_draft_revisions','hr','نسخ مسودات كشف الناقصة','نسخ المسودة قبل إقفال المالية.', 'hr_missing_punch_month_draft_revisions',null::text,null::text,'محمي من الحذف الزمني التلقائي',false,0,true
$$;
