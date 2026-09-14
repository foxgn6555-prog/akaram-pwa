-- 00116 · مكتبة رموز بصرية للمعالم التشغيلية على الخريطة.
alter table public.gps_map_landmarks
 add column icon text not null default 'pin'
 check(icon in('pin','building','garage','fuel','maintenance','warehouse','office','checkpoint','warning','trash','tree','park','hospital','school','restaurant','water','camera','parking','toilet','bridge','target','flag'));

drop function if exists public.gps_map_landmarks_list();
create function public.gps_map_landmarks_list()
returns table(id uuid,name text,category text,latitude float8,longitude float8,color text,notes text,icon text)
language plpgsql stable security definer set search_path=public,app as $$begin
 perform app.require_gps_operator();
 return query select l.id,l.name,l.category,l.latitude,l.longitude,l.color,l.notes,l.icon
 from public.gps_map_landmarks l where l.is_active order by l.category,l.name;
end$$;

drop function if exists public.gps_map_landmark_save(uuid,text,text,float8,float8,text,text);
create function public.gps_map_landmark_save(p_id uuid,p_name text,p_category text,p_latitude float8,p_longitude float8,p_color text default'#f97316',p_notes text default null,p_icon text default'pin')
returns uuid language plpgsql security definer set search_path=public,app as $$declare u uuid:=app.require_gps_operator();lid uuid;begin
 if length(trim(coalesce(p_name,'')))not between 2 and 160 then raise exception'GPS_LANDMARK_NAME_INVALID';end if;
 if p_category not in('landmark','garage','station','maintenance','office','checkpoint','hazard','other')then raise exception'GPS_LANDMARK_CATEGORY_INVALID';end if;
 if p_icon not in('pin','building','garage','fuel','maintenance','warehouse','office','checkpoint','warning','trash','tree','park','hospital','school','restaurant','water','camera','parking','toilet','bridge','target','flag')then raise exception'GPS_LANDMARK_ICON_INVALID';end if;
 if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception'GPS_LANDMARK_POINT_INVALID';end if;
 if coalesce(p_color,'')!~'^#[0-9a-fA-F]{6}$'then raise exception'GPS_LANDMARK_COLOR_INVALID';end if;
 if length(trim(coalesce(p_notes,'')))>500 then raise exception'GPS_LANDMARK_NOTES_INVALID';end if;
 if p_id is null then
  insert into public.gps_map_landmarks(name,category,latitude,longitude,color,notes,icon,created_by)
  values(trim(p_name),p_category,p_latitude,p_longitude,p_color,nullif(trim(coalesce(p_notes,'')),''),p_icon,u)returning id into lid;
 else
  update public.gps_map_landmarks set name=trim(p_name),category=p_category,latitude=p_latitude,longitude=p_longitude,color=p_color,notes=nullif(trim(coalesce(p_notes,'')),''),icon=p_icon,is_active=true,updated_at=now()
  where id=p_id returning id into lid;
  if lid is null then raise exception'GPS_LANDMARK_NOT_FOUND';end if;
 end if;
 return lid;
end$$;

revoke all on function public.gps_map_landmarks_list(),public.gps_map_landmark_save(uuid,text,text,float8,float8,text,text,text) from public,anon;
grant execute on function public.gps_map_landmarks_list(),public.gps_map_landmark_save(uuid,text,text,float8,float8,text,text,text) to authenticated;
