-- 00400-ب: سجل مستقل للبصمات الناقصة. لا غرامة ولا تصدير راتب في هذه الجولة.
create table public.hr_missing_punch_register (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  original_punch timestamptz not null,
  missing_side text check(missing_side in ('in','out')),
  detected_by text not null check(detected_by in ('manual_correction','daily_snapshot','audit_backfill')),
  detected_at timestamptz not null default now(),
  correction_audit_id uuid references public.hr_attendance_audit(id) on delete set null,
  unique(employee_id,work_date)
);
create index hr_missing_punch_register_date_idx on public.hr_missing_punch_register(work_date,employee_id);
alter table public.hr_missing_punch_register enable row level security;
revoke all on public.hr_missing_punch_register from public,anon,authenticated;
grant select on public.hr_missing_punch_register to authenticated;
create policy "missing punch: authorized readers" on public.hr_missing_punch_register for select to authenticated
  using(app.has_role(array['ops_room','hr_officer','it_admin','deputy_director','super_admin']));

-- سجل التدقيق في 00352 يُحدَّث في نفس معاملة تصحيح الحضور ليحمل البصمة الحقيقية والطرف المصحّح.
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
    correction_audit_id=coalesce(public.hr_missing_punch_register.correction_audit_id,excluded.correction_audit_id);
  return new;
end$$;
revoke all on function app.hr_record_missing_punch_correction() from public,anon,authenticated;
create trigger hr_record_missing_punch_correction after insert or update of after on public.hr_attendance_audit
for each row execute function app.hr_record_missing_punch_correction();

-- استعادة التصحيحات المعروفة من أدلة 00352 فقط. لا نخمن السجلات اليدوية الأقدم بلا بيانات مصدر.
insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,missing_side,detected_by,detected_at,correction_audit_id)
select distinct on (a.employee_id,a.work_date) a.employee_id,a.work_date,(a.after->'manual_punch_correction'->>'original_punch')::timestamptz,
       a.after->'manual_punch_correction'->>'missing_side','audit_backfill',a.created_at,a.id
from public.hr_attendance_audit a
where a.action='edit' and a.after->'manual_punch_correction'->>'missing_side' in ('in','out')
  and a.after->'manual_punch_correction'->>'original_punch' is not null
order by a.employee_id,a.work_date,a.created_at,a.id
on conflict(employee_id,work_date) do nothing;

-- لقطة يومية بعد انتهاء الشفت؛ تسجيل بصمة واحدة حقيقية فقط، لا بصمتين مختلفتين ولا غياب بلا بصمة.
-- إعادة التنفيذ وإعادة السحب لا تكرر السجل، ولا تغير الحضور ولا الرواتب.
create or replace function app.hr_capture_missing_punch_daily() returns integer
language plpgsql security definer set search_path=public,app as $$
declare r record; c jsonb; n int:=0; changed int;
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
    c:=app.hr_missing_punch_context(r.employee_id,r.work_date,true);
    if not (c ? 'skipped') and coalesce((c->>'count')::int,0)=1 then
      insert into public.hr_missing_punch_register(employee_id,work_date,original_punch,detected_by)
      values(r.employee_id,r.work_date,(c->>'real')::timestamptz,'daily_snapshot')
      on conflict(employee_id,work_date) do nothing;
      get diagnostics changed=row_count; n:=n+changed;
    end if;
  end loop;
  return n;
end$$;
revoke all on function app.hr_capture_missing_punch_daily() from public,anon,authenticated;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='hr_missing_punch_capture_daily';
    perform cron.schedule('hr_missing_punch_capture_daily','0 6 * * *',$job$ select app.hr_capture_missing_punch_daily() $job$);
  end if;
end $$;

-- تكامل التصفير والاحتفاظ: لا يُحذف السجل آلياً؛ يظل ضمن فئة تصفير الحضور الصريحة.
alter function app.platform_reset_catalog() rename to platform_reset_catalog_00353;
create function app.platform_reset_catalog() returns table(key text,label text,grp text,sort int,tables text[],buckets text[])
language sql immutable as $$
 select c.key,c.label,c.grp,c.sort,case when c.key='attendance' then c.tables||array['hr_missing_punch_register'] else c.tables end,c.buckets
 from app.platform_reset_catalog_00353() c
$$;
alter function app.data_retention_catalog() rename to data_retention_catalog_00353;
create function app.data_retention_catalog() returns table(data_key text,portal_key text,label text,description text,table_name text,time_column text,keep_where text,safety_lock text,deletable boolean,default_months int,default_export_required boolean)
language sql immutable as $$
 select * from app.data_retention_catalog_00353()
 union all select 'hr_missing_punch_register','hr','سجل البصمات الناقصة','دليل النقص ولو صُحّح، يستخدم في مراجعة الكشف الشهري.','hr_missing_punch_register',null::text,null::text,'محمي من الحذف الزمني التلقائي',false,0,true
$$;

-- قراءة شهر واحد: المسجّل دائماً ظاهر، والحالات الحالية غير المسجلة تعرض للمراجعة أيضاً.
-- لا مبالغ ولا أي كتابة في كشف الرواتب. الصفوف مقسّمة حتى لا يُحذف الباقي صامتاً.
create or replace function public.ops_missing_punch_register(p_month date,p_limit int default 100,p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path=public,app as $$
declare first_day date; last_day date; result jsonb; scheduler_active boolean:=false;
begin
  if auth.uid() is null or not app.has_role(array['ops_room','hr_officer','it_admin','deputy_director','super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_month is null then raise exception 'HR_MONTH_REQUIRED'; end if;
  first_day:=date_trunc('month',p_month)::date; last_day:=(first_day+interval '1 month')::date;
  with evidence as (
    select r.employee_id,r.work_date,r.original_punch,r.missing_side,r.detected_by,r.detected_at,r.correction_audit_id,false as needs_review
    from public.hr_missing_punch_register r where r.work_date>=first_day and r.work_date<last_day
    union all
    select a.employee_id,a.work_date,nullif(c.j->>'real','')::timestamptz,null::text,'current'::text,null::timestamptz,null::uuid,
           coalesce((c.j->>'count')::int,0)<>1
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
