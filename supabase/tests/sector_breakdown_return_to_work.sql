-- دورة العطل: آلية مسندة فقط، عطل مفتوح واحد، وعودة للعمل بتوقيت الخادم وعزل المالك.
do $$
declare
  manager_u uuid='77000000-0000-0000-0000-000000000001';other_u uuid='77000000-0000-0000-0000-000000000002';b public.sector_breakdowns;n bigint;
begin
  insert into auth.users(id,email) values(manager_u,'breakdown-manager@akram.iq'),(other_u,'breakdown-other@akram.iq');
  insert into public.user_roles(user_id,role) values(manager_u,'department_manager'),(other_u,'department_manager');
  insert into public.manager_profiles(user_id,shift,sectors) values(manager_u,'morning',array[1]::smallint[]),(other_u,'evening',array[2]::smallint[]);
  insert into public.sector_vehicles(db_number,vehicle_type,sector_id,shift,driver_name,created_by) values('DB-BREAK-1','كابسة',1,'morning','سائق',manager_u);
  perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',manager_u::text,false);
  b:=public.sector_submit_breakdown(' db-break-1 ','عطل هيدروليك','توقف مفاجئ');
  if b.db_number<>'DB-BREAK-1' or b.status<>'logged' or b.created_at is null or b.resolved_at is not null then raise exception 'BREAKDOWN_CREATE_FAIL';end if;
  begin perform public.sector_submit_breakdown('DB-BREAK-1','عطل ثان',null);raise exception 'DUPLICATE_OPEN_BREAKDOWN_ACCEPTED';
  exception when others then if sqlerrm='DUPLICATE_OPEN_BREAKDOWN_ACCEPTED' then raise;end if;if sqlerrm not like '%BREAKDOWN_ALREADY_OPEN%' then raise;end if;end;
  begin perform public.sector_submit_breakdown('DB-NOT-MINE','عطل غير مسند',null);raise exception 'UNASSIGNED_VEHICLE_ACCEPTED';
  exception when others then if sqlerrm='UNASSIGNED_VEHICLE_ACCEPTED' then raise;end if;if sqlerrm not like '%BREAKDOWN_VEHICLE_NOT_ASSIGNED%' then raise;end if;end;
  begin update public.sector_breakdowns set status='resolved' where id=b.id;if found then raise exception 'DIRECT_BREAKDOWN_UPDATE_ACCEPTED';end if;
  exception when others then if sqlerrm='DIRECT_BREAKDOWN_UPDATE_ACCEPTED' then raise;end if;end;
  perform set_config('request.jwt.claim.sub',other_u::text,false);
  begin perform public.sector_return_vehicle_to_work(b.id,'محاولة مستخدم آخر');raise exception 'OTHER_MANAGER_RESOLVE_ACCEPTED';
  exception when others then if sqlerrm='OTHER_MANAGER_RESOLVE_ACCEPTED' then raise;end if;if sqlerrm not like '%BREAKDOWN_OPEN_NOT_FOUND%' then raise;end if;end;
  perform set_config('request.jwt.claim.sub',manager_u::text,false);
  begin perform public.sector_return_vehicle_to_work(b.id,'x');raise exception 'SHORT_RESOLUTION_ACCEPTED';
  exception when others then if sqlerrm='SHORT_RESOLUTION_ACCEPTED' then raise;end if;if sqlerrm not like '%BREAKDOWN_RESOLUTION_NOTES_REQUIRED%' then raise;end if;end;
  b:=public.sector_return_vehicle_to_work(b.id,'تبديل الخرطوم وفحص التشغيل');
  if b.status<>'resolved' or b.resolved_at is null or b.resolved_by<>manager_u or b.resolution_notes<>'تبديل الخرطوم وفحص التشغيل' or b.resolved_at<b.created_at then raise exception 'RETURN_TO_WORK_FAIL';end if;
  begin perform public.sector_return_vehicle_to_work(b.id,'محاولة عودة ثانية');raise exception 'DOUBLE_RETURN_TO_WORK_ACCEPTED';
  exception when others then if sqlerrm='DOUBLE_RETURN_TO_WORK_ACCEPTED' then raise;end if;if sqlerrm not like '%BREAKDOWN_OPEN_NOT_FOUND%' then raise;end if;end;
  execute 'reset role';select count(*) into n from public.audit_logs where table_name='sector_breakdowns' and record_id=b.id::text;
  if n<2 then raise exception 'BREAKDOWN_AUDIT_FAIL';end if;
  raise notice '✅ دورة العطل والعودة للعمل: الإسناد/العزل/توقيت الخادم/منع التكرار/التدقيق ناجحة';
end$$;
