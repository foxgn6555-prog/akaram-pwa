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
insert into auth.users (id, email) values ('b7000000-0000-0000-0000-00000000000b', 'it-bt@t.iq'), ('b7000000-0000-0000-0000-00000000000a', 'hr-bt@t.iq'), ('b7000000-0000-0000-0000-00000000000e', 'emp-bt@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('b7000000-0000-0000-0000-00000000000b', 'it_admin'), ('b7000000-0000-0000-0000-00000000000a', 'hr_officer'), ('b7000000-0000-0000-0000-00000000000e', 'employee') on conflict do nothing;
set role authenticated;
select set_config('auth.user_id','b7000000-0000-0000-0000-00000000000a', false); select set_config('auth.role','authenticated', false);
-- 00174: HR يستطيع أيضاً طلب الأسماء (وحدة السحب مشتركة)؛ الموظف العادي لا
select public.biometric_request_users('dd000000-0000-0000-0000-0000000000c1');
select set_config('auth.user_id','b7000000-0000-0000-0000-00000000000e', false);
do $$ begin
  perform public.biometric_request_users('dd000000-0000-0000-0000-0000000000c1');
  raise exception 'FAIL: موظف عادي استطاع طلب الأسماء';
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


-- ═══ 00174: طابور الأوامر العام — سحب فترة، إرسال موظف، تأكيد الجهاز، المهلة، الاكتشاف، العناوين ═══
reset role; select set_config('auth.user_id','', false);
insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin) values
  ('bb000000-0000-0000-0000-0000000000c5', 'BT-E5', 'أحمد علي حسين كاظم الربيعي', '2024-01-01', '555'),
  ('bb000000-0000-0000-0000-0000000000c6', 'BT-E6', 'موظف بلا رقم', '2024-01-01', null)
on conflict (employee_number) do nothing;
-- تنظيف الطابور من اختبارات 00172 ومن الإرسال التلقائي (00175) حتى نختبر الترتيب بدقة
update public.biometric_device_commands set status = 'done' where device_serial = 'BT-DEV-1' and status in ('queued', 'sent');

set role authenticated;
select set_config('auth.user_id','b7000000-0000-0000-0000-00000000000a', false); select set_config('auth.role','authenticated', false);
do $$ declare v_id bigint; v_cmd text; n int; begin
  -- ① سحب فترة: الأمر بتوقيت الجهاز (+03:00) وبصيغة ADMS
  v_id := public.biometric_query_attlog('dd000000-0000-0000-0000-0000000000c1', '2026-09-01T00:00:00Z', '2026-09-30T20:59:59Z');
  select command into v_cmd from public.biometric_device_commands where id = v_id;
  if v_cmd <> E'DATA QUERY ATTLOG StartTime=2026-09-01 03:00:00\tEndTime=2026-09-30 23:59:59' then raise exception 'FAIL: أمر السحب: %', v_cmd; end if;
  -- نفس الطلب مرتين → لا تكرار
  if public.biometric_query_attlog('dd000000-0000-0000-0000-0000000000c1', '2026-09-01T00:00:00Z', '2026-09-30T20:59:59Z') <> v_id then raise exception 'FAIL: تكرار أمر معلّق'; end if;
  -- فترة خاطئة / واسعة
  begin perform public.biometric_query_attlog('dd000000-0000-0000-0000-0000000000c1', '2026-09-30', '2026-09-01'); raise exception 'FAIL: قبل فترة معكوسة';
  exception when others then if sqlerrm not like '%BIO_RANGE_INVALID%' then raise; end if; end;
  begin perform public.biometric_query_attlog('dd000000-0000-0000-0000-0000000000c1', '2026-01-01', '2026-09-01'); raise exception 'FAIL: قبل فترة > 92 يوماً';
  exception when others then if sqlerrm not like '%BIO_RANGE_TOO_WIDE%' then raise; end if; end;

  -- ② إرسال موظف: سطر USERINFO صحيح؛ بلا PIN → خطأ واضح
  -- 00176: الإرسال إلى أجهزة مختارة فقط؛ بلا اختيار وبلا فرع للموظف → لا شيء
  n := public.biometric_push_employee('bb000000-0000-0000-0000-0000000000c5');
  if n <> 0 then raise exception 'FAIL: موظف بلا فرع أُرسل إلى % جهاز دون اختيار', n; end if;
  n := public.biometric_push_employee('bb000000-0000-0000-0000-0000000000c5', array['dd000000-0000-0000-0000-0000000000c1']::uuid[]);
  if n <> 1 then raise exception 'FAIL: عدد الأجهزة المستهدفة % ', n; end if;
  select command into v_cmd from public.biometric_device_commands where device_serial = 'BT-DEV-1' and kind = 'update_user' order by id desc limit 1;
  -- الاسم يُقصّ إلى 24 بايت (حدّ حقل Name في الجهاز) على حدود الأحرف: «أحمد علي حسين كاظم الربيعي» → «أحمد علي حسين»؛ بلا Passwd= حتى لا تُمسح كلمة مرور قائمة
  if v_cmd not like E'DATA UPDATE USERINFO PIN=555\tName=أحمد علي حسين\tPri=0\tCard=\tGrp=1\tTZ=0000000100000000' then raise exception 'FAIL: سطر USERINFO: %', v_cmd; end if;

  begin perform public.biometric_push_employee('bb000000-0000-0000-0000-0000000000c6', array['dd000000-0000-0000-0000-0000000000c1']::uuid[]); raise exception 'FAIL: قبل موظفاً بلا رقم بصمة';
  exception when others then if sqlerrm not like '%BIO_PIN_REQUIRED%' then raise; end if; end;
  -- حذف مستخدم
  perform public.biometric_delete_device_user('dd000000-0000-0000-0000-0000000000c1', '555');
  -- قائمة الأوامر تُرى
  select count(*) into n from public.biometric_commands_list('dd000000-0000-0000-0000-0000000000c1', 50);
  if n < 3 then raise exception 'FAIL: قائمة الأوامر % ', n; end if;
end $$;
-- IT يرى طلب السحب في سجل العمليات
select set_config('auth.user_id','b7000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if not exists (select 1 from public.biometric_pulls where device_id = 'dd000000-0000-0000-0000-0000000000c1' and mode = 'adms_query') then raise exception 'FAIL: لم يُسجَّل طلب السحب في سجل العمليات'; end if;
end $$;
-- موظف عادي لا يرى القائمة ولا يرسل
select set_config('auth.user_id','b7000000-0000-0000-0000-00000000000e', false);
do $$ declare n int; begin
  select count(*) into n from public.biometric_commands_list('dd000000-0000-0000-0000-0000000000c1', 50);
  if n <> 0 then raise exception 'FAIL: موظف عادي رأى الأوامر'; end if;
  begin perform public.biometric_push_employee('bb000000-0000-0000-0000-0000000000c5', array['dd000000-0000-0000-0000-0000000000c1']::uuid[]); raise exception 'FAIL: موظف عادي أرسل أمراً';
  exception when others then if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if; end;
end $$;
reset role; select set_config('auth.user_id','', false);

-- ③ تسليم الأوامر بالترتيب وتأكيدها من الجهاز
do $$ declare c1 text; c2 text; v_id bigint; st text; begin
  c1 := public.biometric_command_next('BT-DEV-1');
  if c1 not like 'C:%:DATA QUERY ATTLOG%' then raise exception 'FAIL: أول أمر مُسلَّم ليس السحب: %', c1; end if;
  v_id := split_part(c1, ':', 2)::bigint;
  select status into st from public.biometric_device_commands where id = v_id;
  if st <> 'sent' then raise exception 'FAIL: الحالة بعد التسليم %', st; end if;
  perform public.biometric_command_ack('BT-DEV-1', v_id, 0, 'DATA');
  select status into st from public.biometric_device_commands where id = v_id;
  if st <> 'done' then raise exception 'FAIL: الحالة بعد التأكيد %', st; end if;
  c2 := public.biometric_command_next('BT-DEV-1');
  if c2 not like 'C:%:DATA UPDATE USERINFO PIN=555%' then raise exception 'FAIL: الأمر الثاني: %', c2; end if;
  v_id := split_part(c2, ':', 2)::bigint;
  perform public.biometric_command_ack('BT-DEV-1', v_id, -1, 'DATA');
  select status into st from public.biometric_device_commands where id = v_id;
  if st <> 'failed' then raise exception 'FAIL: رفض الجهاز لم يُسجَّل كفشل %', st; end if;
  -- تأكيد بـ SN مختلف لا يؤثر
  perform public.biometric_command_next('BT-DEV-1'); -- يسلّم DELETE
  select id into v_id from public.biometric_device_commands where device_serial = 'BT-DEV-1' and status = 'sent' order by id desc limit 1;
  perform public.biometric_command_ack('OTHER-SN', v_id, 0, 'DATA');
  select status into st from public.biometric_device_commands where id = v_id;
  if st <> 'sent' then raise exception 'FAIL: تأكيد من جهاز آخر غيّر الحالة'; end if;
  -- المهلة: أمر مُرسل منذ 31 دقيقة بلا تأكيد → فاشل عند النبضة التالية
  update public.biometric_device_commands set sent_at = now() - interval '31 minutes' where id = v_id;
  perform public.biometric_command_next('BT-DEV-1');
  select status, note into st, c1 from public.biometric_device_commands where id = v_id;
  if st <> 'failed' or c1 <> 'TIMEOUT_NO_ACK' then raise exception 'FAIL: المهلة لم تُطبَّق % %', st, c1; end if;
end $$;

-- ④ اكتمال طلب السحب عند وصول بصمات adms
do $$ declare r record; n int; begin
  insert into public.biometric_punches (device_serial, device_id, pin, punched_at, direction, method)
  values ('BT-DEV-1', 'dd000000-0000-0000-0000-0000000000c1', '555', '2026-09-10T05:00:00Z', 'in', 'adms_push');
  select * into r from public.biometric_pulls where device_id = 'dd000000-0000-0000-0000-0000000000c1' and mode = 'adms_query' order by started_at desc limit 1;
  if r.status <> 'success' or r.inserted <> 1 or r.finished_at is null then raise exception 'FAIL: سجل السحب لم يكتمل: % %', r.status, r.inserted; end if;
  if (select count(*) from public.biometric_pulls where device_id = 'dd000000-0000-0000-0000-0000000000c1' and mode = 'adms_query') <> 1 then raise exception 'FAIL: تكرر سجل السحب'; end if;
end $$;

-- ⑤ اكتشاف الأجهزة غير المسجّلة
select public.biometric_log_register('NEW-BRANCH-9', false);
select public.biometric_log_register('NEW-BRANCH-9', false);
select public.biometric_log_register('BT-DEV-1', true);
set role authenticated;
select set_config('auth.user_id','b7000000-0000-0000-0000-00000000000b', false); select set_config('auth.role','authenticated', false);
do $$ declare r record; n int; begin
  select * into r from public.biometric_unregistered_devices() where serial_number = 'NEW-BRANCH-9';
  if r.serial_number is null or r.attempts <> 2 then raise exception 'FAIL: الاكتشاف: %', r; end if;
  if exists (select 1 from public.biometric_unregistered_devices() where serial_number = 'BT-DEV-1') then raise exception 'FAIL: جهاز مسجّل ظهر كغير مسجّل'; end if;
  -- ⑥ عناوين الخوادم: IT يضيف، HR يقرأ فقط
  insert into public.biometric_adms_endpoints (label, host, sort_order) values ('وسيط Cloudflare', 'akaram-bio.example.workers.dev', 1);
  select count(*) into n from public.biometric_adms_endpoints; if n <> 1 then raise exception 'FAIL: IT لم يستطع إضافة عنوان'; end if;
end $$;
select set_config('auth.user_id','b7000000-0000-0000-0000-00000000000a', false);
do $$ declare n int; begin
  select count(*) into n from public.biometric_adms_endpoints; if n <> 1 then raise exception 'FAIL: HR لا يرى العناوين'; end if;
  begin insert into public.biometric_adms_endpoints (label, host) values ('x', 'x.example'); raise exception 'FAIL: HR أضاف عنواناً';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role; select set_config('auth.user_id','', false);
-- 00176: مستخدم معروف على الجهاز بصلاحية مسؤول وبطاقة → الإرسال يحافظ على صلاحيته وبطاقته (لا يُسقط مسؤول الجهاز)
reset role; select set_config('auth.user_id','', false);
insert into public.biometric_device_users (device_serial, pin, name, card, privilege) values ('BT-DEV-1', '555', 'x', '12345', 14) on conflict (device_serial, pin) do update set privilege = 14, card = '12345';
set role authenticated;
select set_config('auth.user_id','b7000000-0000-0000-0000-00000000000a', false); select set_config('auth.role','authenticated', false);
do $$ declare v_cmd text; begin
  perform public.biometric_push_employee('bb000000-0000-0000-0000-0000000000c5', array['dd000000-0000-0000-0000-0000000000c1']::uuid[]);
  select command into v_cmd from public.biometric_device_commands where device_serial = 'BT-DEV-1' and kind = 'update_user' order by id desc limit 1;
  if v_cmd not like E'%\tPri=14\tCard=12345\t%' then raise exception 'FAIL: صلاحية المسؤول لم تُحفظ: %', v_cmd; end if;
end $$;
reset role; select set_config('auth.user_id','', false);
delete from public.biometric_device_users where device_serial = 'BT-DEV-1' and pin = '555';
-- 00176: تعيين مسؤول على الجهاز (IT فقط) → Pri=14
set role authenticated;
select set_config('auth.user_id','b7000000-0000-0000-0000-00000000000b', false); select set_config('auth.role','authenticated', false);
do $$ declare v_id bigint; v_cmd text; begin
  v_id := public.biometric_set_device_admin('dd000000-0000-0000-0000-0000000000c1', '1', 'المدير');
  select command into v_cmd from public.biometric_device_commands where id = v_id;
  if v_cmd <> E'DATA UPDATE USERINFO PIN=1\tName=المدير\tPri=14\tCard=\tGrp=1\tTZ=0000000100000000' then raise exception 'FAIL: أمر المسؤول: %', v_cmd; end if;
end $$;
select set_config('auth.user_id','b7000000-0000-0000-0000-00000000000a', false);
do $$ begin
  perform public.biometric_set_device_admin('dd000000-0000-0000-0000-0000000000c1', '1'); raise exception 'FAIL: HR عيّن مسؤولاً على الجهاز';
exception when others then if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if; end $$;
reset role; select set_config('auth.user_id','', false);
select 'biometric-commands-00174 ok' as result;
