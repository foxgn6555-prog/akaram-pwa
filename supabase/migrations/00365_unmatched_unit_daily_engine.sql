-- حساب منفصل من نسخ الأرشيف، بلا شفتات وبلا أي تغيير في الحضور الرسمي.
-- الحالات غير المؤكدة لا تُحسم بتخمين: بصمات كثيرة أو تنافس محتمل على بصمة الصباح للمراجعة.
create function public.unmatched_unit_daily_report(
 p_from date,p_to date,p_branch_id uuid default null,p_device text default null,p_search text default null,p_status text default null,
 p_limit integer default 50,p_after_device text default null,p_after_pin text default null
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
 ), persons as (
   select i.device_serial,i.pin,
     coalesce(nullif(ne.display_name,''),nullif(u.latest_name,''),nullif(u.original_user->>'name',''),nm.val) person_name,
     coalesce(u.original_device,di.val) device_info,
     exists(select 1 from public.employees emp where emp.biometric_pin=i.pin and emp.archived_at is null) current_pin_linked
   from ids i
   left join public.unmatched_archive_device_users u on u.device_serial=i.device_serial and u.pin=i.pin
   left join public.unmatched_unit_people_edits ne on ne.device_serial=i.device_serial and ne.pin=i.pin
   left join lateral (select p.original_device val from public.unmatched_archive_punches p where p.device_serial=i.device_serial and p.pin=i.pin and p.original_device is not null order by p.punched_at,p.source_punch_id limit 1) di on true
   left join lateral (select nullif(p.original_punch->>'person_name','') val from public.unmatched_archive_punches p where p.device_serial=i.device_serial and p.pin=i.pin and nullif(p.original_punch->>'person_name','') is not null order by p.punched_at desc,p.source_punch_id desc limit 1) nm on true
   where (p_after_device is null or (i.device_serial,i.pin)>(p_after_device,p_after_pin)) and (dev is null or i.device_serial=dev)
 ), filtered as (
   select x.* from persons x where (p_branch_id is null or x.device_info->>'branch_id'=p_branch_id::text)
   and (q is null or x.pin ilike '%'||q||'%' or coalesce(x.person_name,'') ilike '%'||q||'%' or x.device_serial ilike '%'||q||'%' or coalesce(x.device_info->>'name','') ilike '%'||q||'%')
 ), candidates as (
   select f.* from filtered f order by f.device_serial,f.pin
   limit case when st is null then greatest(1,least(coalesce(p_limit,50),500)) else null end
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
 where st is null or exists(select 1 from jsonb_array_elements(a.day_values) j where j->>'status'=st)
 order by a.device_serial,a.pin limit greatest(1,least(coalesce(p_limit,50),500));
end $$;
revoke all on function public.unmatched_unit_daily_report(date,date,uuid,text,text,text,integer,text,text) from public,anon;
grant execute on function public.unmatched_unit_daily_report(date,date,uuid,text,text,text,integer,text,text) to authenticated;
