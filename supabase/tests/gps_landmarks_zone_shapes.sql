-- معالم الخريطة: الحفظ والقراءة والأرشفة مع عزل الصلاحيات.
do $$
declare
 operator_id uuid:='94000000-0000-0000-0000-000000000001';
 outsider_id uuid:='94000000-0000-0000-0000-000000000002';
 landmark_id uuid;n integer;
begin
 insert into auth.users(id,email)values(operator_id,'gps-landmark-operator@akram.iq'),(outsider_id,'gps-landmark-outsider@akram.iq');
 insert into public.user_roles(user_id,role)values(operator_id,'ops_room');
 perform set_config('role','authenticated',false);
 perform set_config('request.jwt.claim.sub',operator_id::text,false);
 landmark_id:=public.gps_map_landmark_save(null,'محطة اختبار','station',33.3152,44.3661,'#f97316','معلم تشغيلي','fuel');
 select count(*)into n from public.gps_map_landmarks_list()where id=landmark_id and category='station'and icon='fuel';
 if n<>1 then raise exception'GPS_LANDMARK_LIST_FAIL';end if;
 perform public.gps_map_landmark_archive(landmark_id);
 select count(*)into n from public.gps_map_landmarks_list()where id=landmark_id;
 if n<>0 then raise exception'GPS_LANDMARK_ARCHIVE_FAIL';end if;
 execute'reset role';
 perform set_config('role','authenticated',false);
 perform set_config('request.jwt.claim.sub',outsider_id::text,false);
 begin perform public.gps_map_landmarks_list();raise exception'GPS_LANDMARK_FORBIDDEN_ACCEPTED';exception when others then if sqlerrm='GPS_LANDMARK_FORBIDDEN_ACCEPTED'then raise;end if;if sqlerrm not like'%GPS_FORBIDDEN%'then raise;end if;end;
 execute'reset role';
 raise notice'✅ معالم الخريطة: حفظ وقراءة وأرشفة وعزل الصلاحيات ناجحة';
end$$;
