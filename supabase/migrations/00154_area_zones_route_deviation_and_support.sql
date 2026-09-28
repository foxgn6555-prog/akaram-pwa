-- 00154 · زون المنطقة + تنبيه «خرجت من مسارها» + طلبات الدعم بين مسؤولي الأقسام
-- القرارات المعتمدة:
--   (أ) كل زون على الخريطة يمكن ربطه بمنطقة تشغيلية (1..8). الآلية تُراقَب تلقائياً ضد زونات منطقتها الفعلية
--       (منطقة الانطلاقة، أو منطقة المسؤول المستفيد إن كانت في مهمة دعم) — بلا إسناد يدوي لكل آلية.
--   (ب) التنبيه يُطلق فقط وهي «تعمل في الموقع» (at_site/breakdown)، لا أثناء الطريق أو المحطة أو الصيانة أو الكراج.
--   (ج) مهلة تسامح قابلة للضبط من غرفة العمليات (افتراضي 3 دقائق متواصلة خارج الزون).
--   (د) طلب الدعم: مسؤول يختار مسؤولاً آخر ويطلب آليات لمنطقة من مناطقه؛ المستهدف يقبل (يحدد الآليات) أو يرفض بسبب؛
--       الطرفان يُنهيان الدعم (المستفيد «إنهاء» / المالك «استرجاع»)؛ غرفة العمليات للعلم + إلغاء بسبب + تقرير.

-- ═══════════════════════════ (1) ربط الزون بالمنطقة ═══════════════════════════
alter table public.gps_geofences add column if not exists sector_id smallint references public.sectors(id) on delete set null;
create index if not exists gps_geofences_sector_idx on public.gps_geofences(sector_id) where sector_id is not null and is_active;
comment on column public.gps_geofences.sector_id is 'المنطقة التشغيلية التي يمثلها هذا الزون (اتحاد كل زونات المنطقة = حدودها)';

drop function if exists public.gps_platform_geofence_save(uuid,text,jsonb,text);
create function public.gps_platform_geofence_save(p_id uuid,p_name text,p_polygon jsonb,p_color text default '#06b6d4',p_sector_id smallint default null)returns uuid
language plpgsql security definer set search_path=public,app as $$declare u uuid:=app.require_gps_operator();gid uuid;pt jsonb;lat float8;lng float8;begin
 if length(trim(coalesce(p_name,'')))not between 2 and 160 then raise exception'GPS_ZONE_NAME_INVALID';end if;
 if jsonb_typeof(p_polygon)<>'array'or jsonb_array_length(p_polygon)<3 or jsonb_array_length(p_polygon)>500 then raise exception'GPS_ZONE_POLYGON_INVALID';end if;
 if coalesce(p_color,'')!~'^#[0-9a-fA-F]{6}$'then raise exception'GPS_ZONE_COLOR_INVALID';end if;
 if p_sector_id is not null and not exists(select 1 from public.sectors s where s.id=p_sector_id)then raise exception'GPS_ZONE_SECTOR_INVALID';end if;
 for pt in select value from jsonb_array_elements(p_polygon)loop begin lat:=coalesce((pt->>'lat')::float8,(pt->>0)::float8);lng:=coalesce((pt->>'lng')::float8,(pt->>1)::float8);exception when others then raise exception'GPS_ZONE_POINT_INVALID';end;if lat not between -90 and 90 or lng not between -180 and 180 then raise exception'GPS_ZONE_POINT_INVALID';end if;end loop;
 if p_id is null then insert into public.gps_geofences(name,source,polygon,color,sector_id,raw_data)values(trim(p_name),'platform',p_polygon,p_color,p_sector_id,jsonb_build_object('created_by',u))returning id into gid;
 else update public.gps_geofences set name=trim(p_name),polygon=p_polygon,color=p_color,sector_id=p_sector_id,is_active=true,updated_at=now(),raw_data=raw_data||jsonb_build_object('updated_by',u)where id=p_id and source='platform' returning id into gid;if gid is null then raise exception'GPS_PLATFORM_ZONE_NOT_FOUND';end if;end if;
 return gid;
end$$;

-- ربط/فك ربط أي زون نشط (منصة أو LVN) بمنطقة
create or replace function public.gps_geofence_set_sector(p_id uuid,p_sector_id smallint)returns void
language plpgsql security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 if p_sector_id is not null and not exists(select 1 from public.sectors s where s.id=p_sector_id)then raise exception'GPS_ZONE_SECTOR_INVALID';end if;
 update public.gps_geofences set sector_id=p_sector_id,updated_at=now()where id=p_id and is_active;
 if not found then raise exception'GPS_PLATFORM_ZONE_NOT_FOUND';end if;
end$$;

drop function if exists public.gps_lvn_map_geofences();
create function public.gps_lvn_map_geofences()
returns table(id uuid,name text,source text,color text,polygon jsonb,sector_id smallint,area_name text,parent_sector text)
language plpgsql stable security definer set search_path=public,app as $$begin
 if auth.uid()is null or not app.has_role(array['ops_room','it_admin','super_admin'])then raise exception'GPS_FORBIDDEN';end if;
 return query select g.id,g.name,g.source,g.color,g.polygon,g.sector_id,s.name,s.parent_sector from public.gps_geofences g left join public.sectors s on s.id=g.sector_id where g.is_active order by g.name;
end$$;

-- ═══════════════════════════ (2) إعدادات تنبيه الخروج عن المسار ═══════════════════════════
create table if not exists public.gps_route_deviation_settings(
 id boolean primary key default true check(id),
 grace_minutes integer not null default 3 check(grace_minutes between 0 and 120),
 updated_by uuid references auth.users(id)on delete set null,
 updated_at timestamptz not null default now()
);
insert into public.gps_route_deviation_settings(id)values(true)on conflict do nothing;
alter table public.gps_route_deviation_settings enable row level security;
revoke all on table public.gps_route_deviation_settings from anon,authenticated;

create or replace function public.gps_route_deviation_settings_get()returns table(grace_minutes integer,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 return query select s.grace_minutes,s.updated_at from public.gps_route_deviation_settings s where s.id;
end$$;
create or replace function public.gps_route_deviation_settings_save(p_grace_minutes integer)returns void
language plpgsql security definer set search_path=public,app as $$declare u uuid:=app.require_gps_operator();begin
 if p_grace_minutes is null or p_grace_minutes not between 0 and 120 then raise exception'GPS_ROUTE_GRACE_INVALID';end if;
 update public.gps_route_deviation_settings set grace_minutes=p_grace_minutes,updated_by=u,updated_at=now()where id;
end$$;

-- ═══════════════════════════ (3) طلبات الدعم بين المسؤولين ═══════════════════════════
create table if not exists public.sector_support_requests(
 id uuid primary key default gen_random_uuid(),
 requester_user_id uuid not null references auth.users(id)on delete cascade,
 requester_name text not null,
 requester_sector_id smallint not null references public.sectors(id),
 target_user_id uuid not null references auth.users(id)on delete cascade,
 target_name text not null,
 needed_count integer not null check(needed_count between 1 and 20),
 reason text not null check(length(trim(reason))between 3 and 500),
 status text not null default 'pending' check(status in('pending','accepted','rejected','cancelled','completed')),
 decided_at timestamptz,
 decision_note text check(decision_note is null or length(trim(decision_note))between 3 and 500),
 cancelled_by uuid references auth.users(id)on delete set null,
 cancel_reason text check(cancel_reason is null or length(trim(cancel_reason))between 3 and 500),
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 check(requester_user_id<>target_user_id)
);
create index if not exists sector_support_requests_target_idx on public.sector_support_requests(target_user_id,status,created_at desc);
create index if not exists sector_support_requests_requester_idx on public.sector_support_requests(requester_user_id,status,created_at desc);
create index if not exists sector_support_requests_created_idx on public.sector_support_requests(created_at desc);

create table if not exists public.sector_support_assignments(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.sector_support_requests(id)on delete cascade,
 departure_id uuid not null references public.garage_departures(id)on delete cascade,
 vehicle_id uuid not null references public.garage_vehicles(id)on delete cascade,
 from_manager_id uuid not null references auth.users(id)on delete cascade,
 from_sector_id smallint not null references public.sectors(id),
 to_manager_id uuid not null references auth.users(id)on delete cascade,
 to_sector_id smallint not null references public.sectors(id),
 started_at timestamptz not null default now(),
 ended_at timestamptz,
 ended_by uuid references auth.users(id)on delete set null,
 end_kind text check(end_kind is null or end_kind in('released','recalled','returned','cancelled')),
 end_note text check(end_note is null or length(trim(end_note))<=500),
 check((ended_at is null)=(end_kind is null))
);
create unique index if not exists sector_support_one_open_per_departure on public.sector_support_assignments(departure_id)where ended_at is null;
create index if not exists sector_support_assignments_request_idx on public.sector_support_assignments(request_id);
alter table public.sector_support_requests enable row level security;
alter table public.sector_support_assignments enable row level security;
revoke all on table public.sector_support_requests,public.sector_support_assignments from anon,authenticated;

-- المنطقة الفعلية للانطلاقة: منطقة الدعم المفتوحة إن وُجدت وإلا منطقة الانطلاقة
create or replace function app.departure_effective_sector(p_departure_id uuid)returns smallint
language sql stable security definer set search_path=public,app as $$
 select coalesce((select a.to_sector_id from public.sector_support_assignments a where a.departure_id=p_departure_id and a.ended_at is null limit 1),
                 (select d.sector_id from public.garage_departures d where d.id=p_departure_id));
$$;
revoke all on function app.departure_effective_sector(uuid)from public,anon;

create or replace function app.manager_display_name(p_user uuid)returns text
language sql stable security definer set search_path=public,app as $$
 select coalesce(nullif((select e.full_name from public.employees e where e.user_id=p_user limit 1),''),(select u.email from auth.users u where u.id=p_user),p_user::text);
$$;
revoke all on function app.manager_display_name(uuid)from public,anon;

create or replace function app.require_sector_manager()returns uuid
language plpgsql stable security definer set search_path=public,app as $$declare u uuid:=auth.uid();begin
 if u is null or not app.has_role(array['department_manager'])then raise exception'SECTOR_MANAGER_FORBIDDEN';end if;return u;end$$;
revoke all on function app.require_sector_manager()from public,anon;

-- إشعار مجموعة مستخدمين
create or replace function app.support_notify(p_users uuid[],p_title text,p_body text,p_type text,p_link text,p_request_id uuid,p_key text)returns void
language plpgsql security definer set search_path=public,app as $$begin
 insert into public.notifications(user_id,title,body,type,link,category,priority,entity_type,entity_id,action_label,dedupe_key)
 select distinct t.x,p_title,p_body,p_type,p_link,'departure',case when p_type='error'then'high'else'normal'end,'support_request',p_request_id,'فتح طلبات الدعم',p_key||':'||p_request_id::text
 from unnest(p_users)as t(x) where t.x is not null
 on conflict(user_id,dedupe_key)where dedupe_key is not null do nothing;
end$$;
revoke all on function app.support_notify(uuid[],text,text,text,text,uuid,text)from public,anon,authenticated;

create or replace function app.ops_room_users()returns uuid[]
language sql stable security definer set search_path=public,app as $$select coalesce(array_agg(distinct ur.user_id),'{}')from public.user_roles ur where ur.role='ops_room'$$;
revoke all on function app.ops_room_users()from public,anon;

-- المسؤولون الآخرون الذين يمكن طلب الدعم منهم
create or replace function public.sector_support_managers()
returns table(user_id uuid,manager_name text,shift text,sectors smallint[],area_names text[],parent_sectors text[],active_vehicles integer)
language plpgsql stable security definer set search_path=public,app as $$declare u uuid:=app.require_sector_manager();begin
 return query select mp.user_id,app.manager_display_name(mp.user_id),mp.shift,mp.sectors,
  (select array_agg(s.name order by s.id)from public.sectors s where s.id=any(mp.sectors)),
  (select array_agg(distinct s.parent_sector)from public.sectors s where s.id=any(mp.sectors)),
  (select count(*)::integer from public.garage_departures d where d.recipient_manager_id=mp.user_id and d.returned_at is null)
 from public.manager_profiles mp
 where mp.user_id<>u and exists(select 1 from public.user_roles ur where ur.user_id=mp.user_id and ur.role='department_manager')
 order by mp.shift,mp.sectors;
end$$;

create or replace function public.sector_support_request_create(p_target_user_id uuid,p_sector_id smallint,p_needed_count integer,p_reason text)
returns public.sector_support_requests language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_sector_manager();r public.sector_support_requests;area text;
begin
 if p_target_user_id is null or p_target_user_id=u then raise exception'SUPPORT_TARGET_INVALID';end if;
 if not exists(select 1 from public.manager_profiles mp join public.user_roles ur on ur.user_id=mp.user_id and ur.role='department_manager' where mp.user_id=p_target_user_id)then raise exception'SUPPORT_TARGET_INVALID';end if;
 if p_sector_id is null or not exists(select 1 from public.manager_profiles mp where mp.user_id=u and p_sector_id=any(mp.sectors))then raise exception'SUPPORT_SECTOR_NOT_MINE';end if;
 if p_needed_count is null or p_needed_count not between 1 and 20 then raise exception'SUPPORT_COUNT_INVALID';end if;
 if length(trim(coalesce(p_reason,'')))not between 3 and 500 then raise exception'SUPPORT_REASON_INVALID';end if;
 if exists(select 1 from public.sector_support_requests q where q.requester_user_id=u and q.target_user_id=p_target_user_id and q.requester_sector_id=p_sector_id and q.status='pending')then raise exception'SUPPORT_REQUEST_DUPLICATE';end if;
 insert into public.sector_support_requests(requester_user_id,requester_name,requester_sector_id,target_user_id,target_name,needed_count,reason)
 values(u,app.manager_display_name(u),p_sector_id,p_target_user_id,app.manager_display_name(p_target_user_id),p_needed_count,trim(p_reason))returning * into r;
 select s.name into area from public.sectors s where s.id=p_sector_id;
 perform app.support_notify(array[p_target_user_id],'طلب دعم بآليات',format('%s — منطقة %s تحتاج إلى دعم: %s آلية · %s',r.requester_name,area,p_needed_count,r.reason),'warning','/manager/support',r.id,'support:new');
 perform app.support_notify(app.ops_room_users(),'طلب دعم بين المسؤولين',format('%s (منطقة %s) طلب %s آلية من %s',r.requester_name,area,p_needed_count,r.target_name),'info','/ops-room/operations-data',r.id,'support:new:ops');
 return r;
end$$;

create or replace function public.sector_support_request_reject(p_request_id uuid,p_note text)
returns public.sector_support_requests language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_sector_manager();r public.sector_support_requests;
begin
 if length(trim(coalesce(p_note,'')))not between 3 and 500 then raise exception'SUPPORT_REASON_INVALID';end if;
 select * into r from public.sector_support_requests where id=p_request_id for update;
 if not found or r.target_user_id<>u then raise exception'SUPPORT_REQUEST_FORBIDDEN';end if;
 if r.status<>'pending' then raise exception'SUPPORT_REQUEST_NOT_PENDING';end if;
 update public.sector_support_requests set status='rejected',decided_at=now(),decision_note=trim(p_note)where id=r.id returning * into r;
 perform app.support_notify(array[r.requester_user_id],'تعذّر توفير الدعم',format('%s اعتذر عن طلب الدعم: %s',r.target_name,r.decision_note),'error','/manager/support',r.id,'support:rejected');
 perform app.support_notify(app.ops_room_users(),'رفض طلب دعم',format('%s رفض طلب %s: %s',r.target_name,r.requester_name,r.decision_note),'info','/ops-room/operations-data',r.id,'support:rejected:ops');
 return r;
end$$;

-- القبول: المستهدف يحدد آلياته (يجب أن تكون تحت استلامه وتعمل في الموقع وغير مُعارة)
create or replace function public.sector_support_request_accept(p_request_id uuid,p_departure_ids uuid[],p_note text default null)
returns public.sector_support_requests language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_sector_manager();r public.sector_support_requests;d public.garage_departures;did uuid;st text;n integer:=0;names text:='';area text;
begin
 if p_departure_ids is null or cardinality(p_departure_ids)=0 then raise exception'SUPPORT_VEHICLES_REQUIRED';end if;
 if p_note is not null and length(trim(p_note))>500 then raise exception'SUPPORT_REASON_INVALID';end if;
 select * into r from public.sector_support_requests where id=p_request_id for update;
 if not found or r.target_user_id<>u then raise exception'SUPPORT_REQUEST_FORBIDDEN';end if;
 if r.status<>'pending' then raise exception'SUPPORT_REQUEST_NOT_PENDING';end if;
 if cardinality(p_departure_ids)>r.needed_count then raise exception'SUPPORT_TOO_MANY_VEHICLES';end if;
 foreach did in array p_departure_ids loop
  select * into d from public.garage_departures where id=did and returned_at is null for update;
  if not found or d.recipient_manager_id is distinct from u then raise exception'SUPPORT_VEHICLE_NOT_MINE';end if;
  st:=app.trip_status(d.id);
  if st not in('at_site')then raise exception'SUPPORT_VEHICLE_NOT_AT_SITE';end if;
  if exists(select 1 from public.sector_support_assignments a where a.departure_id=d.id and a.ended_at is null)then raise exception'SUPPORT_VEHICLE_ALREADY_LENT';end if;
  insert into public.sector_support_assignments(request_id,departure_id,vehicle_id,from_manager_id,from_sector_id,to_manager_id,to_sector_id)
  values(r.id,d.id,d.vehicle_id,u,d.sector_id,r.requester_user_id,r.requester_sector_id);
  n:=n+1;names:=names||case when n>1 then'، 'else''end||(select v.vehicle_name||' · DB '||v.db_number from public.garage_vehicles v where v.id=d.vehicle_id);
 end loop;
 update public.sector_support_requests set status='accepted',decided_at=now(),decision_note=nullif(trim(coalesce(p_note,'')),'')where id=r.id returning * into r;
 select s.name into area from public.sectors s where s.id=r.requester_sector_id;
 perform app.support_notify(array[r.requester_user_id],'تمت الموافقة على طلب الدعم',format('%s أرسل %s آلية إلى منطقة %s: %s',r.target_name,n,area,names),'success','/manager/support',r.id,'support:accepted');
 perform app.support_notify(app.ops_room_users(),'دعم بآليات بين المسؤولين',format('%s أرسل %s آلية إلى %s (منطقة %s): %s',r.target_name,n,r.requester_name,area,names),'info','/ops-room/operations-data',r.id,'support:accepted:ops');
 return r;
end$$;

-- إغلاق الطلب تلقائياً عند انتهاء كل إسناداته
create or replace function app.support_close_if_done(p_request_id uuid)returns void
language plpgsql security definer set search_path=public,app as $$begin
 update public.sector_support_requests q set status='completed',completed_at=now()
 where q.id=p_request_id and q.status='accepted' and not exists(select 1 from public.sector_support_assignments a where a.request_id=q.id and a.ended_at is null);
end$$;
revoke all on function app.support_close_if_done(uuid)from public,anon,authenticated;

-- إنهاء الدعم: المستفيد (released) أو المالك (recalled)
create or replace function public.sector_support_end(p_assignment_id uuid,p_note text default null)
returns public.sector_support_assignments language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_sector_manager();a public.sector_support_assignments;kind text;other uuid;vn text;
begin
 if p_note is not null and length(trim(p_note))>500 then raise exception'SUPPORT_REASON_INVALID';end if;
 select * into a from public.sector_support_assignments where id=p_assignment_id for update;
 if not found then raise exception'SUPPORT_ASSIGNMENT_NOT_FOUND';end if;
 if a.ended_at is not null then raise exception'SUPPORT_ASSIGNMENT_ENDED';end if;
 if a.to_manager_id=u then kind:='released';other:=a.from_manager_id;
 elsif a.from_manager_id=u then kind:='recalled';other:=a.to_manager_id;
 else raise exception'SUPPORT_REQUEST_FORBIDDEN';end if;
 update public.sector_support_assignments set ended_at=now(),ended_by=u,end_kind=kind,end_note=nullif(trim(coalesce(p_note,'')),'')where id=a.id returning * into a;
 perform app.support_close_if_done(a.request_id);
 select v.vehicle_name||' · DB '||v.db_number into vn from public.garage_vehicles v where v.id=a.vehicle_id;
 perform app.support_notify(array[other],case kind when'released'then'انتهى الدعم — الآلية عادت إلى منطقتها'else'استرجاع آلية الدعم'end,
  format('%s: %s%s',vn,case kind when'released'then app.manager_display_name(u)||' أنهى الدعم'else app.manager_display_name(u)||' استرجع آليته'end,coalesce(' · '||a.end_note,'')),'info','/manager/support',a.request_id,'support:end:'||a.id::text);
 perform app.support_notify(app.ops_room_users(),'انتهاء دعم بآلية',format('%s — %s',vn,case kind when'released'then'أنهاه المستفيد'else'استرجعها المالك'end),'info','/ops-room/operations-data',a.request_id,'support:end:ops:'||a.id::text);
 return a;
end$$;

-- الإلغاء: الطالب وهو معلّق، أو غرفة العمليات في أي وقت (يُنهي الإسنادات المفتوحة)
create or replace function public.sector_support_request_cancel(p_request_id uuid,p_reason text)
returns public.sector_support_requests language plpgsql security definer set search_path=public,app as $$
declare u uuid:=auth.uid();r public.sector_support_requests;is_ops boolean;
begin
 if u is null then raise exception'SECTOR_MANAGER_FORBIDDEN';end if;
 is_ops:=app.has_role(array['ops_room','super_admin']);
 if length(trim(coalesce(p_reason,'')))not between 3 and 500 then raise exception'SUPPORT_REASON_INVALID';end if;
 select * into r from public.sector_support_requests where id=p_request_id for update;
 if not found then raise exception'SUPPORT_REQUEST_FORBIDDEN';end if;
 if not is_ops then
  if r.requester_user_id<>u then raise exception'SUPPORT_REQUEST_FORBIDDEN';end if;
  if r.status<>'pending' then raise exception'SUPPORT_REQUEST_NOT_PENDING';end if;
 elsif r.status not in('pending','accepted')then raise exception'SUPPORT_REQUEST_NOT_OPEN';end if;
 update public.sector_support_assignments set ended_at=now(),ended_by=u,end_kind='cancelled',end_note=trim(p_reason)where request_id=r.id and ended_at is null;
 update public.sector_support_requests set status='cancelled',cancelled_by=u,cancel_reason=trim(p_reason),decided_at=coalesce(decided_at,now())where id=r.id returning * into r;
 perform app.support_notify(array[r.target_user_id,r.requester_user_id]::uuid[],'إلغاء طلب دعم',format('%s: %s',case when is_ops then'غرفة العمليات ألغت الطلب'else r.requester_name||' ألغى طلبه'end,r.cancel_reason),'warning','/manager/support',r.id,'support:cancelled');
 if not is_ops then perform app.support_notify(app.ops_room_users(),'إلغاء طلب دعم',format('%s ألغى طلبه من %s: %s',r.requester_name,r.target_name,r.cancel_reason),'info','/ops-room/operations-data',r.id,'support:cancelled:ops');end if;
 return r;
end$$;

-- عودة الآلية إلى الكراج تُنهي أي دعم مفتوح تلقائياً
create or replace function app.support_end_on_return()returns trigger language plpgsql security definer set search_path=public,app as $$
declare a record;begin
 if new.returned_at is not null and old.returned_at is null then
  for a in update public.sector_support_assignments set ended_at=now(),end_kind='returned' where departure_id=new.id and ended_at is null returning request_id loop
   perform app.support_close_if_done(a.request_id);
  end loop;
 end if;
 return new;
end$$;
drop trigger if exists trg_support_end_on_return on public.garage_departures;
create trigger trg_support_end_on_return after update of returned_at on public.garage_departures for each row execute function app.support_end_on_return();

-- قوائم المسؤول (وارد + صادر) مع الإسنادات
create or replace function public.sector_support_requests_list(p_limit integer default 100)
returns table(id uuid,direction text,status text,requester_user_id uuid,requester_name text,requester_sector_id smallint,requester_area_name text,target_user_id uuid,target_name text,needed_count integer,reason text,decision_note text,cancel_reason text,created_at timestamptz,decided_at timestamptz,completed_at timestamptz,assignments jsonb)
language plpgsql stable security definer set search_path=public,app as $$declare u uuid:=app.require_sector_manager();begin
 if p_limit not between 1 and 500 then raise exception'SUPPORT_PAGE_INVALID';end if;
 return query select q.id,case when q.requester_user_id=u then'outgoing'else'incoming'end,q.status,q.requester_user_id,q.requester_name,q.requester_sector_id,s.name,q.target_user_id,q.target_name,q.needed_count,q.reason,q.decision_note,q.cancel_reason,q.created_at,q.decided_at,q.completed_at,
  coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'departure_id',a.departure_id,'vehicle_id',a.vehicle_id,'vehicle_name',v.vehicle_name,'db_number',v.db_number,'driver_name',d.driver_name,'from_sector_id',a.from_sector_id,'to_sector_id',a.to_sector_id,'started_at',a.started_at,'ended_at',a.ended_at,'end_kind',a.end_kind,'end_note',a.end_note,'trip_status',app.trip_status(a.departure_id))order by a.started_at)
   from public.sector_support_assignments a join public.garage_vehicles v on v.id=a.vehicle_id join public.garage_departures d on d.id=a.departure_id where a.request_id=q.id),'[]'::jsonb)
 from public.sector_support_requests q join public.sectors s on s.id=q.requester_sector_id
 where q.requester_user_id=u or q.target_user_id=u
 order by (q.status in('pending','accepted'))desc,q.created_at desc limit p_limit;
end$$;

-- الآليات التي يمكن للمستهدف إرسالها (تحت استلامه، تعمل في الموقع، غير مُعارة)
create or replace function public.sector_support_lendable_vehicles()
returns table(departure_id uuid,vehicle_id uuid,vehicle_name text,db_number text,driver_name text,sector_id smallint,area_name text,trip_status text)
language plpgsql stable security definer set search_path=public,app as $$declare u uuid:=app.require_sector_manager();begin
 return query select d.id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.sector_id,s.name,app.trip_status(d.id)
 from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
 where d.recipient_manager_id=u and d.returned_at is null and app.trip_status(d.id)='at_site'
  and not exists(select 1 from public.sector_support_assignments a where a.departure_id=d.id and a.ended_at is null)
 order by v.vehicle_name;
end$$;

-- تقرير غرفة العمليات
create or replace function public.ops_support_requests_list(p_from timestamptz default null,p_to timestamptz default null,p_status text default null,p_limit integer default 200)
returns table(id uuid,status text,requester_user_id uuid,requester_name text,requester_sector_id smallint,requester_area_name text,requester_parent_sector text,target_user_id uuid,target_name text,needed_count integer,reason text,decision_note text,cancel_reason text,created_at timestamptz,decided_at timestamptz,completed_at timestamptz,assignments jsonb)
language plpgsql stable security definer set search_path=public,app as $$begin
 if auth.uid()is null or not app.has_role(array['ops_room','super_admin','it_admin'])then raise exception'OPS_FORBIDDEN';end if;
 if p_limit not between 1 and 1000 then raise exception'SUPPORT_PAGE_INVALID';end if;
 if p_status is not null and p_status not in('pending','accepted','rejected','cancelled','completed')then raise exception'SUPPORT_STATUS_INVALID';end if;
 return query select q.id,q.status,q.requester_user_id,q.requester_name,q.requester_sector_id,s.name,s.parent_sector,q.target_user_id,q.target_name,q.needed_count,q.reason,q.decision_note,q.cancel_reason,q.created_at,q.decided_at,q.completed_at,
  coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'departure_id',a.departure_id,'vehicle_id',a.vehicle_id,'vehicle_name',v.vehicle_name,'db_number',v.db_number,'driver_name',d.driver_name,'from_sector_id',a.from_sector_id,'to_sector_id',a.to_sector_id,'started_at',a.started_at,'ended_at',a.ended_at,'end_kind',a.end_kind,'end_note',a.end_note,'trip_status',app.trip_status(a.departure_id))order by a.started_at)
   from public.sector_support_assignments a join public.garage_vehicles v on v.id=a.vehicle_id join public.garage_departures d on d.id=a.departure_id where a.request_id=q.id),'[]'::jsonb)
 from public.sector_support_requests q join public.sectors s on s.id=q.requester_sector_id
 where (p_from is null or q.created_at>=p_from)and(p_to is null or q.created_at<p_to)and(p_status is null or q.status=p_status)
 order by (q.status in('pending','accepted'))desc,q.created_at desc limit p_limit;
end$$;

-- قوائم رحلات المسؤول: تشمل آليات الدعم الواردة، مع أعمدة الدعم
drop function if exists public.manager_vehicle_trips();
create function public.manager_vehicle_trips()
returns table(id uuid,vehicle_id uuid,driver_name text,shift text,sector_id smallint,departed_at timestamptz,arrived_at timestamptz,site_departed_at timestamptz,returned_at timestamptz,recipient_manager_id uuid,recipient_manager_name text,arrival_notes text,site_departure_notes text,vehicle_name text,db_number text,image_path text,area_name text,parent_sector text,trip_status text,support_assignment_id uuid,support_role text,support_sector_id smallint,support_area_name text,support_counterpart_name text)
language plpgsql stable security definer set search_path=public,app as $$declare u uuid:=auth.uid();begin if u is null or not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN';end if;
 return query select d.id,d.vehicle_id,d.driver_name,d.shift,d.sector_id,d.departed_at,d.arrived_at,d.site_departed_at,d.returned_at,d.recipient_manager_id,d.recipient_manager_name,d.arrival_notes,d.site_departure_notes,v.vehicle_name,v.db_number,v.image_path,s.name,s.parent_sector,app.trip_status(d.id),
  a.id,case when a.id is null then null when a.to_manager_id=u then'borrowed'else'lent'end,a.to_sector_id,ts.name,case when a.id is null then null when a.to_manager_id=u then app.manager_display_name(a.from_manager_id)else app.manager_display_name(a.to_manager_id)end
 from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
 left join public.sector_support_assignments a on a.departure_id=d.id and a.ended_at is null left join public.sectors ts on ts.id=a.to_sector_id
 where(d.recipient_manager_id=u or (d.recipient_manager_id is null and exists(select 1 from public.manager_profiles mp where mp.user_id=u and d.sector_id=any(mp.sectors) and d.shift=mp.shift)) or a.to_manager_id=u)
  and(d.returned_at is null or (d.returned_at at time zone 'Asia/Baghdad')::date=(now() at time zone 'Asia/Baghdad')::date)
 order by(d.returned_at is null)desc,d.departed_at desc;end$$;

drop function if exists public.manager_vehicle_trips_for_day(date);
create function public.manager_vehicle_trips_for_day(p_day date)
returns table(id uuid,vehicle_id uuid,driver_name text,shift text,sector_id smallint,departed_at timestamptz,arrived_at timestamptz,site_departed_at timestamptz,returned_at timestamptz,recipient_manager_id uuid,recipient_manager_name text,arrival_notes text,site_departure_notes text,vehicle_name text,db_number text,image_path text,area_name text,parent_sector text,trip_status text,support_assignment_id uuid,support_role text,support_sector_id smallint,support_area_name text,support_counterpart_name text)
language plpgsql stable security definer set search_path=public,app as $$declare u uuid:=auth.uid();begin
 if u is null or not app.has_role(array['department_manager'])then raise exception 'SECTOR_MANAGER_FORBIDDEN';end if;if p_day is null then raise exception 'GARAGE_DAY_REQUIRED';end if;
 return query select d.id,d.vehicle_id,d.driver_name,d.shift,d.sector_id,d.departed_at,d.arrived_at,d.site_departed_at,d.returned_at,d.recipient_manager_id,d.recipient_manager_name,d.arrival_notes,d.site_departure_notes,v.vehicle_name,v.db_number,v.image_path,s.name,s.parent_sector,app.trip_status(d.id),
  a.id,case when a.id is null then null when a.to_manager_id=u then'borrowed'else'lent'end,a.to_sector_id,ts.name,case when a.id is null then null when a.to_manager_id=u then app.manager_display_name(a.from_manager_id)else app.manager_display_name(a.to_manager_id)end
 from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
 left join public.sector_support_assignments a on a.departure_id=d.id and a.ended_at is null left join public.sectors ts on ts.id=a.to_sector_id
 where(d.recipient_manager_id=u or(d.recipient_manager_id is null and exists(select 1 from public.manager_profiles mp where mp.user_id=u and d.sector_id=any(mp.sectors)and d.shift=mp.shift))or a.to_manager_id=u)
  and(d.departed_at at time zone 'Asia/Baghdad')::date=p_day order by d.departed_at desc;
end$$;

-- ═══════════════════════════ (4) تنبيه «خرجت من مسارها» ═══════════════════════════
alter table public.gps_operational_alerts drop constraint if exists gps_operational_alerts_alert_type_check;
alter table public.gps_operational_alerts add constraint gps_operational_alerts_alert_type_check check(alert_type in('gps_offline','gps_stale','outside_zone','engine_idle','route_deviation'));
alter table public.gps_alert_notification_policies drop constraint if exists gps_alert_notification_policies_alert_type_check;
alter table public.gps_alert_notification_policies add constraint gps_alert_notification_policies_alert_type_check check(alert_type in('gps_offline','gps_stale','outside_zone','engine_idle','route_deviation'));
insert into public.gps_alert_notification_policies(alert_type,priority,recipient_roles,in_app_enabled,push_enabled,sound_enabled,only_during_departure)
values('route_deviation','high',array['ops_room'],true,true,true,true)on conflict(alert_type)do nothing;

drop function public.gps_alert_notification_policy_save(text,boolean,text,text[],boolean,boolean,boolean,boolean,integer,integer,integer);
create function public.gps_alert_notification_policy_save(p_alert_type text,p_enabled boolean,p_priority text,p_recipient_roles text[],p_in_app boolean,p_push boolean,p_sound boolean,p_only_during_departure boolean,p_escalation_minutes integer,p_escalation_repeat_minutes integer,p_escalation_levels integer)
returns void language plpgsql security definer set search_path=public,app as $$begin
 if auth.uid()is null or not app.has_role(array['it_admin','super_admin'])then raise exception'GPS_POLICY_FORBIDDEN';end if;
 if p_alert_type not in('gps_offline','gps_stale','outside_zone','engine_idle','route_deviation')or p_priority not in('low','normal','high','critical')or cardinality(p_recipient_roles)not between 1 and 8 or p_escalation_minutes not between 1 and 1440 or p_escalation_repeat_minutes not between 1 and 1440 or p_escalation_levels not between 1 and 5 then raise exception'GPS_POLICY_INVALID';end if;
 insert into public.gps_alert_notification_policies(alert_type,enabled,priority,recipient_roles,in_app_enabled,push_enabled,sound_enabled,only_during_departure,escalation_minutes,escalation_repeat_minutes,escalation_levels,updated_by,updated_at)
 values(p_alert_type,p_enabled,p_priority,p_recipient_roles,p_in_app,p_push,p_sound,p_only_during_departure,p_escalation_minutes,p_escalation_repeat_minutes,p_escalation_levels,auth.uid(),now())
 on conflict(alert_type)do update set enabled=excluded.enabled,priority=excluded.priority,recipient_roles=excluded.recipient_roles,in_app_enabled=excluded.in_app_enabled,push_enabled=excluded.push_enabled,sound_enabled=excluded.sound_enabled,only_during_departure=excluded.only_during_departure,escalation_minutes=excluded.escalation_minutes,escalation_repeat_minutes=excluded.escalation_repeat_minutes,escalation_levels=excluded.escalation_levels,updated_by=excluded.updated_by,updated_at=now();
end$$;
revoke all on function public.gps_alert_notification_policy_save(text,boolean,text,text[],boolean,boolean,boolean,boolean,integer,integer,integer)from public,anon;
grant execute on function public.gps_alert_notification_policy_save(text,boolean,text,text[],boolean,boolean,boolean,boolean,integer,integer,integer)to authenticated;

-- نص إشعار التنبيه (يغطي النوع الجديد)
create or replace function app.notify_gps_operational_alert()returns trigger language plpgsql security definer set search_path=public,app as $$declare p public.gps_alert_notification_policies;v public.garage_vehicles;body text;begin
 select*into p from public.gps_alert_notification_policies where alert_type=new.alert_type and enabled;
 if not found or(p.only_during_departure and new.departure_id is null)then return new;end if;
 select*into v from public.garage_vehicles where id=new.garage_vehicle_id;
 body:=format('%s%s%s',coalesce(v.vehicle_name,'جهاز GPS'),case when v.db_number is not null then' · DB '||v.db_number else''end,
  case new.alert_type
   when'route_deviation'then format(' — السائق %s خرج من منطقة %s (مسؤولها %s) منذ %s دقيقة',coalesce(new.details->>'driver_name','—'),coalesce(new.details->>'area_name','—'),coalesce(new.details->>'manager_name','—'),coalesce(new.details->>'outside_minutes','?'))
   when'outside_zone'then' — تحقق من المسار والزون'when'gps_offline'then' — الاتصال منقطع أثناء الانطلاقية'else' — القراءة متأخرة أثناء الانطلاقية'end);
 insert into public.notifications(user_id,title,body,type,category,priority,link,entity_type,entity_id,action_label,dedupe_key,in_app_visible,push_allowed,sound_allowed)
 select distinct ur.user_id,new.title,body,case when p.priority='critical'then'error'else'warning'end,'gps',p.priority,'/ops-room/gps','gps_alert',new.id,'فتح غرفة GPS','gps_alert:'||new.id::text,p.in_app_enabled,p.push_enabled,p.sound_enabled
 from public.user_roles ur where ur.role=any(p.recipient_roles)
 on conflict(user_id,dedupe_key)where dedupe_key is not null do nothing;
 return new;
end$$;

-- حالة وجود الآلية داخل زونات منطقتها الفعلية (لكل انطلاقة مفتوحة)
create table if not exists public.gps_route_presence_state(
 departure_id uuid primary key references public.garage_departures(id)on delete cascade,
 device_id uuid not null references public.gps_devices(id)on delete cascade,
 sector_id smallint not null references public.sectors(id),
 is_inside boolean not null,
 observed_at timestamptz not null,
 changed_at timestamptz not null
);
alter table public.gps_route_presence_state enable row level security;
revoke all on table public.gps_route_presence_state from anon,authenticated;

create or replace function app.gps_evaluate_route_deviation()returns integer
language plpgsql security definer set search_path=public,app as $$
declare grace integer;opened integer:=0;rec record;
begin
 select s.grace_minutes into grace from public.gps_route_deviation_settings s where s.id;grace:=coalesce(grace,3);
 -- (1) تحديث حالة الوجود للانطلاقات المفتوحة التي تعمل في الموقع ولمنطقتها الفعلية زون واحد على الأقل
 for rec in
  select d.id departure_id,dev.id device_id,app.departure_effective_sector(d.id) sector_id,p.fix_time observed_at,p.latitude,p.longitude
  from public.garage_departures d
  join public.gps_vehicle_bindings b on b.garage_vehicle_id=d.vehicle_id
  join public.gps_devices dev on dev.id=b.device_id
  join public.gps_device_positions p on p.device_id=dev.id
  where d.returned_at is null and p.fix_time is not null and p.latitude is not null and p.longitude is not null
   and app.trip_status(d.id) in('at_site','breakdown')
 loop
  if not exists(select 1 from public.gps_geofences g where g.sector_id=rec.sector_id and g.is_active)then
   delete from public.gps_route_presence_state where departure_id=rec.departure_id;continue;
  end if;
  insert into public.gps_route_presence_state(departure_id,device_id,sector_id,is_inside,observed_at,changed_at)
  values(rec.departure_id,rec.device_id,rec.sector_id,
   exists(select 1 from public.gps_geofences g where g.sector_id=rec.sector_id and g.is_active and app.gps_point_in_polygon(rec.latitude,rec.longitude,g.polygon)),rec.observed_at,rec.observed_at)
  on conflict(departure_id)do update set device_id=excluded.device_id,is_inside=excluded.is_inside,observed_at=excluded.observed_at,
   -- تغيّر المنطقة الفعلية (دعم) = بداية جديدة للعدّ
   sector_id=excluded.sector_id,
   changed_at=case when gps_route_presence_state.is_inside<>excluded.is_inside or gps_route_presence_state.sector_id<>excluded.sector_id then excluded.observed_at else gps_route_presence_state.changed_at end
  where excluded.observed_at>=gps_route_presence_state.observed_at;
 end loop;
 -- (2) حذف حالات الانطلاقات التي لم تعد «تعمل في الموقع» أو أُغلقت
 delete from public.gps_route_presence_state s where not exists(select 1 from public.garage_departures d where d.id=s.departure_id and d.returned_at is null and app.trip_status(d.id)in('at_site','breakdown'));
 -- (3) إغلاق التنبيهات التي عادت آلياتها أو خرجت من نطاق المراقبة
 update public.gps_operational_alerts a set resolved_at=now()
 where a.alert_type='route_deviation' and a.resolved_at is null
  and not exists(select 1 from public.gps_route_presence_state s where s.departure_id=a.departure_id and not s.is_inside);
 -- (4) فتح تنبيه لكل انطلاقة خارج زون منطقتها منذ مهلة التسامح فأكثر
 with cand as(
  select s.departure_id,s.device_id,d.vehicle_id,s.sector_id,s.changed_at,p.latitude,p.longitude,d.driver_name,sec.name area_name,sec.parent_sector,
   coalesce((select app.manager_display_name(a.to_manager_id)from public.sector_support_assignments a where a.departure_id=s.departure_id and a.ended_at is null limit 1),d.recipient_manager_name,'—')manager_name,
   exists(select 1 from public.sector_support_assignments a where a.departure_id=s.departure_id and a.ended_at is null)in_support
  from public.gps_route_presence_state s join public.garage_departures d on d.id=s.departure_id join public.sectors sec on sec.id=s.sector_id
  join public.gps_device_positions p on p.device_id=s.device_id
  where not s.is_inside and s.changed_at<=now()-make_interval(mins=>grace)
   and not exists(select 1 from public.gps_operational_alerts a where a.departure_id=s.departure_id and a.alert_type='route_deviation' and a.resolved_at is null)
 ),ins as(
  insert into public.gps_operational_alerts(device_id,garage_vehicle_id,departure_id,alert_type,severity,title,details)
  select c.device_id,c.vehicle_id,c.departure_id,'route_deviation','warning','الآلية خرجت من مسارها',
   jsonb_build_object('latitude',c.latitude,'longitude',c.longitude,'sector_id',c.sector_id,'area_name',c.area_name,'parent_sector',c.parent_sector,'driver_name',c.driver_name,'manager_name',c.manager_name,'outside_since',c.changed_at,'outside_minutes',floor(extract(epoch from(now()-c.changed_at))/60)::int,'in_support',c.in_support,'grace_minutes',grace)
  from cand c returning 1
 )select count(*)into opened from ins;
 return opened;
end$$;
revoke all on function app.gps_evaluate_route_deviation()from public,anon,authenticated;

-- تضمينها في دورة التقييم الحالية (نفس المنطق السابق + الخطوة الجديدة)
create or replace function public.gps_evaluate_operational_alerts()returns void language plpgsql security definer set search_path=public,app as $$begin
 update public.gps_operational_alerts a set resolved_at=now()where a.resolved_at is null and a.alert_type<>'route_deviation' and((a.alert_type='gps_offline'and exists(select 1 from public.gps_devices d where d.id=a.device_id and d.online_status='online'))or(a.alert_type='gps_stale'and exists(select 1 from public.gps_device_positions p where p.device_id=a.device_id and p.fix_time>=now()-interval'5 minutes'))or(a.alert_type='outside_zone'and exists(select 1 from public.gps_device_positions p join public.gps_vehicle_bindings b on b.device_id=p.device_id where p.device_id=a.device_id and exists(select 1 from public.gps_vehicle_geofences vg join public.gps_geofences g on g.id=vg.geofence_id and g.is_active where vg.garage_vehicle_id=b.garage_vehicle_id and app.gps_point_in_polygon(p.latitude,p.longitude,g.polygon)))));
 insert into public.gps_operational_alerts(device_id,garage_vehicle_id,departure_id,alert_type,severity,title,details)select d.id,b.garage_vehicle_id,dep.id,'gps_offline','critical','انقطع اتصال GPS أثناء الانطلاقة',jsonb_build_object('last_seen_at',d.last_seen_at)from public.gps_devices d join public.gps_vehicle_bindings b on b.device_id=d.id join public.garage_departures dep on dep.vehicle_id=b.garage_vehicle_id and dep.returned_at is null where d.online_status='offline'and not exists(select 1 from public.gps_operational_alerts a where a.device_id=d.id and a.alert_type='gps_offline'and(a.resolved_at is null or a.resolved_by is not null and a.resolved_at>now()-interval'30 minutes'));
 insert into public.gps_operational_alerts(device_id,garage_vehicle_id,departure_id,alert_type,severity,title,details)select d.id,b.garage_vehicle_id,dep.id,'gps_stale','warning','توقفت قراءات GPS أثناء الانطلاقة',jsonb_build_object('fix_time',p.fix_time)from public.gps_devices d join public.gps_device_positions p on p.device_id=d.id join public.gps_vehicle_bindings b on b.device_id=d.id join public.garage_departures dep on dep.vehicle_id=b.garage_vehicle_id and dep.returned_at is null where p.fix_time<now()-interval'5 minutes'and not exists(select 1 from public.gps_operational_alerts a where a.device_id=d.id and a.alert_type='gps_stale'and(a.resolved_at is null or a.resolved_by is not null and a.resolved_at>now()-interval'30 minutes'));
 insert into public.gps_operational_alerts(device_id,garage_vehicle_id,departure_id,alert_type,severity,title,details)select d.id,b.garage_vehicle_id,dep.id,'outside_zone','warning','الآلية خارج الزون المخصص',jsonb_build_object('latitude',p.latitude,'longitude',p.longitude)from public.gps_devices d join public.gps_device_positions p on p.device_id=d.id join public.gps_vehicle_bindings b on b.device_id=d.id join public.garage_departures dep on dep.vehicle_id=b.garage_vehicle_id and dep.returned_at is null where exists(select 1 from public.gps_vehicle_geofences vg where vg.garage_vehicle_id=b.garage_vehicle_id)and not exists(select 1 from public.gps_vehicle_geofences vg join public.gps_geofences g on g.id=vg.geofence_id and g.is_active where vg.garage_vehicle_id=b.garage_vehicle_id and app.gps_point_in_polygon(p.latitude,p.longitude,g.polygon))and not exists(select 1 from public.gps_operational_alerts a where a.device_id=d.id and a.alert_type='outside_zone'and(a.resolved_at is null or a.resolved_by is not null and a.resolved_at>now()-interval'30 minutes'));
 perform public.gps_evaluate_zone_transitions();
 perform app.gps_evaluate_route_deviation();
end$$;

-- ═══════════════════════════ (5) الصلاحيات ═══════════════════════════
revoke all on function public.gps_platform_geofence_save(uuid,text,jsonb,text,smallint),public.gps_geofence_set_sector(uuid,smallint),public.gps_lvn_map_geofences(),
 public.gps_route_deviation_settings_get(),public.gps_route_deviation_settings_save(integer),
 public.sector_support_managers(),public.sector_support_request_create(uuid,smallint,integer,text),public.sector_support_request_reject(uuid,text),public.sector_support_request_accept(uuid,uuid[],text),
 public.sector_support_end(uuid,text),public.sector_support_request_cancel(uuid,text),public.sector_support_requests_list(integer),public.sector_support_lendable_vehicles(),
 public.ops_support_requests_list(timestamptz,timestamptz,text,integer),public.manager_vehicle_trips(),public.manager_vehicle_trips_for_day(date)from public,anon;
grant execute on function public.gps_platform_geofence_save(uuid,text,jsonb,text,smallint),public.gps_geofence_set_sector(uuid,smallint),public.gps_lvn_map_geofences(),
 public.gps_route_deviation_settings_get(),public.gps_route_deviation_settings_save(integer),
 public.sector_support_managers(),public.sector_support_request_create(uuid,smallint,integer,text),public.sector_support_request_reject(uuid,text),public.sector_support_request_accept(uuid,uuid[],text),
 public.sector_support_end(uuid,text),public.sector_support_request_cancel(uuid,text),public.sector_support_requests_list(integer),public.sector_support_lendable_vehicles(),
 public.ops_support_requests_list(timestamptz,timestamptz,text,integer),public.manager_vehicle_trips(),public.manager_vehicle_trips_for_day(date)to authenticated;
