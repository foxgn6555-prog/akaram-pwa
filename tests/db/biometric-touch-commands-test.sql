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

-- ═══ 00173: اللمس بنوعه + التشخيص + أسماء قيود المفاتيح التي تعتمد عليها الواجهة (PGRST201) ═══
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'employees_department_id_fkey') then raise exception 'FAIL: اسم قيد employees_department_id_fkey غير موجود — الواجهة تعتمد عليه لفك غموض التضمين'; end if;
  if not exists (select 1 from pg_constraint where conname = 'hr_leaves_employee_id_fkey') then raise exception 'FAIL: اسم قيد hr_leaves_employee_id_fkey غير موجود'; end if;
end $$;
update public.biometric_devices set last_registered_at = null, last_heartbeat_at = null, heartbeat_count = 0 where serial_number = 'BT-DEV-1';
select public.biometric_touch('BT-DEV-1', 'register');
select public.biometric_touch('BT-DEV-1');
select public.biometric_touch('BT-DEV-1', 'heartbeat');
select public.biometric_log_register('BT-DEV-1', true);
do $$ declare d record; j jsonb; begin
  select * into d from public.biometric_devices where serial_number = 'BT-DEV-1';
  if d.last_registered_at is null or d.last_heartbeat_at is null or d.heartbeat_count <> 2 then raise exception 'FAIL: طوابع اللمس خاطئة: % % %', d.last_registered_at, d.last_heartbeat_at, d.heartbeat_count; end if;
  -- IT يقرأ التشخيص
  perform set_config('auth.user_id', 'b7000000-0000-0000-0000-00000000000b', false); perform set_config('auth.role', 'authenticated', false);
  j := public.biometric_device_diagnostics('dd000000-0000-0000-0000-0000000000c1');
  if (j->>'heartbeat_count')::int <> 2 then raise exception 'FAIL: heartbeat_count في التشخيص'; end if;
  if jsonb_array_length(j->'checks') <> 5 then raise exception 'FAIL: عدد الفحوصات % ', jsonb_array_length(j->'checks'); end if;
  if (select c->>'status' from jsonb_array_elements(j->'checks') c where c->>'key' = 'registered') <> 'ok' then raise exception 'FAIL: فحص التسجيل'; end if;
  if (select c->>'status' from jsonb_array_elements(j->'checks') c where c->>'key' = 'heartbeat') <> 'ok' then raise exception 'FAIL: فحص النبض'; end if;
  if (select c->>'status' from jsonb_array_elements(j->'checks') c where c->>'key' = 'unmatched') <> 'warn' then raise exception 'FAIL: فحص غير المطابَق (PIN 555 بلا موظف)'; end if;
  if not exists (select 1 from jsonb_array_elements(j->'events') e where e->>'endpoint' = 'adms/register') then raise exception 'FAIL: حدث التسجيل غير موجود في الأحداث'; end if;
  -- HR يقرأ أيضاً، والموظف لا
  perform set_config('auth.user_id', 'b7000000-0000-0000-0000-00000000000a', false);
  j := public.biometric_device_diagnostics('dd000000-0000-0000-0000-0000000000c1');
  perform set_config('auth.user_id', '', false);
  begin
    j := public.biometric_device_diagnostics('dd000000-0000-0000-0000-0000000000c1');
    raise exception 'FAIL: مجهول قرأ التشخيص';
  exception when others then if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if; end;
end $$;
select 'biometric-diagnostics ok' as result;
