-- depends: tests/db/unmatched-unit-adjustments-test.sql
reset role; select set_config('auth.user_id','',false);
insert into public.biometric_devices(id,serial_number,name,is_active,timezone_offset) values
 ('d3650000-0000-0000-0000-000000000001','DAILY-A','جهاز أ',false,'+03:00'),
 ('d3650000-0000-0000-0000-000000000002','DAILY-B','جهاز ب',false,'+03:00'),
 ('d3650000-0000-0000-0000-000000000003','DAILY-TZ','جهاز منطقة متغيرة',false,'+14:00');
insert into public.biometric_device_users(device_serial,pin,name) values ('DAILY-A','301','ليلي'),('DAILY-B','301','آخر بنفس الرقم'),('DAILY-A','302','بلا بصمة'),('DAILY-A','303','حالات ملتبسة'),('DAILY-A','304','الحد الأعلى'),('DAILY-A','305','تعارض وقت');
insert into public.biometric_punches(device_serial,pin,punched_at,method) values
 ('DAILY-A','301','2025-05-01 13:00+00','manual'),('DAILY-A','301','2025-05-02 00:00+00','manual'),
 ('DAILY-A','301','2025-05-03 05:00+00','manual'),('DAILY-A','301','2025-05-03 13:00+00','manual'),
 ('DAILY-A','301','2025-05-04 05:00+00','manual'),
 ('DAILY-A','301','2025-05-06 05:00+00','manual'),('DAILY-A','301','2025-05-06 07:00+00','manual'),('DAILY-A','301','2025-05-06 13:00+00','manual'),
 ('DAILY-A','303','2025-05-01 11:00+00','manual'),('DAILY-A','303','2025-05-02 05:01+00','manual'),
 ('DAILY-A','304','2025-05-01 13:00+00','manual'),('DAILY-A','304','2025-05-02 05:00+00','manual');
insert into public.biometric_punches(device_serial,pin,punched_at,direction,method) values
 ('DAILY-A','305','2025-05-01 05:00+00','in','manual'),('DAILY-A','305','2025-05-01 05:00+00','out','manual');
insert into public.biometric_device_users(device_serial,pin,name) values ('DAILY-TZ','306','تغير المنطقة');
insert into public.biometric_punches(device_serial,pin,punched_at,method) values ('DAILY-TZ','306','2025-05-01 02:00+00','manual');
update public.biometric_devices set timezone_offset='-14:00' where serial_number='DAILY-TZ';
insert into public.biometric_punches(device_serial,pin,punched_at,method) values ('DAILY-TZ','306','2025-05-02 17:00+00','manual');
set role authenticated; select set_config('auth.user_id','b8030000-0000-0000-0000-000000000002',false);
do $$ declare r record; j jsonb; n int; begin
 select * into r from public.unmatched_unit_daily_report('2025-05-01','2025-05-09',null,'DAILY-A','301') where pin='301';
 if r.person_name<>'ليلي' or jsonb_array_length(r.days)<>9 then raise exception 'بيانات الشخص غير صحيحة %',r; end if;
 j:=r.days->0;
 if j->>'status'<>'present' or j->>'entry'<>'2025-05-01T16:00:00' or j->>'exit'<>'2025-05-02T03:00:00' then raise exception 'الإقران الليلي فشل %',j; end if;
 if r.days->1->>'status'<>'previous_exit' then raise exception 'خروج اليوم السابق غير واضح %',r.days->1; end if;
 if r.days->2->>'status'<>'present' then raise exception 'حضور يومي غير صحيح %',r.days->2; end if;
 if r.days->3->>'status'<>'missing' or r.days->3->>'entry' is not null or r.days->3->>'exit' is not null or r.days->3->>'raw_first'<>'2025-05-04T08:00:00' then raise exception 'الناقصة أو اتجاهها غير صحيح %',r.days->3; end if;
 if r.days->5->>'status'<>'review' or r.days->5->>'entry' is not null or r.days->5->>'exit' is not null then raise exception 'البصمات الزائدة ليست للمراجعة دون تخمين %',r.days->5; end if;
 if r.days->8->>'status'<>'absent' then raise exception 'الجمعة الخالية ليست غياباً %',r.days->8; end if;
 select * into r from public.unmatched_unit_daily_report('2025-05-01','2025-05-01',null,'DAILY-A','301') where pin='301';
 if r.days->0->>'exit'<>'2025-05-02T03:00:00' then raise exception 'لم يقرأ خروجاً خارج النطاق'; end if;
 select count(*) into n from public.unmatched_unit_daily_report('2025-05-01','2025-05-09',null,'DAILY-A','302') where pin='302' and days->0->>'status'='absent';
 if n<>1 then raise exception 'المعروف بلا بصمة لم يظهر'; end if;
 select count(*) into n from public.unmatched_unit_daily_report('2025-05-01','2025-05-01',null,null,'301') where pin='301';
 if n<>2 then raise exception 'الجهازان لم يستقلا %',n; end if;
 select * into r from public.unmatched_unit_daily_report('2025-05-01','2025-05-02',null,'DAILY-A','303') where pin='303';
 if r.days->0->>'status'<>'review' or r.days->1->>'status'<>'review' then raise exception 'أكثر من 16 ساعة ليست للمراجعة %',r.days; end if;
 select * into r from public.unmatched_unit_daily_report('2025-05-01','2025-05-01',null,'DAILY-TZ','306') where pin='306';
 if r.days->0->>'status'<>'review' then raise exception 'الفرق الحقيقي مع تغير المنطقة يحتاج مراجعة %',r.days; end if;
 select * into r from public.unmatched_unit_daily_report('2025-05-01','2025-05-01',null,'DAILY-A','304') where pin='304';
 if r.days->0->>'status'<>'present' or r.days->0->>'exit'<>'2025-05-02T08:00:00' then raise exception 'الحد 16 ساعة غير مقبول %',r.days; end if;
 select * into r from public.unmatched_unit_daily_report('2025-05-01','2025-05-01',null,'DAILY-A','305') where pin='305';
 if r.days->0->>'status'<>'review' or r.days->0->>'entry' is not null then raise exception 'بصمتان في الوقت نفسه ليستا للمراجعة %',r.days; end if;
 perform public.unmatched_unit_day_edit('DAILY-A','301','2025-05-02','leave',null,null,false,0);
 select * into r from public.unmatched_unit_daily_report('2025-05-01','2025-05-02',null,'DAILY-A','301') where pin='301';
 if r.days->0->>'status'<>'review' or r.days->0->>'exit' is not null or r.days->1->>'status'<>'leave' then raise exception 'التعديل المجاور تجاهل التعارض %',r.days; end if;
 perform public.unmatched_unit_day_edit('DAILY-A','301','2025-05-04','leave',null,null,false,0);
 select * into r from public.unmatched_unit_daily_report('2025-05-04','2025-05-04',null,'DAILY-A','301') where pin='301';
 if r.days->0->>'status'<>'leave' or (r.days->0->>'punch_count')::int<>1 then raise exception 'الإجازة أو الأصل %',r.days; end if;
 select count(*) into n from public.unmatched_unit_daily_report('2025-05-04','2025-05-04',null,'DAILY-A',null,'leave') where pin='301';
 if n<>1 then raise exception 'فلتر الحالة لا يعمل'; end if;
 select * into r from public.unmatched_unit_daily_report('2025-05-09','2025-05-09',null,'ARC-D1','811') where pin='811';
 if not r.current_pin_linked or r.days->0->>'status'<>'unknown' then raise exception 'غياب خاطئ بعد الربط %',r.days; end if;
 select * into r from public.unmatched_unit_daily_report(current_date+5,current_date+5,null,'DAILY-A','302') where pin='302';
 if r.days->0->>'status'<>'future' then raise exception 'اليوم المستقبلي ليس غياباً %',r.days; end if;
end $$;
select set_config('auth.user_id','b8030000-0000-0000-0000-000000000003',false);
do $$ begin
 begin perform public.unmatched_unit_daily_report('2025-05-01','2025-05-01'); raise exception 'الموظف العادي قرأ';
 exception when others then if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if; end;
end $$;
reset role; select set_config('auth.user_id','',false);
