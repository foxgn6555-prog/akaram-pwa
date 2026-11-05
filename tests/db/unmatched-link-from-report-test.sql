-- depends: tests/db/unmatched-archive-foundation-test.sql
reset role; select set_config('auth.user_id','',false);
insert into public.biometric_devices(id,serial_number,name,is_active,timezone_offset) values
 ('d3670000-0000-0000-0000-000000000001','LINK-OLD-A','جهاز أ',false,'+03:00'),
 ('d3670000-0000-0000-0000-000000000002','LINK-OLD-B','جهاز ب',false,'+03:00');
insert into public.biometric_device_users(device_serial,pin,name) values
 ('LINK-OLD-A','PIN367','شخص أول'),('LINK-OLD-B','PIN367','شخص أول'),('LINK-OLD-A','EMPTY367','شخص بلا بصمات');
insert into public.employees(id,employee_number,full_name,hire_date) values
 ('e3670000-0000-0000-0000-000000000001','EMP367A','الموظف الأول','2024-01-01'),
 ('e3670000-0000-0000-0000-000000000002','EMP367B','الموظف الثاني','2024-01-01');
insert into public.biometric_punches(id,device_serial,pin,punched_at,method) values
 ('c3670000-0000-0000-0000-000000000001','LINK-OLD-A','PIN367','2025-05-01 05:00+00','manual'),
 ('c3670000-0000-0000-0000-000000000002','LINK-OLD-B','PIN367','2025-05-01 06:00+00','manual');
set role authenticated; select set_config('auth.user_id','b8030000-0000-0000-0000-000000000001',false);
-- استدعاء الربط الرسمي نفسه الذي تستخدمه الشاشة، دون الاعتماد على بصمات اليوم.
select public.biometric_link_pin('PIN367','e3670000-0000-0000-0000-000000000001');
select public.biometric_link_pin('EMPTY367','e3670000-0000-0000-0000-000000000002');
do $$ declare n int; begin
 select count(*) into n from public.unmatched_unit_daily_report_v2('2025-05-01','2025-05-01',null,'LINK-OLD-A',null,null,50,null,null,null,'EMPTY367');
 if n<>1 then raise exception 'اختفى الشخص الذي لم يبصم من الأرشيف بعد ربطه'; end if;
end $$;
reset role;
do $$ declare n int; begin
 select count(*) into n from public.biometric_punches where pin='PIN367' and employee_id='e3670000-0000-0000-0000-000000000001';
 if n<>2 then raise exception 'الربط الرسمي لم يحتفظ بربط الجهازين والبصمات السابقة'; end if;
 select count(*) into n from public.unmatched_archive_punches where pin='PIN367';
 if n<>2 then raise exception 'تغير الأرشيف الأصلي عند الربط'; end if;
 select count(*) into n from public.employees where id='e3670000-0000-0000-0000-000000000002' and biometric_pin='EMPTY367';
 if n<>1 then raise exception 'الربط بلا بصمة لم يتم'; end if;
end $$;
