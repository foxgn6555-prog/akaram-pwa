-- depends: tests/db/unmatched-archive-foundation-test.sql
reset role; select set_config('auth.user_id','',false);
insert into public.branches(id,name,code) values ('cb830000-0000-0000-0000-000000000001','فرع البحث','ARCH-BR');
insert into public.biometric_devices(id,serial_number,name,branch_id,is_active,timezone_offset) values
 ('d8300000-0000-0000-0000-000000000001','ZZ-SEARCH-A','جهاز البحث','cb830000-0000-0000-0000-000000000001',false,'+03:00'),
 ('d8300000-0000-0000-0000-000000000002','ZZ-SEARCH-B','جهاز آخر',null,false,'+00:00');
insert into public.biometric_device_users(device_serial,pin,name) values
 ('ZZ-SEARCH-A','001','أحمد البحث'),('ZZ-SEARCH-A','002','أحمد الثاني'),('ZZ-SEARCH-B','001','أحمد البحث');
insert into public.biometric_punches(id,device_serial,pin,punched_at,method) values
 ('c8300000-0000-0000-0000-000000000001','ZZ-SEARCH-A','001','2025-01-01 21:30+00','manual'),
 ('c8300000-0000-0000-0000-000000000002','ZZ-SEARCH-A','001','2025-01-02 21:30+00','manual');
insert into public.biometric_punches(id,device_serial,pin,punched_at,method) values ('c8300000-0000-0000-0000-000000000003','ZZ-NODEV','009','2025-01-01 21:30+00','manual');
set role authenticated; select set_config('auth.user_id','b8030000-0000-0000-0000-000000000001',false);
do $$ declare n int; a timestamptz; i uuid; begin
  select count(*) into n from public.biometric_unmatched_archive_search('أحمد','ZZ-SEARCH-A','cb830000-0000-0000-0000-000000000001',50,null,null);
  if n<>2 then raise exception 'فلتر الاسم والجهاز والفرع لا يعمل %',n; end if;
  select count(*) into n from public.biometric_unmatched_archive_search('أحمد','ZZ-SEARCH-B','cb830000-0000-0000-0000-000000000001',50,null,null);
  if n<>0 then raise exception 'الفرع لم يُحترم'; end if;
  select count(*) into n from public.biometric_unmatched_archive_search('البحث','ZZ-SEARCH-A',null,50,'ZZ-SEARCH-A','001') where pin='002';
  if n<>1 then raise exception 'مؤشر صفحة الأشخاص لا يعمل'; end if;
  select count(*) into n from public.biometric_unmatched_archive_punches_range('ZZ-NODEV','009','2025-01-01','2025-01-01');
  if n<>1 then raise exception 'الوقت المجهول لم يستخدم UTC'; end if;
  -- 21:30 UTC تعني 00:30 في اليوم التالي حسب توقيت جهاز +03.
  select count(*) into n from public.biometric_unmatched_archive_punches_range('ZZ-SEARCH-A','001','2025-01-02','2025-01-02');
  if n<>1 then raise exception 'فلتر التاريخ المحلي غير صحيح %',n; end if;
  select source_punch_id,punched_at into i,a from public.biometric_unmatched_archive_punches_range('ZZ-SEARCH-A','001',null,null,1);
  select count(*) into n from public.biometric_unmatched_archive_punches_range('ZZ-SEARCH-A','001',null,null,1,a,i);
  if n<>1 then raise exception 'تصفح البصمات غير صحيح'; end if;
  begin perform public.biometric_unmatched_archive_search(null,null,null,50,'ZZ-SEARCH-A',null); raise exception 'قُبل مؤشر ناقص';
  exception when others then if sqlerrm not like '%BIO_ARCHIVE_CURSOR_INVALID%' then raise; end if; end;
  begin perform public.biometric_unmatched_archive_punches_range('ZZ-SEARCH-A','001','2025-01-03','2025-01-01'); raise exception 'قُبل تاريخ معكوس';
  exception when others then if sqlerrm not like '%BIO_RANGE_INVALID%' then raise; end if; end;
end $$;
select set_config('auth.user_id','b8030000-0000-0000-0000-000000000003',false);
do $$ begin
  begin perform public.biometric_unmatched_archive_search(); raise exception 'سمح لموظف بقراءة الأرشيف';
  exception when others then if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if; end;
  begin perform public.biometric_unmatched_archive_punches_range('ZZ-SEARCH-A','001'); raise exception 'سمح بقراءة التفاصيل';
  exception when others then if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if; end;
end $$;
reset role; select set_config('auth.user_id','',false);
