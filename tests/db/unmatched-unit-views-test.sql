-- depends: tests/db/unmatched-unit-daily-engine-test.sql
reset role; select set_config('auth.user_id','',false);
insert into public.biometric_devices(id,serial_number,name,is_active,timezone_offset) values
 ('d3660000-0000-0000-0000-000000000001','DUP-A','جهاز الموظف',false,'+03:00'),
 ('d3660000-0000-0000-0000-000000000002','DUP-B','جهاز الشخص الآخر',false,'+03:00'),
 ('d3660000-0000-0000-0000-000000000003','DUP-C','جهاز بلا بصمة',false,'+03:00');
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values
 ('e3660000-0000-0000-0000-000000000001','EMP366','الموظف المسجل','2024-01-01','999366');
insert into public.biometric_device_users(device_serial,pin,name) values ('DUP-A','999366','الموظف'),('DUP-B','999366','شخص مختلف'),('DUP-C','999366','شخص بلا بصمة');
insert into public.biometric_punches(id,device_serial,pin,employee_id,punched_at,method) values
 ('c3660000-0000-0000-0000-000000000001','DUP-A','999366','e3660000-0000-0000-0000-000000000001','2025-05-01 05:00+00','manual'),
 ('c3660000-0000-0000-0000-000000000002','DUP-B','999366','e3660000-0000-0000-0000-000000000001','2025-05-01 05:00+00','manual');
set role authenticated; select set_config('auth.user_id','b8030000-0000-0000-0000-000000000001',false);
do $$ declare j jsonb; begin
 begin perform 1 from public.unmatched_unit_independent_people; raise exception 'الوصول المباشر متاح'; exception when insufficient_privilege then null; end;
 j:=public.unmatched_unit_independent_candidate('DUP-B','999366');
 if j->>'employee_name'<>'الموظف المسجل' or j->>'device_user_name'<>'شخص مختلف' or (j->>'source_punch_count')::int<>1 then raise exception 'معاينة التكرار خاطئة %',j; end if;
 begin perform public.unmatched_unit_confirm_independent('DUP-B','999366'); raise exception 'HR بلا تعديل أكد';
 exception when others then if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if; end;
end $$;
select set_config('auth.user_id','b8030000-0000-0000-0000-000000000002',false);
select public.unmatched_unit_confirm_independent('DUP-B','999366');
select public.unmatched_unit_confirm_independent('DUP-C','999366');
select public.unmatched_unit_day_edit('DUP-C','999366','2025-05-03','leave',null,null,false,0);
-- التكرار لا يضيف سجلاً ثانياً أو لقطة جديدة.
select public.unmatched_unit_confirm_independent('DUP-B','999366');
reset role;
do $$ declare n int; begin
 select count(*) into n from public.unmatched_archive_punches where device_serial='DUP-B' and pin='999366';
 if n<>1 then raise exception 'نسخ البصمات القديمة خاطئ %',n; end if;
 select count(*) into n from public.unmatched_archive_punches where device_serial='DUP-A' and pin='999366';
 if n<>0 then raise exception 'نُسخ الجهاز الآخر دون تأكيد'; end if;
 select count(*) into n from public.biometric_punches where device_serial='DUP-B' and employee_id='e3660000-0000-0000-0000-000000000001';
 if n<>1 then raise exception 'تغير الربط الرسمي'; end if;
end $$;
-- البصمة الجديدة محفوظة في الاستقلال وفي الدفتر الرسمي، مع المحافظة على المصدر.
insert into public.biometric_punches(id,device_serial,pin,employee_id,punched_at,method) values
 ('c3660000-0000-0000-0000-000000000003','DUP-B','999366','e3660000-0000-0000-0000-000000000001','2025-05-01 13:00+00','manual');
-- إعادة سحب السجل نفسه لا تكرر الأرشيف أو الدفتر.
insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values
 ('DUP-B','999366','e3660000-0000-0000-0000-000000000001','2025-05-01 13:00+00','manual')
 on conflict (device_serial,pin,punched_at,direction) do nothing;
set role authenticated; select set_config('auth.user_id','b8030000-0000-0000-0000-000000000001',false);
do $$ declare r record; n int; begin
 -- تكافؤ المحركين للحالات القائمة: ليلي وحدّ 16 ساعة ومراجعة وإجازة وتوقيت وربط.
 select count(*) into n from public.unmatched_unit_daily_report('2025-05-01','2025-05-09',null,'DAILY-A') old
 join public.unmatched_unit_daily_report_v2('2025-05-01','2025-05-09',null,'DAILY-A') v using(device_serial,pin)
 where old.days is distinct from v.days or old.current_pin_linked is distinct from v.current_pin_linked;
 if n<>0 then raise exception 'اختلف المحرك الجديد عن الحالات اليومية السابقة'; end if;
 select count(*) into n from public.unmatched_unit_daily_report_v2('2025-05-09','2025-05-09',null,'ARC-D1',null,null,50,null,null,null,'811') where current_pin_linked and days->0->>'status'='unknown';
 if n<>1 then raise exception 'اليوم الخالي بعد ربط قديم ليس غير محدد'; end if;
 select * into r from public.unmatched_unit_daily_report_v2('2025-05-01','2025-05-02',null,'DUP-B',null,null,50,null,null,'شخص','999366');
 if r.pin<>'999366' or r.current_pin_linked or r.days->0->>'status'<>'present' or r.days->1->>'status'<>'absent' then raise exception 'الحساب المستقل خاطئ %',r; end if;
 select count(*) into n from public.unmatched_unit_daily_report_v2('2025-05-01','2025-05-02',null,'DUP-B',null,null,50,null,null,'خطأ','999366');
 if n<>0 then raise exception 'فلتر الاسم غير دقيق'; end if;
 select count(*) into n from public.unmatched_unit_daily_report_v2('2025-05-01','2025-05-02',null,'DUP-B',null,'absent',50,null,null,'شخص','999366');
 if n<>1 then raise exception 'فلتر الحالة غير دقيق'; end if;
 select count(*) into n from public.unmatched_unit_history_v2('DUP-B','999366') where action='independent' and actor_name='archive-it@test.invalid';
 if n<>1 then raise exception 'تدقيق تأكيد الرقم خاطئ %',n; end if;
 select count(*) into n from public.biometric_unmatched_archive_punches_range('DUP-B','999366','2025-05-01','2025-05-01');
 if n<>2 then raise exception 'البصمات المستقلة غير مكتملة %',n; end if;
 select count(*) into n from public.unmatched_unit_daily_report_v2('2025-05-01','2025-05-02',null,'DUP-C') where person_name='شخص بلا بصمة' and days->0->>'status'='absent';
 if n<>1 then raise exception 'الشخص المستقل بلا بصمات لم يظهر'; end if;
 select count(*) into n from public.unmatched_unit_daily_report_v2('2025-05-03','2025-05-03',null,'DUP-C') where days->0->>'status'='leave';
 if n<>1 then raise exception 'تعديل الشخص بلا بصمات لم يُحفظ'; end if;
 select count(*) into n from public.biometric_unmatched_archive_search(null,'DUP-C') where device_person_name='شخص بلا بصمة' and punch_count=0;
 if n<>1 then raise exception 'الأرشيف لم يعرض الشخص بلا بصمات'; end if;
 select count(*) into n from public.unmatched_unit_devices() where device_serial='DUP-C' and device_name='جهاز بلا بصمة';
 if n<>1 then raise exception 'قائمة الأجهزة ناقصة'; end if;
 select count(*) into n from public.unmatched_unit_daily_report_v2('2025-05-01','2025-05-02',null,'DUP-B',null,null,50,null,null,null,null,true);
 if n<>1 then raise exception 'فلتر الغياب أو النقص خاطئ'; end if;
end $$;
select set_config('auth.user_id','b8030000-0000-0000-0000-000000000003',false);
do $$ begin
 begin perform public.unmatched_unit_independent_candidate('DUP-B','999366'); raise exception 'الموظف قرأ';
 exception when others then if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if; end;
end $$;
reset role; select set_config('auth.user_id','',false);
