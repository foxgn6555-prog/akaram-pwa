-- 00115 · معالم الخريطة وأشكال الزونات التشغيلية.
-- الأشكال الهندسية تحفظ كمضلعات معيارية حتى تبقى متوافقة مع محرك التحقق الحالي.

create table public.gps_map_landmarks(
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 2 and 160),
 category text not null default 'landmark' check(category in('landmark','garage','station','maintenance','office','checkpoint','hazard','other')),
 latitude float8 not null check(latitude between -90 and 90),
 longitude float8 not null check(longitude between -180 and 180),
 color text not null default '#f97316' check(color~'^#[0-9a-fA-F]{6}$'),
 notes text check(notes is null or length(trim(notes))<=500),
 is_active boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index gps_map_landmarks_active_idx on public.gps_map_landmarks(is_active,category,name);
alter table public.gps_map_landmarks enable row level security;
create policy "gps landmarks authorized read" on public.gps_map_landmarks for select to authenticated
 using(app.has_role(array['ops_room','it_admin','super_admin']));

create or replace function public.gps_map_landmarks_list()
returns table(id uuid,name text,category text,latitude float8,longitude float8,color text,notes text)
language plpgsql stable security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 return query select l.id,l.name,l.category,l.latitude,l.longitude,l.color,l.notes
 from public.gps_map_landmarks l where l.is_active order by l.category,l.name;
end$$;

create or replace function public.gps_map_landmark_save(p_id uuid,p_name text,p_category text,p_latitude float8,p_longitude float8,p_color text default'#f97316',p_notes text default null)
returns uuid language plpgsql security definer set search_path=public,app as $$declare u uuid:=app.require_gps_operator();lid uuid;begin
 if length(trim(coalesce(p_name,'')))not between 2 and 160 then raise exception'GPS_LANDMARK_NAME_INVALID';end if;
 if p_category not in('landmark','garage','station','maintenance','office','checkpoint','hazard','other')then raise exception'GPS_LANDMARK_CATEGORY_INVALID';end if;
 if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception'GPS_LANDMARK_POINT_INVALID';end if;
 if coalesce(p_color,'')!~'^#[0-9a-fA-F]{6}$'then raise exception'GPS_LANDMARK_COLOR_INVALID';end if;
 if length(trim(coalesce(p_notes,'')))>500 then raise exception'GPS_LANDMARK_NOTES_INVALID';end if;
 if p_id is null then
  insert into public.gps_map_landmarks(name,category,latitude,longitude,color,notes,created_by)
  values(trim(p_name),p_category,p_latitude,p_longitude,p_color,nullif(trim(coalesce(p_notes,'')),''),u)returning id into lid;
 else
  update public.gps_map_landmarks set name=trim(p_name),category=p_category,latitude=p_latitude,longitude=p_longitude,color=p_color,notes=nullif(trim(coalesce(p_notes,'')),''),is_active=true,updated_at=now()
  where id=p_id returning id into lid;
  if lid is null then raise exception'GPS_LANDMARK_NOT_FOUND';end if;
 end if;
 return lid;
end$$;

create or replace function public.gps_map_landmark_archive(p_id uuid)
returns void language plpgsql security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 update public.gps_map_landmarks set is_active=false,updated_at=now()where id=p_id and is_active;
 if not found then raise exception'GPS_LANDMARK_NOT_FOUND';end if;
end$$;

revoke all on table public.gps_map_landmarks from anon,authenticated;
grant select on table public.gps_map_landmarks to authenticated;
revoke all on function public.gps_map_landmarks_list(),public.gps_map_landmark_save(uuid,text,text,float8,float8,text,text),public.gps_map_landmark_archive(uuid) from public,anon;
grant execute on function public.gps_map_landmarks_list(),public.gps_map_landmark_save(uuid,text,text,float8,float8,text,text),public.gps_map_landmark_archive(uuid) to authenticated;
