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
   select r.employee_id,r.work_date,r.original_punch,r.detected_by,r.requires_review,r.correction_audit_id,
     null::text as source,null::timestamptz as expected_out,null::boolean as single_side,
     case when r.detected_by='daily_snapshot' and r.correction_audit_id is null then app.hr_missing_punch_context(r.employee_id,r.work_date,true) else null end as ctx
   from public.hr_missing_punch_register r where r.work_date>=first_day and r.work_date<last_day
   union all
   -- الحالة غير الملتقطة ليست سجلاً دائماً؛ تدخل في المعاينة فقط بعد نهاية الشفت وفحص الأصل.
   select a.employee_id,a.work_date,coalesce(a.check_in,a.check_out),'current'::text,false,null::uuid,
     a.source,a.expected_out,((a.check_in is null) <> (a.check_out is null)),app.hr_missing_punch_context(a.employee_id,a.work_date,true)
   from public.hr_attendance_days a
   where a.work_date>=first_day and a.work_date<last_day and a.status='incomplete' and not a.is_rest_day
     and (a.work_date<today or (a.expected_out is not null and a.expected_out<=now()))
     and not exists(select 1 from public.hr_missing_punch_register r where r.employee_id=a.employee_id and r.work_date=a.work_date)
 ), marked as (
   select v.*, case
     when exists(select 1 from public.hr_leaves l where l.employee_id=v.employee_id and l.kind='leave' and l.status='approved' and v.work_date between l.start_date and l.end_date) then 'leave'
     when v.detected_by='current' and v.expected_out>now() then 'pending'
     when v.requires_review then 'review'
     when v.detected_by in ('manual_correction','audit_backfill') or v.correction_audit_id is not null then 'confirmed'
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
