-- اختبار 00172: الغلاف العام biometric_touch يحدّث آخر اتصال؛ طابور أوامر USERINFO (أولي، تلقائي عند PIN بلا اسم، خنق 12 ساعة، طلب يدوي من IT)
set client_min_messages = notice;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active, mode)
values ('dd000000-0000-0000-0000-0000000000c1', 'BT-DEV-1', 'جهاز اختبار اللمس', '+03:00', true, 'adms_push')
on conflict (serial_number) do nothing;
update public.biometric_devices set last_seen_at = now() - interval '1 day' where serial_number = 'BT-DEV-1';

-- ① اللمس العام
select public.biometric_touch('BT-DEV-1');
do $$ begin
  if (select last_seen_at from public.biometric_devices where serial_number = 'BT-DEV-1') < now() - interval '1 minute'
  then raise exception 'FAIL: public.biometric_touch لم يحدّث last_seen_at'; end if;
end $$;

-- ② أول نبضة: طلب أولي معلّق (users_query_requested=true افتراضياً) → أمر USERINFO
do $$ declare c text; begin
  c := public.biometric_command_next('BT-DEV-1');
  if c is null or c not like 'C:%:DATA QUERY USERINFO' then raise exception 'FAIL: الأمر الأولي لم يُرسل: %', c; end if;
  c := public.biometric_command_next('BT-DEV-1');
  if c is not null then raise exception 'FAIL: الأمر تكرر في النبضة التالية: %', c; end if;
end $$;

-- ③ بصمة بـ PIN بلا اسم + مضى أكثر من 12 ساعة → يُطلب تلقائياً مرة واحدة
insert into public.biometric_punches (device_serial, pin, punched_at, direction, method)
values ('BT-DEV-1', '555', now() - interval '1 hour', 'in', 'adms_push');
update public.biometric_devices set users_queried_at = now() - interval '13 hours' where serial_number = 'BT-DEV-1';
do $$ declare c text; begin
  c := public.biometric_command_next('BT-DEV-1');
  if c is null then raise exception 'FAIL: لم يُطلب USERINFO تلقائياً رغم PIN بلا اسم'; end if;
  c := public.biometric_command_next('BT-DEV-1');
  if c is not null then raise exception 'FAIL: الخنق 12 ساعة لا يعمل'; end if;
end $$;

-- ④ بعد وصول الاسم من الجهاز لا حاجة للطلب حتى بعد 12 ساعة
insert into public.biometric_device_users (device_serial, pin, name, updated_at) values ('BT-DEV-1', '555', 'موظف خمسة', now())
on conflict (device_serial, pin) do update set name = excluded.name;
update public.biometric_devices set users_queried_at = now() - interval '2 days' where serial_number = 'BT-DEV-1';
do $$ declare c text; begin
  c := public.biometric_command_next('BT-DEV-1');
  if c is not null then raise exception 'FAIL: طُلب USERINFO رغم أن كل الأسماء معروفة: %', c; end if;
end $$;

-- ⑤ طلب يدوي: IT فقط
insert into auth.users (id, email) values ('b7000000-0000-0000-0000-00000000000b', 'it-bt@t.iq'), ('b7000000-0000-0000-0000-00000000000a', 'hr-bt@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('b7000000-0000-0000-0000-00000000000b', 'it_admin'), ('b7000000-0000-0000-0000-00000000000a', 'hr_officer') on conflict do nothing;
set role authenticated;
select set_config('auth.user_id','b7000000-0000-0000-0000-00000000000a', false); select set_config('auth.role','authenticated', false);
do $$ begin
  perform public.biometric_request_users('dd000000-0000-0000-0000-0000000000c1');
  raise exception 'FAIL: HR استطاع طلب الأسماء';
exception when others then
  if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if;
end $$;
select set_config('auth.user_id','b7000000-0000-0000-0000-00000000000b', false);
select public.biometric_request_users('dd000000-0000-0000-0000-0000000000c1');
reset role; select set_config('auth.user_id','', false);
do $$ declare c text; begin
  c := public.biometric_command_next('BT-DEV-1');
  if c is null then raise exception 'FAIL: الطلب اليدوي لم يُرسل الأمر'; end if;
end $$;
-- جهاز غير معروف → null بلا خطأ
do $$ begin if public.biometric_command_next('NO-SUCH') is not null then raise exception 'FAIL: جهاز مجهول أعاد أمراً'; end if; end $$;
select 'biometric-touch-commands ok' as result;
