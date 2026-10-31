-- نمذجة طلب جماعي قديم كان مسموحاً قبل 00352. تستعمله الاختبارات لإثبات ترقية
-- البيانات التاريخية وأولوية الإجازة/الزمنية والتراجع، وليس مساراً متاحاً للمستخدم.
create function pg_temp.historical_bulk(e uuid,d date,reason text) returns jsonb language plpgsql as $$
declare rid uuid; res jsonb; sh record; pin timestamptz; pout timestamptz;
begin
 select * into sh from app.hr_effective_shift(e,d);
 pin:=((d+sh.start_time)::timestamp-app.hr_tz()) at time zone 'UTC';
 pout:=((d+sh.end_time)::timestamp-app.hr_tz()) at time zone 'UTC';
 if pout<=pin then pout:=pout+interval '1 day'; end if;
 insert into public.attendance_edit_requests(mode,status,scope_kind,scope_ids,scope_label,dates,action,payload,reason,requested_by,requester_role,employees_count,days_count,items_count,applied_by,applied_at)
 values('direct','applied','employees',array[e],'طلب تاريخي',array[d],'full_presence','{}',reason,auth.uid(),'super_admin',1,1,1,auth.uid(),now()) returning id into rid;
 res:=app.attendance_edit_apply_day_00351_raw(e,d,pin,pout,'present',reason);
 insert into public.attendance_edit_items(request_id,employee_id,work_date,before,proposed,after,applied)
 values(rid,e,d,nullif(res->'before','null'::jsonb),jsonb_build_object('status','present','check_in',pin,'check_out',pout),res->'after',true);
 return jsonb_build_object('id',rid);
end$$;
