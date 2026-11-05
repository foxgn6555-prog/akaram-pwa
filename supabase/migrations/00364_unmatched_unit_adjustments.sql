-- وحدة غير المطابقين: تعديلات منفصلة وسجل وصلاحيات لكل حساب، بلا كتابة في الحضور الرسمي.
create table public.unmatched_unit_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  can_edit boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create table public.unmatched_unit_people_edits (
  device_serial text not null,
  pin text not null,
  display_name text not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key(device_serial,pin)
);
create table public.unmatched_unit_day_edits (
  device_serial text not null,
  pin text not null,
  work_day date not null,
  status text not null check(status in ('present','missing','absent','leave','review')),
  entry_time time,
  exit_time time,
  exit_next_day boolean not null default false,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key(device_serial,pin,work_day)
);
create table public.unmatched_unit_audit (
  id bigint generated always as identity primary key,
  device_serial text,
  pin text,
  work_day date,
  action text not null check(action in ('name','day','permission')),
  target_user uuid,
  old_value jsonb,
  new_value jsonb not null,
  actor uuid not null,
  created_at timestamptz not null default now()
);
create index unmatched_unit_audit_person_idx on public.unmatched_unit_audit(device_serial,pin,id desc);
alter table public.unmatched_unit_permissions enable row level security;
alter table public.unmatched_unit_people_edits enable row level security;
alter table public.unmatched_unit_day_edits enable row level security;
alter table public.unmatched_unit_audit enable row level security;
revoke all on public.unmatched_unit_permissions,public.unmatched_unit_people_edits,public.unmatched_unit_day_edits,public.unmatched_unit_audit from public,anon,authenticated;

create function app.unmatched_unit_can_edit() returns boolean
language sql stable security definer set search_path=pg_catalog,public,app as $$
 select auth.uid() is not null and (app.has_role(array['it_admin','super_admin']) or
   (app.has_role(array['hr_officer']) and exists(select 1 from public.unmatched_unit_permissions p where p.user_id=auth.uid() and p.can_edit)))
$$;
revoke all on function app.unmatched_unit_can_edit() from public,anon,authenticated,service_role;

create function public.unmatched_unit_my_access() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,app as $$
begin
 if auth.uid() is null or not app.has_role(array['hr_officer','it_admin','super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
 return jsonb_build_object('can_edit',app.unmatched_unit_can_edit(),'can_manage',app.has_role(array['it_admin','super_admin']));
end $$;

create function public.unmatched_unit_hr_permissions() returns table(user_id uuid,display_name text,email text,can_edit boolean)
language plpgsql stable security definer set search_path=pg_catalog,public,app as $$
begin
 if auth.uid() is null or not app.has_role(array['it_admin','super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
 return query select ur.user_id,coalesce(nullif(btrim(e.full_name),''),u.email::text,ur.user_id::text),u.email::text,coalesce(p.can_edit,false)
 from public.user_roles ur join auth.users u on u.id=ur.user_id
 left join lateral (select emp.full_name from public.employees emp where emp.user_id=ur.user_id order by emp.id limit 1) e on true
 left join public.unmatched_unit_permissions p on p.user_id=ur.user_id
 where ur.role='hr_officer' order by 2,ur.user_id;
end $$;

create function public.unmatched_unit_set_hr_permission(p_user uuid,p_can_edit boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public,app as $$
declare oldp boolean;
begin
 if auth.uid() is null or not app.has_role(array['it_admin','super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'BIO_EDIT_ISOLATION'; end if;
 if p_user is null or p_can_edit is null or not exists(select 1 from public.user_roles ur where ur.user_id=p_user and ur.role='hr_officer') then raise exception 'BIO_HR_ACCOUNT_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('unmatched-acl:'||p_user::text,0));
 select p.can_edit into oldp from public.unmatched_unit_permissions p where p.user_id=p_user;
 if coalesce(oldp,false)=p_can_edit then return; end if;
 insert into public.unmatched_unit_permissions(user_id,can_edit,updated_by) values(p_user,p_can_edit,auth.uid())
 on conflict(user_id) do update set can_edit=excluded.can_edit,updated_by=excluded.updated_by,updated_at=now();
 insert into public.unmatched_unit_audit(action,target_user,old_value,new_value,actor)
 values('permission',p_user,jsonb_build_object('can_edit',coalesce(oldp,false)),jsonb_build_object('can_edit',p_can_edit),auth.uid());
end $$;

create function app.unmatched_unit_person_exists(p_device text,p_pin text) returns boolean
language sql stable security definer set search_path=pg_catalog,public,app as $$
 select exists(select 1 from public.unmatched_archive_device_users u where u.device_serial=p_device and u.pin=p_pin)
     or exists(select 1 from public.unmatched_archive_punches p where p.device_serial=p_device and p.pin=p_pin)
$$;
revoke all on function app.unmatched_unit_person_exists(text,text) from public,anon,authenticated,service_role;

-- القفل على حساب HR يجعل سحب الصلاحية والتعديل المتزامن يتسلسلان؛ القفل على الشخص يمنع ضياع التعديلات.
create function app.unmatched_unit_edit_guard(p_device text,p_pin text) returns void
language plpgsql security definer set search_path=pg_catalog,public,app as $$
begin
 if auth.uid() is null then raise exception 'BIO_FORBIDDEN'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'BIO_EDIT_ISOLATION'; end if;
 perform pg_advisory_xact_lock(hashtextextended('unmatched-acl:'||auth.uid()::text,0));
 if not app.unmatched_unit_can_edit() then raise exception 'BIO_FORBIDDEN'; end if;
 if nullif(btrim(p_device),'') is null or nullif(btrim(p_pin),'') is null then raise exception 'BIO_ARCHIVE_PERSON_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('unmatched-person:'||length(p_device)::text||':'||p_device||p_pin,0));
 if not app.unmatched_unit_person_exists(p_device,p_pin) then raise exception 'BIO_ARCHIVE_PERSON_NOT_FOUND'; end if;
end $$;
revoke all on function app.unmatched_unit_edit_guard(text,text) from public,anon,authenticated,service_role;

create function public.unmatched_unit_person_edit(p_device text,p_pin text,p_name text,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,app as $$
declare oldrow public.unmatched_unit_people_edits%rowtype; newrow public.unmatched_unit_people_edits%rowtype; nm text:=nullif(btrim(p_name),'');
begin
 perform app.unmatched_unit_edit_guard(p_device,p_pin);
 if nm is null or length(nm)>200 or p_expected_revision is null then raise exception 'BIO_EDIT_INVALID'; end if;
 select * into oldrow from public.unmatched_unit_people_edits p where p.device_serial=p_device and p.pin=p_pin;
 if coalesce(oldrow.revision,0)<>p_expected_revision then raise exception 'BIO_EDIT_CONFLICT'; end if;
 insert into public.unmatched_unit_people_edits(device_serial,pin,display_name,revision,updated_by) values(p_device,p_pin,nm,1,auth.uid())
 on conflict(device_serial,pin) do update set display_name=excluded.display_name,revision=public.unmatched_unit_people_edits.revision+1,updated_at=now(),updated_by=auth.uid() returning * into newrow;
 insert into public.unmatched_unit_audit(device_serial,pin,action,old_value,new_value,actor)
 values(p_device,p_pin,'name',case when oldrow.revision is null then null else to_jsonb(oldrow) end,to_jsonb(newrow),auth.uid());
 return to_jsonb(newrow);
end $$;

create function public.unmatched_unit_day_edit(p_device text,p_pin text,p_day date,p_status text,p_entry time,p_exit time,p_exit_next_day boolean,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,app as $$
declare oldrow public.unmatched_unit_day_edits%rowtype; newrow public.unmatched_unit_day_edits%rowtype; tz text; today date;
begin
 perform app.unmatched_unit_edit_guard(p_device,p_pin);
 if p_day is null or p_status is null or p_status not in ('present','missing','absent','leave','review') or p_expected_revision is null or p_exit_next_day is null then raise exception 'BIO_EDIT_INVALID'; end if;
 if p_entry>=time '24:00' or p_exit>=time '24:00' then raise exception 'BIO_EDIT_TIMES_INVALID'; end if;
 if p_status='present' and (p_entry is null or p_exit is null) then raise exception 'BIO_EDIT_TIMES_REQUIRED'; end if;
 if p_status in ('absent','leave') and (p_entry is not null or p_exit is not null or p_exit_next_day) then raise exception 'BIO_EDIT_TIMES_INVALID'; end if;
 if p_exit_next_day and (p_entry is null or p_exit is null) then raise exception 'BIO_EDIT_TIMES_INVALID'; end if;
 if p_entry is not null and p_exit is not null and not p_exit_next_day and p_exit<p_entry then raise exception 'BIO_EDIT_TIMES_INVALID'; end if;
 if p_entry is not null and p_exit is not null and p_exit_next_day and ((p_day+1+p_exit)-(p_day+p_entry))>interval '16 hours' and p_status<>'review' then raise exception 'BIO_EDIT_NEEDS_REVIEW'; end if;
 select coalesce((select u.original_device->>'timezone_offset' from public.unmatched_archive_device_users u where u.device_serial=p_device and u.pin=p_pin),
  (select p.original_device->>'timezone_offset' from public.unmatched_archive_punches p where p.device_serial=p_device and p.pin=p_pin order by p.punched_at,p.source_punch_id limit 1),'+00:00') into tz;
 today:=((now() at time zone 'UTC')+tz::interval)::date;
 if p_status='absent' and p_day>=today then raise exception 'BIO_ABSENCE_NOT_PAST'; end if;
 select * into oldrow from public.unmatched_unit_day_edits p where p.device_serial=p_device and p.pin=p_pin and p.work_day=p_day;
 if coalesce(oldrow.revision,0)<>p_expected_revision then raise exception 'BIO_EDIT_CONFLICT'; end if;
 insert into public.unmatched_unit_day_edits(device_serial,pin,work_day,status,entry_time,exit_time,exit_next_day,revision,updated_by)
 values(p_device,p_pin,p_day,p_status,p_entry,p_exit,p_exit_next_day,1,auth.uid())
 on conflict(device_serial,pin,work_day) do update set status=excluded.status,entry_time=excluded.entry_time,exit_time=excluded.exit_time,
 exit_next_day=excluded.exit_next_day,revision=public.unmatched_unit_day_edits.revision+1,updated_at=now(),updated_by=auth.uid() returning * into newrow;
 insert into public.unmatched_unit_audit(device_serial,pin,work_day,action,old_value,new_value,actor)
 values(p_device,p_pin,p_day,'day',case when oldrow.revision is null then null else to_jsonb(oldrow) end,to_jsonb(newrow),auth.uid());
 return to_jsonb(newrow);
end $$;

create function public.unmatched_unit_edits(p_device text,p_pin text,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,app as $$
begin
 if auth.uid() is null or not app.has_role(array['hr_officer','it_admin','super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
 if not app.unmatched_unit_person_exists(p_device,p_pin) then raise exception 'BIO_ARCHIVE_PERSON_NOT_FOUND'; end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>62 then raise exception 'BIO_RANGE_INVALID'; end if;
 return jsonb_build_object('person',(select to_jsonb(p) from public.unmatched_unit_people_edits p where p.device_serial=p_device and p.pin=p_pin),
 'days',coalesce((select jsonb_agg(to_jsonb(d) order by d.work_day) from public.unmatched_unit_day_edits d where d.device_serial=p_device and d.pin=p_pin and d.work_day between p_from and p_to),'[]'::jsonb));
end $$;
create function public.unmatched_unit_history(p_device text,p_pin text,p_limit integer default 100,p_before_id bigint default null) returns table(id bigint,work_day date,action text,old_value jsonb,new_value jsonb,actor uuid,created_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public,app as $$
begin
 if auth.uid() is null or not app.has_role(array['hr_officer','it_admin','super_admin']) then raise exception 'BIO_FORBIDDEN'; end if;
 if not app.unmatched_unit_person_exists(p_device,p_pin) then raise exception 'BIO_ARCHIVE_PERSON_NOT_FOUND'; end if;
 return query select a.id,a.work_day,a.action,a.old_value,a.new_value,a.actor,a.created_at from public.unmatched_unit_audit a
 where a.device_serial=p_device and a.pin=p_pin and (p_before_id is null or a.id<p_before_id) order by a.id desc limit greatest(1,least(coalesce(p_limit,100),500));
end $$;
revoke all on function public.unmatched_unit_my_access(),public.unmatched_unit_hr_permissions(),public.unmatched_unit_set_hr_permission(uuid,boolean),public.unmatched_unit_person_edit(text,text,text,integer),public.unmatched_unit_day_edit(text,text,date,text,time,time,boolean,integer),public.unmatched_unit_edits(text,text,date,date),public.unmatched_unit_history(text,text,integer,bigint) from public,anon;
grant execute on function public.unmatched_unit_my_access(),public.unmatched_unit_hr_permissions(),public.unmatched_unit_set_hr_permission(uuid,boolean),public.unmatched_unit_person_edit(text,text,text,integer),public.unmatched_unit_day_edit(text,text,date,text,time,time,boolean,integer),public.unmatched_unit_edits(text,text,date,date),public.unmatched_unit_history(text,text,integer,bigint) to authenticated;
