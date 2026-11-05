-- 00403-ب: الأرشيف مستقل؛ الربط الرسمي يعمل كما هو؛ حقوق القراءة والصفحات.
reset role; select set_config('auth.user_id','',false);
insert into auth.users(id,email) values
 ('b8030000-0000-0000-0000-000000000001','archive-hr@test.invalid'),
 ('b8030000-0000-0000-0000-000000000002','archive-it@test.invalid'),
 ('b8030000-0000-0000-0000-000000000003','archive-emp@test.invalid');
insert into public.user_roles(user_id,role) values
 ('b8030000-0000-0000-0000-000000000001','hr_officer'),
 ('b8030000-0000-0000-0000-000000000002','it_admin'),
 ('b8030000-0000-0000-0000-000000000003','employee');
insert into public.biometric_devices(id,serial_number,name,is_active) values
 ('d8030000-0000-0000-0000-000000000001','ARC-D1','جهاز أول',false),
 ('d8030000-0000-0000-0000-000000000002','ARC-D2','جهاز ثان',false);
update public.biometric_devices set config='{"secret":"do-not-copy"}' where serial_number='ARC-D1';
-- معروف لم يبصم + ذات PIN في جهازين منفصلين
insert into public.biometric_device_users(device_serial,pin,name) values
 ('ARC-D1','811','اسم أول'), ('ARC-D2','811','اسم ثان'), ('ARC-D1','812',null);
update public.biometric_device_users set name='بلا بصمة' where device_serial='ARC-D1' and pin='812';
insert into public.biometric_punches(id,device_serial,pin,punched_at,direction,person_name,method,raw) values
 ('c8030000-0000-0000-0000-000000000001','ARC-D1','811','2025-05-01 13:00+00','unknown','اسم أول','manual','{"raw":"original"}'),
 ('c8030000-0000-0000-0000-000000000002','ARC-D1','811','2025-05-02 00:00+00','unknown','اسم أول','manual','{}'),
 ('c8030000-0000-0000-0000-000000000003','ARC-D2','811','2025-05-01 13:00+00','unknown','اسم ثان','manual','{}');
-- بصمتان بالوقت نفسه لكن اتجاهان مختلفان؛ التصفح لا يسقط إحداهما.
insert into public.biometric_punches(id,device_serial,pin,punched_at,direction,method) values
 ('c8030000-0000-0000-0000-000000000016','ARC-D1','813','2025-05-01 13:00+00','in','manual'),
 ('c8030000-0000-0000-0000-000000000017','ARC-D1','813','2025-05-01 13:00+00','out','manual');
-- حذف المصدر وإعادة سحب البصمة نفسها برقم مصدر جديد لا يضاعف الأرشيف.
insert into public.biometric_punches(id,device_serial,pin,punched_at,direction,method) values
 ('c8030000-0000-0000-0000-000000000014','ARC-D1','814','2025-05-01 13:00+00','unknown','manual');
delete from public.biometric_punches where id='c8030000-0000-0000-0000-000000000014';
insert into public.biometric_punches(id,device_serial,pin,punched_at,direction,method) values
 ('c8030000-0000-0000-0000-000000000015','ARC-D1','814','2025-05-01 13:00+00','unknown','manual');
do $$ declare n int; begin
  select count(*) into n from public.unmatched_archive_punches where device_serial='ARC-D1' and pin='814';
  if n<>1 then raise exception 'إعادة السحب ضاعفت البصمة %',n; end if;
end $$;
-- سحب مكرر لا يُنشئ لقطة جديدة.
insert into public.biometric_punches(device_serial,pin,punched_at,direction,method) values
 ('ARC-D1','811','2025-05-01 13:00+00','unknown','manual') on conflict do nothing;
insert into public.employees(id,employee_number,full_name,hire_date) values
 ('e8030000-0000-0000-0000-000000000001','ARC-EMP','موظف الأرشيف','2024-01-01');
set role authenticated;
select set_config('auth.user_id','b8030000-0000-0000-0000-000000000001',false);
select public.biometric_link_pin('811','e8030000-0000-0000-0000-000000000001');
reset role;
do $$ declare n int; j jsonb; begin
  select count(*) into n from public.biometric_punches where pin='811' and employee_id='e8030000-0000-0000-0000-000000000001';
  if n<>3 then raise exception 'الربط الرسمي لم ينقل البصمات القديمة: %',n; end if;
  select count(*) into n from public.unmatched_archive_punches where pin='811';
  if n<>3 then raise exception 'الأرشيف لا يحتوي 3 بصمات أصلية: %',n; end if;
  select original_punch into j from public.unmatched_archive_punches where source_punch_id='c8030000-0000-0000-0000-000000000001';
  if j->'raw'->>'raw'<>'original' or j->>'employee_id' is not null then raise exception 'لقطة البصمة لم تحتفظ بالأصل %',j; end if;
  if exists(select 1 from public.unmatched_archive_punches where original_device ? 'config') then raise exception 'نسخت إعدادات الجهاز السرية'; end if;
end $$;
-- تعديل المصدر وحذفه لا يمس الأصل المؤرشف. لا تعديل للحضور من الأرشيف.
update public.biometric_punches set person_name='اسم معدّل' where id='c8030000-0000-0000-0000-000000000001';
delete from public.biometric_punches where id='c8030000-0000-0000-0000-000000000003';
update public.biometric_device_users set name='اسم جديد' where device_serial='ARC-D1' and pin='811';
set role authenticated;
select set_config('auth.user_id','b8030000-0000-0000-0000-000000000001',false);
do $$ declare n int; j jsonb; a timestamptz; i uuid; begin
  select count(*) into n from public.biometric_unmatched_archive_people(500,0) where pin='811';
  if n<>2 then raise exception 'الرقم المكرر لم يبق شخصين في الأرشيف %',n; end if;
  select count(*) into n from public.biometric_unmatched_archive_people(500,0) where pin='812' and punch_count=0 and device_person_name='بلا بصمة';
  if n<>1 then raise exception 'مستخدم بلا بصمة غير محفوظ'; end if;
  select count(*) into n from public.biometric_unmatched_archive_punches('ARC-D1','811',500);
  if n<>2 then raise exception 'البصمات المؤرشفة غير مكتملة %',n; end if;
  select source_punch_id,punched_at,original_punch into i,a,j from public.biometric_unmatched_archive_punches('ARC-D1','811',1);
  if j->>'person_name'<>'اسم أول' or j->'raw'->>'raw'<>'original' then raise exception 'تغير الأصل في الأرشيف %',j; end if;
  select count(*) into n from public.biometric_unmatched_archive_punches('ARC-D1','811',1,a,i);
  if n<>1 then raise exception 'الصفحة الثانية غير صحيحة %',n; end if;
  select source_punch_id,punched_at into i,a from public.biometric_unmatched_archive_punches('ARC-D1','813',1);
  select count(*) into n from public.biometric_unmatched_archive_punches('ARC-D1','813',1,a,i);
  if n<>1 then raise exception 'الصفحة التالية أسقطت بصمة بالوقت نفسه'; end if;
  select count(*) into n from public.biometric_unmatched_archive_punches('ARC-D2','811',500);
  if n<>1 then raise exception 'حذف المصدر حذف الأرشيف'; end if;
  if has_table_privilege('authenticated','public.unmatched_archive_punches','insert') or has_table_privilege('authenticated','public.unmatched_archive_punches','select') then
    raise exception 'الجدول مكشوف مباشرة'; end if;
  begin perform public.biometric_unmatched_archive_punches('ARC-D1','811',1,now(),null); raise exception 'قبل مؤشراً ناقصاً';
  exception when others then if sqlerrm not like '%BIO_ARCHIVE_CURSOR_INVALID%' then raise; end if; end;
end $$;
select set_config('auth.user_id','b8030000-0000-0000-0000-000000000002',false);
do $$ begin perform public.biometric_unmatched_archive_people(); end $$;
select set_config('auth.user_id','b8030000-0000-0000-0000-000000000003',false);
do $$ begin
  begin perform public.biometric_unmatched_archive_people(); raise exception 'الموظف العادي قرأ الأرشيف';
  exception when others then if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if; end;
  begin perform public.biometric_unmatched_archive_punches('ARC-D1','811'); raise exception 'الموظف العادي قرأ البصمات';
  exception when others then if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if; end;
end $$;
reset role; select set_config('auth.user_id','',false);
select 'unmatched archive foundation ok' as result;
