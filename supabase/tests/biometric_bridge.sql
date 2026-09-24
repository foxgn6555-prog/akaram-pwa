-- 00141 · جسر الشبكة الداخلية zk_bridge: النمط، مفتاح الجهاز، المصادقة، الاستيراد بدور الخدمة، السجل
do $$
declare
  it1 uuid := '8b000000-0000-0000-0000-000000000001';
  hr1 uuid := '8b000000-0000-0000-0000-000000000002';
  e1 uuid; d1 uuid; k text; h text; got uuid;
  r record; n int; ts text; nm text;
begin
  insert into auth.users(id, email) values (it1, 'br-it@x.iq'), (hr1, 'br-hr@x.iq');
  insert into public.user_roles(user_id, role) values (it1, 'it_admin'), (hr1, 'hr_officer');
  insert into public.employees(employee_number, full_name, biometric_pin) values ('BR-7', 'موظف الجسر', '7') returning id into e1;

  -- ① zk_bridge مقبول بلا base_url؛ الأنماط القديمة ما زالت تتطلبه
  insert into public.biometric_devices(serial_number, name, mode) values ('BRIDGE-01', 'جهاز الجسر', 'zk_bridge') returning id into d1;
  begin
    insert into public.biometric_devices(serial_number, name, mode) values ('LAN-BAD', 'x', 'lan_pull');
    raise exception 'CONFIG_CHECK_MISSING';
  exception when check_violation then null;
  end;

  -- ② تدوير المفتاح: IT يعيد zkb_…؛ يُخزَّن مجزأً؛ HR ممنوع؛ جهاز غير جسر مرفوض
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', it1::text, false);
  select public.biometric_bridge_rotate_key(d1) into k;
  if k not like 'zkb_%' or length(k) < 40 then raise exception 'KEY_FORMAT_FAIL %', k; end if;
  select bridge_key_hash, bridge_key_prefix into h, nm from public.biometric_devices where id = d1;
  if h = k or h is null or nm <> left(k, 10) then raise exception 'KEY_HASH_FAIL'; end if;
  perform set_config('request.jwt.claim.sub', hr1::text, false);
  begin
    perform public.biometric_bridge_rotate_key(d1);
    raise exception 'KEY_HR_ALLOWED';
  exception when others then
    if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if;
  end;
  perform set_config('role', session_user::text, false);
  insert into public.biometric_devices(serial_number, name, mode) values ('ADMS-X', 'دفع', 'adms_push') returning id into got;
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', it1::text, false);
  begin
    perform public.biometric_bridge_rotate_key(got);
    raise exception 'KEY_MODE_ALLOWED';
  exception when others then
    if sqlerrm not like '%BIO_MODE_NOT_BRIDGE%' then raise; end if;
  end;
  perform set_config('role', session_user::text, false);

  -- ③ المصادقة
  if app.biometric_bridge_authenticate('BRIDGE-01', k) <> d1 then raise exception 'AUTH_OK_FAIL'; end if;
  if app.biometric_bridge_authenticate('BRIDGE-01', 'zkb_wrong') is not null then raise exception 'AUTH_WRONG_FAIL'; end if;
  if app.biometric_bridge_authenticate('BRIDGE-01', '') is not null then raise exception 'AUTH_EMPTY_FAIL'; end if;
  if app.biometric_bridge_authenticate('ADMS-X', k) is not null then raise exception 'AUTH_SERIAL_FAIL'; end if;
  update public.biometric_devices set is_active = false where id = d1;
  if app.biometric_bridge_authenticate('BRIDGE-01', k) is not null then raise exception 'AUTH_INACTIVE_FAIL'; end if;
  update public.biometric_devices set is_active = true where id = d1;

  -- ④ الاستيراد: وقت محلي بمنطقة الجهاز، الاسم من users، المطابقة بالـ PIN
  select * into r from app.biometric_bridge_import(d1,
    '[{"pin":"7","local":"2026-09-24 08:00:00"},{"pin":"55","local":"2026-09-24 08:05:00"}]'::jsonb,
    '[{"pin":"55","name":"زائر الجهاز","card":"9","privilege":"14"}]'::jsonb);
  if (r.received, r.inserted, r.duplicates, r.unmatched, r.users) <> (2, 2, 0, 1, 1) then
    raise exception 'IMPORT_COUNTS_FAIL % % % % %', r.received, r.inserted, r.duplicates, r.unmatched, r.users; end if;
  select punched_at::text into ts from public.biometric_punches where device_serial = 'BRIDGE-01' and pin = '7';
  if ts <> ('2026-09-24T05:00:00Z'::timestamptz)::text then raise exception 'IMPORT_TZ_FAIL %', ts; end if;
  select person_name into nm from public.biometric_punches where device_serial = 'BRIDGE-01' and pin = '55';
  if nm <> 'زائر الجهاز' then raise exception 'IMPORT_NAME_FAIL %', nm; end if;
  select employee_id into got from public.biometric_punches where device_serial = 'BRIDGE-01' and pin = '7';
  if got <> e1 then raise exception 'IMPORT_MATCH_FAIL'; end if;
  select privilege into n from public.biometric_device_users where device_serial = 'BRIDGE-01' and pin = '55';
  if n <> 14 then raise exception 'IMPORT_PRIV_FAIL %', n; end if;

  -- ⑤ إعادة الإرسال = تكرارات؛ ISO (at) مقبول؛ الاتجاه يُحفظ
  select * into r from app.biometric_bridge_import(d1,
    '[{"pin":"7","local":"2026-09-24 08:00:00"},{"pin":"7","at":"2026-09-24T14:00:00+03:00","direction":"out"}]'::jsonb);
  if (r.inserted, r.duplicates) <> (1, 1) then raise exception 'IMPORT_DUP_FAIL % %', r.inserted, r.duplicates; end if;
  select direction into nm from public.biometric_punches where device_serial = 'BRIDGE-01' and pin = '7' and punched_at = '2026-09-24T11:00:00Z';
  if nm <> 'out' then raise exception 'IMPORT_DIR_FAIL %', nm; end if;

  -- ⑥ حمولة فاسدة تُرفض
  begin
    perform app.biometric_bridge_import(d1, '[{"pin":"","local":"2026-09-24 08:00:00"}]'::jsonb);
    raise exception 'IMPORT_INVALID_ALLOWED';
  exception when others then
    if sqlerrm not like '%BIO_IMPORT_INVALID%' then raise; end if;
  end;

  -- ⑦ الفشل يُسجَّل على الجهاز وفي السجل؛ النجاح التالي يمسح الخطأ
  perform app.biometric_bridge_import(d1, '[]'::jsonb, '[]'::jsonb, 'ETIMEDOUT 192.168.1.201:4370');
  select bridge_last_error into nm from public.biometric_devices where id = d1;
  if nm <> 'ETIMEDOUT 192.168.1.201:4370' then raise exception 'ERR_RECORD_FAIL %', nm; end if;
  select count(*) into n from public.biometric_pulls where device_id = d1 and mode = 'zk_bridge';
  if n <> 3 then raise exception 'PULL_LOG_FAIL %', n; end if;
  select count(*) into n from public.biometric_pulls where device_id = d1 and status = 'failed';
  if n <> 1 then raise exception 'PULL_LOG_FAILED_FAIL %', n; end if;
  perform app.biometric_bridge_import(d1, '[{"pin":"7","local":"2026-09-25 08:00:00"}]'::jsonb);
  select bridge_last_error into nm from public.biometric_devices where id = d1;
  if nm is not null then raise exception 'ERR_CLEAR_FAIL'; end if;

  -- ⑧ الاشتقاق (HR): اليوم 24 للموظف يعطي دخول 08:00 وخروج 14:00 محلياً
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', hr1::text, false);
  perform public.biometric_attendance_derive('2026-09-24');
  perform set_config('role', session_user::text, false);
  select check_in::text, check_out::text into ts, nm from public.attendance_records where employee_id = e1 and work_date = '2026-09-24';
  if ts <> ('2026-09-24T05:00:00Z'::timestamptz)::text or nm <> ('2026-09-24T11:00:00Z'::timestamptz)::text then
    raise exception 'DERIVE_FAIL % %', ts, nm; end if;

  -- ⑨ الدوال الداخلية غير متاحة للمستخدمين
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', it1::text, false);
  begin
    perform app.biometric_bridge_import(d1, '[]'::jsonb);
    raise exception 'IMPORT_EXPOSED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.biometric_bridge_import_public(d1, '[]'::jsonb);
    raise exception 'IMPORT_PUBLIC_EXPOSED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.biometric_bridge_authenticate_public('BRIDGE-01', k);
    raise exception 'AUTH_PUBLIC_EXPOSED';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'service_role', false);
  if public.biometric_bridge_authenticate_public('BRIDGE-01', k) <> d1 then raise exception 'AUTH_PUBLIC_SR_FAIL'; end if;
  select * into r from public.biometric_bridge_import_public(d1, '[{"pin":"7","local":"2026-09-26 08:00:00"}]'::jsonb);
  if r.inserted <> 1 then raise exception 'IMPORT_PUBLIC_SR_FAIL'; end if;
  perform set_config('role', session_user::text, false);

  -- تنظيف
  delete from public.attendance_records where employee_id = e1;
  delete from public.biometric_punches where device_serial in ('BRIDGE-01', 'ADMS-X');
  delete from public.biometric_pulls where device_id = d1;
  delete from public.biometric_device_users where device_serial = 'BRIDGE-01';
  delete from public.biometric_devices where serial_number in ('BRIDGE-01', 'ADMS-X');
  delete from public.employees where id = e1;
  delete from public.user_roles where user_id in (it1, hr1);
  delete from auth.users where id in (it1, hr1);
  raise notice '✅ البصمة 00141: جسر الشبكة الداخلية (مفتاح/مصادقة/استيراد/سجل/اشتقاق) ناجح';
end $$;
