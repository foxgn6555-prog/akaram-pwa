-- 00140 · البصمة: وقت الجهاز المحلي يُفسَّر بمنطقته (بغداد +03:00) + صيغة TAB الحقيقية + OPERLOG أسماء + الدفعات المتراكمة
do $$
declare
  it1 uuid := '8a000000-0000-0000-0000-000000000001';
  hr1 uuid := '8a000000-0000-0000-0000-000000000002';
  e1 uuid; d1 uuid; d2 uuid;
  n bigint; ts timestamptz; ci timestamptz; wd date; nm text;
begin
  insert into auth.users(id, email) values (it1, 'tz-it@x.iq'), (hr1, 'tz-hr@x.iq');
  insert into public.user_roles(user_id, role) values (it1, 'it_admin'), (hr1, 'hr_officer');
  insert into public.employees(employee_number, full_name) values ('8101', 'ليث توقيت') returning id into e1;

  -- ① الافتراضي +03:00 وقيد التنسيق
  insert into public.biometric_devices(serial_number, name) values ('TZ-BGW', 'جهاز بغداد') returning id into d1;
  select timezone_offset into nm from public.biometric_devices where id = d1;
  if nm <> '+03:00' then raise exception 'TZ_DEFAULT_FAIL %', nm; end if;
  begin
    insert into public.biometric_devices(serial_number, name, timezone_offset) values ('TZ-BAD', 'x', '3');
    raise exception 'TZ_CHECK_MISSING';
  exception when check_violation then null;
  end;
  insert into public.biometric_devices(serial_number, name, timezone_offset) values ('TZ-DXB', 'جهاز دبي', '+04:00') returning id into d2;

  -- ② الدالة المساعدة
  if app.biometric_local_to_ts('2026-09-24 08:00:00', '+03:00') <> '2026-09-24T05:00:00Z'::timestamptz then raise exception 'TZ_CONV_FAIL'; end if;
  if app.biometric_local_to_ts('2026-09-24 08:00:00', '+04:00') <> '2026-09-24T04:00:00Z'::timestamptz then raise exception 'TZ_CONV_DXB_FAIL'; end if;
  if app.biometric_local_to_ts('garbage', '+03:00') is not null then raise exception 'TZ_CONV_BAD_FAIL'; end if;
  if app.biometric_local_to_ts(null, '+03:00') is not null then raise exception 'TZ_CONV_NULL_FAIL'; end if;

  -- ③ OPERLOG الحقيقي من الجهاز: أسماء المستخدمين
  select public.biometric_ingest('TZ-BGW',
    E'USER PIN=8101\tName=Laith T\tPri=0\tPasswd=\tCard=123\tGrp=1\tTZ=0000000100000000\nUSER PIN=8102\tName=Ghost User\tPri=14\nOPLOG 4\t0\t2026-09-24 07:00:00\t0\t0\t0\t0',
    'OPERLOG') into n;
  if n <> 2 then raise exception 'OPERLOG_USERS_FAIL %', n; end if;
  select name, privilege into nm, n from public.biometric_device_users where device_serial = 'TZ-BGW' and pin = '8102';
  if nm <> 'Ghost User' or n <> 14 then raise exception 'OPERLOG_PARSE_FAIL % %', nm, n; end if;

  -- ④ ATTLOG بصيغة TAB الحقيقية (PIN\tوقت\tحالة\tتحقق\tworkcode…) والوقت محلي بغداد
  select public.biometric_ingest('TZ-BGW',
    E'8101\t2026-09-24 08:00:00\t0\t15\t\t0\t0\t\t\t43\n8102\t2026-09-24 08:05:30\t0\t1\n8101\t2026-09-24 16:10:00\t1\t15',
    'ATTLOG') into n;
  if n <> 2 then raise exception 'ATTLOG_TAB_COUNT_FAIL %', n; end if;
  select punched_at into ts from public.biometric_punches where device_serial = 'TZ-BGW' and pin = '8101' and direction = 'in';
  if ts <> '2026-09-24T05:00:00Z'::timestamptz then raise exception 'ATTLOG_TZ_FAIL % (expected 05:00Z)', ts; end if;
  -- سجل الحضور: التاريخ محلي والدخول 05:00Z
  select check_in, work_date into ci, wd from public.attendance_records where employee_id = e1 and work_date = '2026-09-24';
  if ci <> '2026-09-24T05:00:00Z'::timestamptz or wd <> '2026-09-24' then raise exception 'ATTENDANCE_TZ_FAIL % %', ci, wd; end if;
  -- اسم الجهاز يُرفق بالبصمة غير المطابَقة
  select person_name into nm from public.biometric_punches where device_serial = 'TZ-BGW' and pin = '8102';
  if nm <> 'Ghost User' then raise exception 'PUNCH_NAME_FAIL %', nm; end if;

  -- ⑤ بصمة قرب منتصف الليل: 00:30 بغداد = 21:30Z اليوم السابق — لكن تاريخ الحضور يبقى يوم الجهاز
  select public.biometric_ingest('TZ-BGW', E'8101\t2026-09-25 00:30:00\t0\t1', 'ATTLOG') into n;
  select work_date into wd from public.attendance_records where employee_id = e1 and check_in = '2026-09-24T21:30:00Z'::timestamptz;
  if wd <> '2026-09-25' then raise exception 'MIDNIGHT_DATE_FAIL %', wd; end if;

  -- ⑥ جهاز بمنطقة مختلفة (+04:00) يُفسَّر بمنطقته هو
  select public.biometric_ingest('TZ-DXB', E'8101\t2026-09-24 09:00:00\t0\t1', 'ATTLOG') into n;
  select punched_at into ts from public.biometric_punches where device_serial = 'TZ-DXB' and pin = '8101';
  if ts <> '2026-09-24T05:00:00Z'::timestamptz then raise exception 'DXB_TZ_FAIL %', ts; end if;

  -- ⑦ الصيغة القديمة بالمسافات ما زالت مقبولة (توافق round2)
  select public.biometric_ingest('TZ-BGW', '8101 2026-09-26 08:00:00 0 15', 'ATTLOG') into n;
  if n <> 1 then raise exception 'SPACE_FORMAT_FAIL %', n; end if;
  select punched_at into ts from public.biometric_punches where device_serial = 'TZ-BGW' and pin = '8101' and punched_at::date = '2026-09-26';
  if ts <> '2026-09-26T05:00:00Z'::timestamptz then raise exception 'SPACE_TZ_FAIL %', ts; end if;

  -- ⑧ الدفعات المتراكمة (قبل 00139) تُعالَج بمنطقة الجهاز + بالاسم
  insert into public.biometric_pushes(device_sn, table_name, raw_payload, parsed_ok)
    values ('TZ-BGW', 'ATTLOG', E'8102\t2026-09-20 08:00:00\t0\t1', false);
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', it1::text, false);
  select public.biometric_process_pushes(100) into n;
  if n <> 1 then raise exception 'BACKLOG_COUNT_FAIL %', n; end if;
  perform set_config('role', session_user::text, false);
  select punched_at, person_name into ts, nm from public.biometric_punches where device_serial = 'TZ-BGW' and pin = '8102' and punched_at::date = '2026-09-20';
  if ts <> '2026-09-20T05:00:00Z'::timestamptz or nm <> 'Ghost User' then raise exception 'BACKLOG_TZ_NAME_FAIL % %', ts, nm; end if;

  -- ⑨ HR: الدفتر يعرض اسم الجهاز لغير المطابَق + قائمة مستخدمي الجهاز مع اقتراح الموظف
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', hr1::text, false);
  select count(*) into n from public.biometric_punches_list('2026-09-24', '2026-09-24', '8102', d1, true, 10) l where l.device_user_name = 'Ghost User';
  if n <> 1 then raise exception 'LIST_DEVICE_NAME_FAIL %', n; end if;
  select count(*) into n from public.biometric_device_users_list('Laith', 10) u where u.employee_id = e1;
  if n <> 1 then raise exception 'USERS_LIST_SUGGEST_FAIL %', n; end if;
  select count(*) into n from public.biometric_device_users_list('8102', 10) u where u.employee_id is null;
  if n <> 1 then raise exception 'USERS_LIST_UNMATCHED_FAIL %', n; end if;

  perform set_config('role', session_user::text, false);
  delete from public.attendance_records where employee_id = e1;
  delete from public.biometric_punches where device_serial in ('TZ-BGW', 'TZ-DXB');
  delete from public.biometric_pulls where device_id in (d1, d2);
  delete from public.biometric_pushes where device_sn in ('TZ-BGW', 'TZ-DXB');
  delete from public.biometric_device_users where device_serial in ('TZ-BGW', 'TZ-DXB');
  delete from public.biometric_devices where id in (d1, d2);
  delete from public.employees where id = e1;
  delete from public.user_roles where user_id in (it1, hr1);
  delete from auth.users where id in (it1, hr1);
  raise notice '✅ البصمة 00140: منطقة الجهاز/TAB/OPERLOG/منتصف الليل/الدفعات المتراكمة ناجحة';
end $$;
