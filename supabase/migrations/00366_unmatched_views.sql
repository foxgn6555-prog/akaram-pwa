-- تأكيد بشري لرقم مرتبط على جهاز آخر، مع بقاء الربط الرسمي العام كما هو.
create table public.unmatched_unit_independent_people (
 device_serial text not null, pin text not null, confirmed_by uuid not null, confirmed_at timestamptz not null default now(), original_user jsonb, original_device jsonb,
 primary key(device_serial,pin)
);
alter table public.unmatched_unit_independent_people enable row level security;
revoke all on public.unmatched_unit_independent_people from public,anon,authenticated;
alter table public.unmatched_unit_audit drop constraint unmatched_unit_audit_action_check;
alter table public.unmatched_unit_audit add constraint unmatched_unit_audit_action_check check(action in ('name','day','permission','independent'));

-- بعد التأكيد تُنسخ بصمات الزوج المؤكد إلى الأرشيف وحده، حتى لو نسبها الربط العام إلى موظف.
create function app.unmatched_unit_capture_independent() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,app as $$
begin
 insert into public.unmatched_archive_punches(source_punch_id,device_serial,pin,punched_at,direction,original_punch,original_device)
 select p.id,p.device_serial,p.pin,p.punched_at,p.direction,to_jsonb(p),
 case when d.id is null then null else jsonb_build_object('id',d.id,'serial_number',d.serial_number,'name',d.name,'branch_id',d.branch_id,'timezone_offset',d.timezone_offset) end
 from new_independent_punches p join public.unmatched_unit_independent_people i on i.device_serial=p.device_serial and i.pin=p.pin
 left join public.biometric_devices d on d.serial_number=p.device_serial
 order by p.device_serial,p.pin,p.punched_at,p.id on conflict do nothing;
 return null;
end $$;
create trigger trg_unmatched_independent_insert after insert on public.biometric_punches
 referencing new table as new_independent_punches for each statement execute function app.unmatched_unit_capture_independent();
revoke all on function app.unmatched_unit_capture_independent() from public,anon,authenticated,service_role;

-- معاينة الزوج قبل التأكيد: لا تُستحدث أرقام أو بصمات يدوياً.
create function public.unmatched_unit_independent_candidate(p_device text,p_pin text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,app as $$
declare d public.biometric_devices%rowtype; u public.biometric_device_users%rowtype; emp_name text; n bigint;
begin
 if auth.uid() is null or not app.has_role(array['hr_officer','it_admin','super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
 if nullif(btrim(p_device),'') is null or nullif(btrim(p_pin),'') is null then raise exception 'BIO_ARCHIVE_PERSON_REQUIRED'; end if;
 select * into d from public.biometric_devices x where x.serial_number=p_device;
 if not found then raise exception 'BIO_DEVICE_NOT_FOUND'; end if;
 select * into u from public.biometric_device_users x where x.device_serial=p_device and x.pin=p_pin;
 select count(*) into n from public.biometric_punches p where p.device_serial=p_device and p.pin=p_pin;
 if u.pin is null and n=0 then raise exception 'BIO_ARCHIVE_PERSON_NOT_FOUND'; end if;
 select e.full_name into emp_name from public.employees e where e.archived_at is null and (e.biometric_pin=p_pin or e.employee_number=p_pin)
 order by (case when e.biometric_pin=p_pin then 0 else 1 end),e.id limit 1;
 if emp_name is null then raise exception 'BIO_PIN_NOT_LINKED'; end if;
 return jsonb_build_object('device_serial',p_device,'pin',p_pin,'device_name',d.name,'device_user_name',u.name,'employee_name',emp_name,'source_punch_count',n,
 'already_confirmed',exists(select 1 from public.unmatched_unit_independent_people i where i.device_serial=p_device and i.pin=p_pin));
end $$;

-- SHARE NOWAIT: إن كان الدفتر مشغولاً تُرفض المحاولة فوراً، ولا نوقف استيراداً جارياً.
-- أثناء النسخ القصير يمنع القفل فجوة بين النسخ القديم وتفعيل التقاط الجديد؛ لا يُعدل أي صف رسمي.
create function public.unmatched_unit_confirm_independent(p_device text,p_pin text) returns void
language plpgsql security definer set search_path=pg_catalog,public,app as $$
declare candidate jsonb;
begin
 if auth.uid() is null then raise exception 'BIO_FORBIDDEN'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'BIO_EDIT_ISOLATION'; end if;
 perform pg_advisory_xact_lock(hashtextextended('unmatched-acl:'||auth.uid()::text,0));
 if not app.unmatched_unit_can_edit() then raise exception 'BIO_FORBIDDEN'; end if;
 if nullif(btrim(p_device),'') is null or nullif(btrim(p_pin),'') is null then raise exception 'BIO_ARCHIVE_PERSON_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('unmatched-person:'||length(p_device)::text||':'||p_device||p_pin,0));
 if exists(select 1 from public.unmatched_unit_independent_people i where i.device_serial=p_device and i.pin=p_pin) then return; end if;
 begin lock table public.biometric_punches in share mode nowait;
 exception when lock_not_available then raise exception 'BIO_LEDGER_BUSY'; end;
 candidate:=public.unmatched_unit_independent_candidate(p_device,p_pin);
 insert into public.unmatched_unit_independent_people(device_serial,pin,confirmed_by,original_user,original_device)
 select p_device,p_pin,auth.uid(),(select to_jsonb(u) from public.biometric_device_users u where u.device_serial=p_device and u.pin=p_pin),
 jsonb_build_object('id',d.id,'serial_number',d.serial_number,'name',d.name,'branch_id',d.branch_id,'timezone_offset',d.timezone_offset)
 from public.biometric_devices d where d.serial_number=p_device;
 insert into public.unmatched_archive_punches(source_punch_id,device_serial,pin,punched_at,direction,original_punch,original_device)
 select p.id,p.device_serial,p.pin,p.punched_at,p.direction,to_jsonb(p),case when d.id is null then null else jsonb_build_object('id',d.id,'serial_number',d.serial_number,'name',d.name,'branch_id',d.branch_id,'timezone_offset',d.timezone_offset) end
 from public.biometric_punches p left join public.biometric_devices d on d.serial_number=p.device_serial
 where p.device_serial=p_device and p.pin=p_pin order by p.punched_at,p.id on conflict do nothing;
 insert into public.unmatched_unit_audit(device_serial,pin,action,new_value,actor) values(p_device,p_pin,'independent',candidate,auth.uid());
end $$;
revoke all on function public.unmatched_unit_independent_candidate(text,text),public.unmatched_unit_confirm_independent(text,text) from public,anon;
grant execute on function public.unmatched_unit_independent_candidate(text,text),public.unmatched_unit_confirm_independent(text,text) to authenticated;

-- سجل التأكيد يحتفظ بصورة مستخدم الجهاز دون قفل صف مستخدم الجهاز أو التزاحم مع الجسر.
create or replace function app.unmatched_unit_person_exists(p_device text,p_pin text) returns boolean
language sql stable security definer set search_path=pg_catalog,public,app as $$
 select exists(select 1 from public.unmatched_archive_device_users u where u.device_serial=p_device and u.pin=p_pin)
 or exists(select 1 from public.unmatched_archive_punches p where p.device_serial=p_device and p.pin=p_pin)
 or exists(select 1 from public.unmatched_unit_independent_people i where i.device_serial=p_device and i.pin=p_pin)
$$;

-- حساب منفصل من نسخ الأرشيف، بلا شفتات وبلا أي تغيير في الحضور الرسمي.
-- الحالات غير المؤكدة لا تُحسم بتخمين: بصمات كثيرة أو تنافس محتمل على بصمة الصباح للمراجعة.
create function public.unmatched_unit_daily_report_v2(
 p_from date,p_to date,p_branch_id uuid default null,p_device text default null,p_search text default null,p_status text default null,
 p_limit integer default 50,p_after_device text default null,p_after_pin text default null,
 p_name text default null,p_pin text default null,p_issues boolean default false
) returns table(device_serial text,pin text,person_name text,device_name text,branch_id uuid,current_pin_linked boolean,days jsonb)
language plpgsql stable security definer set search_path=pg_catalog,public,app as $$
declare q text:=nullif(btrim(p_search),''); dev text:=nullif(btrim(p_device),''); st text:=nullif(btrim(p_status),'');
begin
 if auth.uid() is null or not app.has_role(array['hr_officer','it_admin','super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>62 then raise exception 'BIO_RANGE_INVALID'; end if;
 if (p_after_device is null)<>(p_after_pin is null) then raise exception 'BIO_ARCHIVE_CURSOR_INVALID'; end if;
 if st is not null and st not in ('present','missing','absent','leave','review','previous_exit','pending','future','unknown') then raise exception 'BIO_STATUS_INVALID'; end if;
 return query
 with ids as (
   select u.device_serial,u.pin from public.unmatched_archive_device_users u
   union select p.device_serial,p.pin from public.unmatched_archive_punches p
   union select j.device_serial,j.pin from public.unmatched_unit_independent_people j
 ), persons as (
   select i.device_serial,i.pin,
     coalesce(nullif(ne.display_name,''),nullif(u.latest_name,''),nullif(u.original_user->>'name',''),nullif(ind.original_user->>'name',''),nm.val) person_name,
     coalesce(u.original_device,ind.original_device,di.val) device_info,
     (exists(select 1 from public.employees emp where (emp.biometric_pin=i.pin or emp.employee_number=i.pin) and emp.archived_at is null) and ind.pin is null) current_pin_linked
   from ids i
   left join public.unmatched_archive_device_users u on u.device_serial=i.device_serial and u.pin=i.pin
   left join public.unmatched_unit_independent_people ind on ind.device_serial=i.device_serial and ind.pin=i.pin
   left join public.unmatched_unit_people_edits ne on ne.device_serial=i.device_serial and ne.pin=i.pin
   left join lateral (select p.original_device val from public.unmatched_archive_punches p where p.device_serial=i.device_serial and p.pin=i.pin and p.original_device is not null order by p.punched_at,p.source_punch_id limit 1) di on true
   left join lateral (select nullif(p.original_punch->>'person_name','') val from public.unmatched_archive_punches p where p.device_serial=i.device_serial and p.pin=i.pin and nullif(p.original_punch->>'person_name','') is not null order by p.punched_at desc,p.source_punch_id desc limit 1) nm on true
   where (p_after_device is null or (i.device_serial,i.pin)>(p_after_device,p_after_pin)) and (dev is null or i.device_serial=dev)
 ), filtered as (
   select x.* from persons x where (p_branch_id is null or x.device_info->>'branch_id'=p_branch_id::text)
   and (q is null or x.pin ilike '%'||q||'%' or coalesce(x.person_name,'') ilike '%'||q||'%' or x.device_serial ilike '%'||q||'%' or coalesce(x.device_info->>'name','') ilike '%'||q||'%')
   and (nullif(btrim(p_name),'') is null or coalesce(x.person_name,'') ilike '%'||btrim(p_name)||'%')
   and (nullif(btrim(p_pin),'') is null or x.pin ilike '%'||btrim(p_pin)||'%')
 ), candidates as (
   select f.* from filtered f order by f.device_serial,f.pin
   limit case when st is null and not coalesce(p_issues,false) then greatest(1,least(coalesce(p_limit,50),500)) else null end
 ), punches as (
   select p.device_serial,p.pin,p.punched_at,p.direction,((p.punched_at at time zone 'UTC')+coalesce(p.original_device->>'timezone_offset',x.device_info->>'timezone_offset','+00:00')::interval) local_at
   from public.unmatched_archive_punches p join candidates x on x.device_serial=p.device_serial and x.pin=p.pin
   -- قيود UTC واسعة لحفظ بصمات الأطراف، ثم يرشّح التاريخ المحلي بدقة.
   where p.punched_at >= (p_from::timestamp at time zone 'UTC') - interval '2 days'
     and p.punched_at < (p_to::timestamp at time zone 'UTC') + interval '3 days'
 ), daily as (
   select p.device_serial,p.pin,p.local_at::date d,count(*)::integer n,min(p.local_at) first_at,max(p.local_at) last_at,
     (array_agg(p.punched_at order by p.local_at,p.punched_at))[1] first_instant,
     (array_agg(p.direction order by p.local_at,p.punched_at))[1] first_direction,
     (array_agg(p.direction order by p.local_at desc,p.punched_at desc))[1] last_direction
   from punches p where p.local_at::date between p_from-1 and p_to+1
   group by p.device_serial,p.pin,p.local_at::date
 ), grid as (
   select x.device_serial,x.pin,x.person_name,x.device_info,x.current_pin_linked, g.day::date d,
      coalesce(d.n,0) n,d.first_at,d.last_at,d.first_instant,d.first_direction,d.last_direction,
      prev.n prev_n,prev.first_at prev_first,prev.first_instant prev_instant,prev.first_direction prev_direction,
      nxt.n next_n,nxt.first_at next_first,nxt.first_instant next_instant,nxt.first_direction next_direction,
      ov.status manual_status,ov.entry_time manual_entry,ov.exit_time manual_exit,ov.exit_next_day manual_next,ov.revision manual_revision,
      pov.status prev_manual_status,nov.status next_manual_status,
      ((now() at time zone 'UTC')+coalesce(x.device_info->>'timezone_offset','+00:00')::interval)::date local_today
   from candidates x cross join generate_series(p_from,p_to,interval '1 day') g(day)
   left join daily d on d.device_serial=x.device_serial and d.pin=x.pin and d.d=g.day::date
   left join daily prev on prev.device_serial=x.device_serial and prev.pin=x.pin and prev.d=g.day::date-1
   left join daily nxt on nxt.device_serial=x.device_serial and nxt.pin=x.pin and nxt.d=g.day::date+1
   left join public.unmatched_unit_day_edits ov on ov.device_serial=x.device_serial and ov.pin=x.pin and ov.work_day=g.day::date
   left join public.unmatched_unit_day_edits pov on pov.device_serial=x.device_serial and pov.pin=x.pin and pov.work_day=g.day::date-1
   left join public.unmatched_unit_day_edits nov on nov.device_serial=x.device_serial and nov.pin=x.pin and nov.work_day=g.day::date+1
 ), evaluated as (
   select g.*,
     (g.n=1 and g.first_at::time>=time '12:00' and g.next_n=1 and g.next_first::time<time '12:00' and g.next_instant-g.first_instant>interval '0 seconds' and g.next_instant-g.first_instant<=interval '16 hours' and g.first_direction<>'out' and g.next_direction<>'in' and g.next_manual_status is null) night_pair,
     (g.n=1 and g.first_at::time<time '12:00' and g.prev_n=1 and g.prev_first::time>=time '12:00' and g.first_instant-g.prev_instant>interval '0 seconds' and g.first_instant-g.prev_instant<=interval '16 hours' and g.prev_direction<>'out' and g.first_direction<>'in' and g.prev_manual_status is null) previous_pair,
     ((g.n=1 and g.first_at::time>=time '12:00' and g.next_n>=1 and g.next_first::time<time '12:00' and (g.next_n>1 or g.next_instant-g.first_instant<=interval '0 seconds' or g.next_instant-g.first_instant>interval '16 hours' or g.first_direction='out' or g.next_direction='in' or g.next_manual_status is not null))
      or (g.n>=1 and g.first_at::time<time '12:00' and g.prev_n=1 and g.prev_first::time>=time '12:00' and (g.n>1 or g.first_instant-g.prev_instant<=interval '0 seconds' or g.first_instant-g.prev_instant>interval '16 hours' or g.prev_direction='out' or g.first_direction='in' or g.prev_manual_status is not null))
      or (g.n=2 and (g.first_at=g.last_at or g.first_direction='out' or g.last_direction='in'))) ambiguous
   from grid g
 ), cells as (
   select e.*,
     case when e.manual_status is not null then e.manual_status
       when e.n>2 or coalesce(e.ambiguous,false) then 'review'
       when e.n>=2 or coalesce(e.night_pair,false) then 'present'
       when coalesce(e.previous_pair,false) then 'previous_exit'
       when e.n=1 then 'missing'
       when e.d>e.local_today then 'future'
       when e.d=e.local_today then 'pending'
       when e.current_pin_linked then 'unknown' -- لا نعلم متى رُبط PIN قبل تثبيت الأرشيف؛ لا نختلق غياباً
       else 'absent' end cell_status,
     case when e.manual_status is not null then case when e.manual_entry is null then null else e.d+e.manual_entry end
       when e.n>2 or coalesce(e.ambiguous,false) then null
       when e.n=1 and not coalesce(e.night_pair,false) and not coalesce(e.previous_pair,false) and e.first_direction<>'in' then null
       when e.n>=1 and not coalesce(e.previous_pair,false) then e.first_at else null end cell_entry,
     case when e.manual_status is not null then case when e.manual_exit is null then null else e.d+(case when e.manual_next then 1 else 0 end)+e.manual_exit end
       when e.n>2 or coalesce(e.ambiguous,false) then null
       when coalesce(e.night_pair,false) then e.next_first
       when coalesce(e.previous_pair,false) then e.first_at
       when e.n=1 and e.first_direction='out' then e.first_at
       when e.n>=2 then e.last_at else null end cell_exit
   from evaluated e
 ), assembled as (
   select c.device_serial,c.pin,max(c.person_name) person_name,(array_agg(c.device_info))[1] device_info,bool_or(c.current_pin_linked) current_pin_linked,
   jsonb_agg(jsonb_build_object('date',to_char(c.d,'YYYY-MM-DD'),'status',c.cell_status,'punch_count',c.n,
      'entry',case when c.cell_entry is null then null else to_char(c.cell_entry,'YYYY-MM-DD"T"HH24:MI:SS') end,
      'exit',case when c.cell_exit is null then null else to_char(c.cell_exit,'YYYY-MM-DD"T"HH24:MI:SS') end,
      'raw_first',case when c.first_at is null then null else to_char(c.first_at,'YYYY-MM-DD"T"HH24:MI:SS') end,
      'raw_last',case when c.last_at is null then null else to_char(c.last_at,'YYYY-MM-DD"T"HH24:MI:SS') end,
      'manual_revision',coalesce(c.manual_revision,0),'manual',c.manual_status is not null) order by c.d) day_values
   from cells c group by c.device_serial,c.pin
 )
 select a.device_serial,a.pin,a.person_name,a.device_info->>'name',nullif(a.device_info->>'branch_id','')::uuid,a.current_pin_linked,a.day_values
 from assembled a
 where (st is null or exists(select 1 from jsonb_array_elements(a.day_values) j where j->>'status'=st))
   and (not coalesce(p_issues,false) or exists(select 1 from jsonb_array_elements(a.day_values) j where j->>'status' in ('absent','missing')))
 order by a.device_serial,a.pin limit greatest(1,least(coalesce(p_limit,50),500));
end $$;
revoke all on function public.unmatched_unit_daily_report_v2(date,date,uuid,text,text,text,integer,text,text,text,text,boolean) from public,anon;
grant execute on function public.unmatched_unit_daily_report_v2(date,date,uuid,text,text,text,integer,text,text,text,text,boolean) to authenticated;

-- سجل الشخص مع اسم حساب صاحب التعديل، دون منح وصول مباشر إلى بيانات الحسابات.
create function public.unmatched_unit_history_v2(p_device text,p_pin text,p_limit integer default 100,p_before_id bigint default null)
returns table(id bigint,work_day date,action text,old_value jsonb,new_value jsonb,actor uuid,actor_name text,created_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public,app as $$
begin
 if auth.uid() is null or not app.has_role(array['hr_officer','it_admin','super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
 if not app.unmatched_unit_person_exists(p_device,p_pin) then raise exception 'BIO_ARCHIVE_PERSON_NOT_FOUND'; end if;
 return query select a.id,a.work_day,a.action,a.old_value,a.new_value,a.actor,coalesce(nullif(btrim(e.full_name),''),u.email::text,a.actor::text),a.created_at
 from public.unmatched_unit_audit a left join auth.users u on u.id=a.actor
 left join lateral (select x.full_name from public.employees x where x.user_id=a.actor order by x.id limit 1) e on true
 where a.device_serial=p_device and a.pin=p_pin and (p_before_id is null or a.id<p_before_id) order by a.id desc limit greatest(1,least(coalesce(p_limit,100),500));
end $$;
revoke all on function public.unmatched_unit_history_v2(text,text,integer,bigint) from public,anon;
grant execute on function public.unmatched_unit_history_v2(text,text,integer,bigint) to authenticated;

-- يشمل متصفح الأرشيف من أُكد استقلاله حتى قبل أول بصمة.
create or replace function public.biometric_unmatched_archive_search(
  p_search text default null, p_device_serial text default null, p_branch_id uuid default null,
  p_limit integer default 50, p_after_device text default null, p_after_pin text default null
) returns table (
  device_serial text, pin text, device_person_name text, device_name text, branch_id uuid,
  punch_count bigint, first_punch timestamptz, last_punch timestamptz
) language plpgsql stable security definer set search_path = pg_catalog, public, app as $$
declare q text := nullif(btrim(p_search),''); dev text := nullif(btrim(p_device_serial),'');
begin
  if auth.uid() is null or not app.has_role(array['hr_officer','it_admin','super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
  if (p_after_device is null) <> (p_after_pin is null) then raise exception 'BIO_ARCHIVE_CURSOR_INVALID'; end if;
  return query
  with ids as (
    select u.device_serial,u.pin from public.unmatched_archive_device_users u
    union select p.device_serial,p.pin from public.unmatched_archive_punches p
    union select j.device_serial,j.pin from public.unmatched_unit_independent_people j
  ), enriched as (
    select i.device_serial,i.pin,
      coalesce(nullif(u.latest_name,''),nullif(u.original_user->>'name',''),nullif(ind.original_user->>'name',''),last_name.val) as nm,
      coalesce(u.original_device,ind.original_device,first_device.val) as dev
    from ids i
    left join public.unmatched_archive_device_users u on u.device_serial=i.device_serial and u.pin=i.pin
    left join public.unmatched_unit_independent_people ind on ind.device_serial=i.device_serial and ind.pin=i.pin
    left join lateral (
      select p.original_device val from public.unmatched_archive_punches p
      where p.device_serial=i.device_serial and p.pin=i.pin and p.original_device is not null
      order by p.punched_at,p.source_punch_id limit 1
    ) first_device on true
    left join lateral (
      select nullif(p.original_punch->>'person_name','') val from public.unmatched_archive_punches p
      where p.device_serial=i.device_serial and p.pin=i.pin and nullif(p.original_punch->>'person_name','') is not null
      order by p.punched_at desc,p.source_punch_id desc limit 1
    ) last_name on true
    where (p_after_device is null or (i.device_serial,i.pin)>(p_after_device,p_after_pin))
      and (dev is null or i.device_serial=dev)
  ), page as (
    select e.* from enriched e
    where (p_branch_id is null or e.dev->>'branch_id'=p_branch_id::text)
      and (q is null or e.pin ilike '%'||q||'%' or coalesce(e.nm,'') ilike '%'||q||'%' or e.device_serial ilike '%'||q||'%' or coalesce(e.dev->>'name','') ilike '%'||q||'%')
    order by e.device_serial,e.pin limit greatest(1,least(coalesce(p_limit,50),500))
  )
  select v.device_serial,v.pin,v.nm,v.dev->>'name',nullif(v.dev->>'branch_id','')::uuid,
    s.n,s.first_at,s.last_at
  from page v left join lateral (
    select count(*) n,min(p.punched_at) first_at,max(p.punched_at) last_at
    from public.unmatched_archive_punches p where p.device_serial=v.device_serial and p.pin=v.pin
  ) s on true
  order by v.device_serial,v.pin;
end $$;

-- قائمة الأجهزة للاختيار في التقرير الأول، دون حدود الصفحة.
create function public.unmatched_unit_devices() returns table(device_serial text,device_name text)
language plpgsql stable security definer set search_path=pg_catalog,public,app as $$
begin
 if auth.uid() is null or not app.has_role(array['hr_officer','it_admin','super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
 return query select x.device_serial,coalesce(d.name,x.device_serial) from (
  select u.device_serial from public.unmatched_archive_device_users u
  union select p.device_serial from public.unmatched_archive_punches p
  union select i.device_serial from public.unmatched_unit_independent_people i
 ) x left join public.biometric_devices d on d.serial_number=x.device_serial order by x.device_serial;
end $$;
revoke all on function public.unmatched_unit_devices() from public,anon;
grant execute on function public.unmatched_unit_devices() to authenticated;
