-- 00139 · البصمة: مصادر قابلة للتوصيل (ADMS دفع + API تطبيق + شبكة داخلية + عام)
--         دفتر موحّد + تكرار + مطابقة PIN + ربط رجعي + اشتقاق حضور + سجل عمليات + صلاحيات.
do $$
declare
  it1 uuid := '89000000-0000-0000-0000-000000000001';
  hr1 uuid := '89000000-0000-0000-0000-000000000002';
  x1  uuid := '89000000-0000-0000-0000-000000000003';
  e1 uuid; e2 uuid; e3 uuid;
  d_adms uuid; d_api uuid; d_lan uuid; d_off uuid;
  n bigint; n2 bigint; ci timestamptz; co timestamptz; st text;
  r record;
begin
  insert into auth.users(id, email) values
    (it1, 'bio-it@x.iq'), (hr1, 'bio-hr@x.iq'), (x1, 'bio-out@x.iq');
  insert into public.user_roles(user_id, role) values (it1, 'it_admin'), (hr1, 'hr_officer');

  insert into public.employees(employee_number, full_name) values ('7001', 'أحمد بصمة') returning id into e1;
  insert into public.employees(employee_number, full_name) values ('7002', 'سارة بصمة') returning id into e2;
  insert into public.employees(employee_number, full_name, biometric_pin) values ('7003', 'كرار بصمة', '555') returning id into e3;

  -- ① تسجيل المصادر (IT) بالأنماط الأربعة + قيد التهيئة
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', it1::text, false);
  insert into public.biometric_devices(serial_number, name, mode)
    values ('ADMS-001', 'جهاز الباب الرئيسي', 'adms_push') returning id into d_adms;
  insert into public.biometric_devices(serial_number, name, mode, config)
    values ('API-001', 'تطبيق البصمة المشترك', 'app_api_pull',
            '{"base_url":"https://vendor.example/api","api_key":"k"}') returning id into d_api;
  insert into public.biometric_devices(serial_number, name, mode, config)
    values ('LAN-001', 'جهاز الشبكة الداخلية', 'lan_pull',
            '{"base_url":"http://192.168.1.50"}') returning id into d_lan;
  insert into public.biometric_devices(serial_number, name, mode, config, is_active)
    values ('OFF-001', 'جهاز معطل', 'generic_pull',
            '{"base_url":"http://x","path":"/p","mapping":{}}', false) returning id into d_off;
  begin
    insert into public.biometric_devices(serial_number, name, mode) values ('BAD-1', 'بلا رابط', 'app_api_pull');
    raise exception 'BIO_CONFIG_CHECK_MISSING';
  exception when check_violation then null;
  end;
  begin
    insert into public.biometric_devices(serial_number, name, mode) values ('BAD-2', 'نمط غير معروف', 'ftp');
    raise exception 'BIO_MODE_CHECK_MISSING';
  exception when check_violation then null;
  end;

  -- ② الطريقة 1: سحب من API تطبيق آخر → الاستيراد الموحّد
  select * into r from public.biometric_import_punches(d_api, jsonb_build_array(
    jsonb_build_object('pin', '7001', 'at', '2026-09-20T08:02:00+03:00', 'direction', 'in',  'name', 'أحمد'),
    jsonb_build_object('pin', '7001', 'at', '2026-09-20T15:31:00+03:00', 'direction', 'out'),
    jsonb_build_object('pin', '555',  'at', '2026-09-20T08:10:00+03:00', 'direction', 'in'),
    jsonb_build_object('pin', '9999', 'at', '2026-09-20T08:11:00+03:00', 'direction', 'in', 'name', 'مجهول')
  ), null);
  if r.received <> 4 or r.inserted <> 4 or r.duplicates <> 0 or r.unmatched <> 1 then
    raise exception 'BIO_IMPORT_COUNTS_FAIL % % % %', r.received, r.inserted, r.duplicates, r.unmatched;
  end if;
  -- مطابقة عبر biometric_pin (555 → كرار) وعبر الرقم الوظيفي (7001 → أحمد)
  select count(*) into n from public.biometric_punches where pin = '555' and employee_id = e3;
  if n <> 1 then raise exception 'BIO_PIN_MATCH_FAIL'; end if;
  select count(*) into n from public.biometric_punches where pin = '7001' and employee_id = e1;
  if n <> 2 then raise exception 'BIO_EMPNO_MATCH_FAIL'; end if;
  select method into st from public.biometric_punches where pin = '555';
  if st <> 'app_api_pull' then raise exception 'BIO_METHOD_FAIL %', st; end if;

  -- ③ إعادة السحب نفسه = تكرار كامل بلا إدراج (idempotent)
  select * into r from public.biometric_import_punches(d_api, jsonb_build_array(
    jsonb_build_object('pin', '7001', 'at', '2026-09-20T08:02:00+03:00', 'direction', 'in'),
    jsonb_build_object('pin', '7001', 'at', '2026-09-20T15:31:00+03:00', 'direction', 'out')
  ), null);
  if r.inserted <> 0 or r.duplicates <> 2 then raise exception 'BIO_DEDUP_FAIL % %', r.inserted, r.duplicates; end if;

  -- ④ الطريقة 2 (شبكة داخلية): نفس المستورد، ودفتر بنمط lan_pull + وقت بصيغة الجهاز
  select * into r from public.biometric_import_punches(d_lan, jsonb_build_array(
    jsonb_build_object('pin', '7002', 'at', '2026-09-20 07:55:00+03', 'direction', 'unknown'),
    jsonb_build_object('pin', '7002', 'at', '2026-09-20 16:05:00+03', 'direction', 'unknown')
  ), 'lan_pull');
  if r.inserted <> 2 then raise exception 'BIO_LAN_IMPORT_FAIL'; end if;

  -- ⑤ الطريقة 2 (ADMS دفع): الدفعات الخام (يكتبها المستقبل بدور الخدمة) تُعالَج إلى الدفتر
  perform set_config('role', session_user::text, false);
  insert into public.biometric_pushes(device_sn, table_name, raw_payload, parsed_ok)
    values ('ADMS-001', 'ATTLOG', '7001	2026-09-21 08:00:00	0	1', true),
           ('ADMS-001', 'ATTLOG', '7001	2026-09-21 15:00:00	1	1', true),
           ('ADMS-001', 'ATTLOG', '8888	2026-09-21 08:00:00	0	1', false),
           ('ADMS-001', 'ATTLOG', 'garbage', false);
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', it1::text, false);
  select public.biometric_process_pushes(100) into n;
  if n <> 3 then raise exception 'BIO_PROCESS_PUSHES_FAIL %', n; end if;
  select count(*) into n from public.biometric_pushes where ledger_at is null and table_name = 'ATTLOG';
  if n <> 0 then raise exception 'BIO_PUSH_MARK_FAIL %', n; end if;
  select public.biometric_process_pushes(100) into n;
  if n <> 0 then raise exception 'BIO_PROCESS_IDEMPOTENT_FAIL %', n; end if;
  select direction into st from public.biometric_punches where pin = '7001' and punched_at = '2026-09-21 15:00:00+00';
  if st <> 'out' then raise exception 'BIO_ADMS_DIRECTION_FAIL %', st; end if;

  -- ⑤ب مستقبل ADMS المُصلَّح: سطر مشوّه لا يُسقط الدفعة + الدفتر يُكتب فوراً + biometric_pin يُطابَق
  perform set_config('role', session_user::text, false);
  select public.biometric_ingest('ADMS-001',
    E'555 2026-09-22 08:00:00 0 1\ngarbage\n7002 2026-09-22 08:05:00 0 1\n7002 2026-09-22 15:05:00 1 1\n7002 2026-09-22 bad 1 1',
    'ATTLOG') into n;
  if n <> 3 then raise exception 'BIO_INGEST_RESILIENT_FAIL %', n; end if;
  select count(*) into n from public.biometric_punches where device_serial = 'ADMS-001' and punched_at::date = '2026-09-22';
  if n <> 3 then raise exception 'BIO_INGEST_LEDGER_FAIL %', n; end if;
  select count(*) into n from public.biometric_punches where pin = '555' and punched_at::date = '2026-09-22' and employee_id = e3 and method = 'adms_push';
  if n <> 1 then raise exception 'BIO_INGEST_PIN_FAIL %', n; end if;
  select count(*) into n from public.biometric_pushes where device_sn = 'ADMS-001' and error_note = 'BAD_TIMESTAMP';
  if n <> 2 then raise exception 'BIO_INGEST_BADLINES_FAIL %', n; end if;
  -- الدفعات التي كتبها ingest معلَّمة كمعالَجة → لا تُكرَّر عبر process_pushes
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', it1::text, false);
  select public.biometric_process_pushes(100) into n;
  if n <> 0 then raise exception 'BIO_INGEST_NO_DOUBLE_FAIL %', n; end if;
  -- سجل الحضور القديم (00026) ما زال يعمل: سارة 22/9 دخول+خروج
  perform set_config('role', session_user::text, false);
  select check_in, check_out into ci, co from public.attendance_records where employee_id = e2 and work_date = '2026-09-22';
  if ci is null or co is null then raise exception 'BIO_INGEST_ATTENDANCE_FAIL'; end if;
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', it1::text, false);

  -- ⑥ التحقق من المدخلات: جهاز معطل / غير موجود / سجل ناقص / وقت فاسد
  begin
    perform public.biometric_import_punches(d_off, '[{"pin":"1","at":"2026-01-01T00:00:00Z"}]'::jsonb, null);
    raise exception 'BIO_INACTIVE_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_DEVICE_INACTIVE%' then raise; end if;
  end;
  begin
    perform public.biometric_import_punches(gen_random_uuid(), '[]'::jsonb, null);
    raise exception 'BIO_MISSING_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_DEVICE_NOT_FOUND%' then raise; end if;
  end;
  begin
    perform public.biometric_import_punches(d_api, '[{"at":"2026-01-01T00:00:00Z"}]'::jsonb, null);
    raise exception 'BIO_NOPIN_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_IMPORT_INVALID%' then raise; end if;
  end;
  begin
    perform public.biometric_import_punches(d_api, '[{"pin":"1","at":"not-a-time"}]'::jsonb, null);
    raise exception 'BIO_BADTIME_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_IMPORT_INVALID%' then raise; end if;
  end;
  begin
    perform public.biometric_import_punches(d_api, '{"pin":"1"}'::jsonb, null);
    raise exception 'BIO_NONARRAY_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_IMPORT_INVALID%' then raise; end if;
  end;

  -- ⑦ سجل العمليات (IT): 3 عمليات استيراد ناجحة/جزئية بالعدادات الصحيحة
  select count(*) into n from public.biometric_pulls_list(null, 50);
  if n <> 3 then raise exception 'BIO_PULLS_COUNT_FAIL %', n; end if;
  select count(*) into n from public.biometric_pulls_list(d_api, 50) p where p.status = 'partial' and p.duplicates = 2;
  if n <> 1 then raise exception 'BIO_PULLS_PARTIAL_FAIL %', n; end if;
  select count(*) into n from public.biometric_pulls_list(d_api, 50) p where p.status = 'success' and p.unmatched = 1 and p.triggered_by = it1;
  if n <> 1 then raise exception 'BIO_PULLS_SUCCESS_FAIL %', n; end if;

  -- ⑧ HR: الدفتر بالفلاتر + غير المطابَقين فقط
  perform set_config('request.jwt.claim.sub', hr1::text, false);
  select count(*) into n from public.biometric_punches_list('2026-09-20', '2026-09-20', null, null, false, 300);
  if n <> 6 then raise exception 'BIO_LIST_DAY_FAIL %', n; end if;
  -- (نطاق الأجهزة الخاصة بالاختبار فقط — اختبارات سابقة تترك بصمات أجهزتها في الدفتر)
  select count(*) into n from public.biometric_punches_list('2026-09-01', '2026-09-30', null, null, true, 300);
  if n <> 2 then raise exception 'BIO_LIST_UNMATCHED_FAIL %', n; end if;
  select count(*) into n from public.biometric_punches_list(null, null, '555', null, false, 300) l where l.employee_name = 'كرار بصمة';
  if n <> 2 then raise exception 'BIO_LIST_PIN_NAME_FAIL %', n; end if;
  select count(*) into n from public.biometric_punches_list(null, null, null, d_lan, false, 300);
  if n <> 2 then raise exception 'BIO_LIST_DEVICE_FAIL %', n; end if;

  -- ⑨ HR: ربط PIN مجهول بموظف → تعبئة رجعية + منع الازدواج
  perform public.biometric_link_pin('9999', e2);
  select count(*) into n from public.biometric_punches where pin = '9999' and employee_id = e2;
  if n < 1 then raise exception 'BIO_LINK_BACKFILL_FAIL'; end if;
  begin
    perform public.biometric_link_pin('9999', e1);
    raise exception 'BIO_PIN_TAKEN_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_PIN_TAKEN%' then raise; end if;
  end;
  begin
    perform public.biometric_link_pin('  ', e1);
    raise exception 'BIO_PIN_EMPTY_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_PIN_INVALID%' then raise; end if;
  end;
  begin
    perform public.biometric_link_pin('1234', gen_random_uuid());
    raise exception 'BIO_LINK_NOEMP_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_EMPLOYEE_NOT_FOUND%' then raise; end if;
  end;
  -- بعد الربط: قائمة غير المطابَقين تنقص إلى 1 (8888 فقط) — والتعبئة الرجعية شملت كل بصمات 9999 القديمة أيضاً
  select count(*) into n from public.biometric_punches_list('2026-09-01', '2026-09-30', null, null, true, 300);
  if n <> 1 then raise exception 'BIO_UNMATCHED_AFTER_LINK_FAIL %', n; end if;
  select count(*) into n from public.biometric_punches where pin = '9999' and employee_id is null;
  if n <> 0 then raise exception 'BIO_BACKFILL_ALL_FAIL %', n; end if;

  -- ⑩ HR: اشتقاق الحضور ليوم 2026-09-20
  select public.biometric_attendance_derive('2026-09-20') into n;
  if n <> 3 then raise exception 'BIO_DERIVE_COUNT_FAIL %', n; end if;
  -- أحمد: in/out صريحان
  select check_in, check_out, status into ci, co, st from public.attendance_records where employee_id = e1 and work_date = '2026-09-20';
  if ci <> '2026-09-20T08:02:00+03:00'::timestamptz or co <> '2026-09-20T15:31:00+03:00'::timestamptz or st <> 'present' then
    raise exception 'BIO_DERIVE_E1_FAIL % % %', ci, co, st;
  end if;
  -- سارة: دخول صريح 08:11 (9999) + مجهولان 07:55 و16:05 → الدخول = الأبكر 07:55، الخروج = الأخير 16:05
  select check_in, check_out into ci, co from public.attendance_records where employee_id = e2 and work_date = '2026-09-20';
  if ci <> '2026-09-20 07:55:00+03'::timestamptz or co <> '2026-09-20 16:05:00+03'::timestamptz then
    raise exception 'BIO_DERIVE_E2_FAIL % %', ci, co;
  end if;
  -- كرار: دخول فقط بلا خروج
  select check_in, check_out into ci, co from public.attendance_records where employee_id = e3 and work_date = '2026-09-20';
  if ci is null or co is not null then raise exception 'BIO_DERIVE_E3_FAIL'; end if;
  -- إعادة الاشتقاق = مستقرة (idempotent) ولا تكسر قيد الوقت
  select public.biometric_attendance_derive('2026-09-20') into n2;
  if n2 <> n then raise exception 'BIO_DERIVE_IDEMPOTENT_FAIL % %', n, n2; end if;
  -- بصمة خروج متأخرة تأتي لاحقاً (سحب ثانٍ) → الاشتقاق يوسّع الخروج ولا يغيّر الدخول
  perform set_config('request.jwt.claim.sub', it1::text, false);
  perform public.biometric_import_punches(d_api, jsonb_build_array(
    jsonb_build_object('pin', '555', 'at', '2026-09-20T17:00:00+03:00', 'direction', 'out')), null);
  perform set_config('request.jwt.claim.sub', hr1::text, false);
  perform public.biometric_attendance_derive('2026-09-20');
  select check_in, check_out into ci, co from public.attendance_records where employee_id = e3 and work_date = '2026-09-20';
  if ci <> '2026-09-20T08:10:00+03:00'::timestamptz or co <> '2026-09-20T17:00:00+03:00'::timestamptz then
    raise exception 'BIO_DERIVE_EXTEND_FAIL % %', ci, co;
  end if;
  -- بصمة مجهولة وحيدة في اليوم → دخول فقط بلا خروج (لا نختلق خروجاً)
  perform set_config('request.jwt.claim.sub', it1::text, false);
  perform public.biometric_import_punches(d_lan, jsonb_build_array(
    jsonb_build_object('pin', '7002', 'at', '2026-09-23T07:50:00+03:00', 'direction', 'unknown')), null);
  perform set_config('request.jwt.claim.sub', hr1::text, false);
  select public.biometric_attendance_derive('2026-09-23') into n;
  if n <> 1 then raise exception 'BIO_DERIVE_SINGLE_COUNT_FAIL %', n; end if;
  select check_in, check_out into ci, co from public.attendance_records where employee_id = e2 and work_date = '2026-09-23';
  if ci <> '2026-09-23T07:50:00+03:00'::timestamptz or co is not null then raise exception 'BIO_DERIVE_SINGLE_FAIL % %', ci, co; end if;

  -- يوم بلا بصمات = 0 ؛ تاريخ فارغ = خطأ
  select public.biometric_attendance_derive('2020-01-01') into n;
  if n <> 0 then raise exception 'BIO_DERIVE_EMPTY_FAIL %', n; end if;
  begin
    perform public.biometric_attendance_derive(null);
    raise exception 'BIO_DERIVE_NULL_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_DATE_INVALID%' then raise; end if;
  end;

  -- ⑪ فصل الصلاحيات: HR لا يستورد ولا يرى سجل العمليات التقني؛ IT لا يربط ولا يشتق؛ الغريب محجوب كلياً
  begin
    perform public.biometric_import_punches(d_api, '[]'::jsonb, null);
    raise exception 'BIO_HR_IMPORT_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_FORBIDDEN%' then raise; end if;
  end;
  begin
    perform public.biometric_pulls_list(null, 10);
    raise exception 'BIO_HR_PULLS_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_FORBIDDEN%' then raise; end if;
  end;
  begin
    perform public.biometric_process_pushes(10);
    raise exception 'BIO_HR_PROCESS_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_FORBIDDEN%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', it1::text, false);
  begin
    perform public.biometric_link_pin('1', e1);
    raise exception 'BIO_IT_LINK_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_FORBIDDEN%' then raise; end if;
  end;
  begin
    perform public.biometric_attendance_derive('2026-09-20');
    raise exception 'BIO_IT_DERIVE_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_FORBIDDEN%' then raise; end if;
  end;
  select count(*) into n from public.biometric_punches_list(null, null, null, null, false, 10);
  if n < 1 then raise exception 'BIO_IT_LIST_FAIL'; end if;
  perform set_config('request.jwt.claim.sub', x1::text, false);
  begin
    perform public.biometric_punches_list(null, null, null, null, false, 10);
    raise exception 'BIO_OUTSIDER_LIST_ACCEPTED';
  exception when others then if SQLERRM not like '%BIO_FORBIDDEN%' then raise; end if;
  end;
  select count(*) into n from public.biometric_punches;
  if n <> 0 then raise exception 'BIO_RLS_PUNCHES_LEAK %', n; end if;
  select count(*) into n from public.biometric_pulls;
  if n <> 0 then raise exception 'BIO_RLS_PULLS_LEAK %', n; end if;

  perform set_config('role', session_user::text, false);
  delete from public.attendance_records where employee_id in (e1, e2, e3);
  delete from public.biometric_punches where device_id in (d_adms, d_api, d_lan, d_off) or device_serial in ('ADMS-001','API-001','LAN-001');
  delete from public.biometric_pulls where device_id in (d_adms, d_api, d_lan, d_off);
  delete from public.biometric_pushes where device_sn = 'ADMS-001';
  delete from public.biometric_devices where id in (d_adms, d_api, d_lan, d_off);
  delete from public.employees where id in (e1, e2, e3);
  delete from public.user_roles where user_id in (it1, hr1);
  delete from auth.users where id in (it1, hr1, x1);
  raise notice '✅ البصمة 00139: أنماط/استيراد/تكرار/ADMS/مطابقة/ربط/اشتقاق/سجل/صلاحيات ناجحة';
end $$;
