-- 00403-ج: قراءة الأرشيف بفلاتر خادمية وتصفح مستقر؛ لا تعديل على الربط أو الحضور.
create function public.biometric_unmatched_archive_search(
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
  ), enriched as (
    select i.device_serial,i.pin,
      coalesce(nullif(u.latest_name,''),nullif(u.original_user->>'name',''),last_name.val) as nm,
      coalesce(u.original_device,first_device.val) as dev
    from ids i
    left join public.unmatched_archive_device_users u on u.device_serial=i.device_serial and u.pin=i.pin
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

-- يرشّح التاريخ على توقيت الجهاز المحفوظ مع كل بصمة؛ عند فقده يُستخدم UTC صراحةً في الواجهة.
create function public.biometric_unmatched_archive_punches_range(
  p_device_serial text, p_pin text, p_from date default null, p_to date default null,
  p_limit integer default 50, p_after_at timestamptz default null, p_after_id uuid default null
) returns table (source_punch_id uuid,punched_at timestamptz,original_punch jsonb,original_device jsonb)
language plpgsql stable security definer set search_path = pg_catalog, public, app as $$
begin
  if auth.uid() is null or not app.has_role(array['hr_officer','it_admin','super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
  if nullif(btrim(p_device_serial),'') is null or nullif(btrim(p_pin),'') is null then raise exception 'BIO_ARCHIVE_PERSON_REQUIRED'; end if;
  if (p_after_at is null) <> (p_after_id is null) then raise exception 'BIO_ARCHIVE_CURSOR_INVALID'; end if;
  if p_from is not null and p_to is not null and p_from > p_to then raise exception 'BIO_RANGE_INVALID'; end if;
  return query select p.source_punch_id,p.punched_at,p.original_punch,p.original_device
  from public.unmatched_archive_punches p
  where p.device_serial=p_device_serial and p.pin=p_pin
    and (p_after_at is null or (p.punched_at,p.source_punch_id)>(p_after_at,p_after_id))
    and (p_from is null or ((p.punched_at at time zone 'UTC') + coalesce(p.original_device->>'timezone_offset','+00:00')::interval)::date>=p_from)
    and (p_to is null or ((p.punched_at at time zone 'UTC') + coalesce(p.original_device->>'timezone_offset','+00:00')::interval)::date<=p_to)
  order by p.punched_at,p.source_punch_id limit greatest(1,least(coalesce(p_limit,50),500));
end $$;
revoke all on function public.biometric_unmatched_archive_search(text,text,uuid,integer,text,text), public.biometric_unmatched_archive_punches_range(text,text,date,date,integer,timestamptz,uuid) from public,anon;
grant execute on function public.biometric_unmatched_archive_search(text,text,uuid,integer,text,text), public.biometric_unmatched_archive_punches_range(text,text,date,date,integer,timestamptz,uuid) to authenticated;
