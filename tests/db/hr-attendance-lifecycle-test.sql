-- تدقيق دورة حضور الموظف الكاملة (00177) — مستقل (بادئة lc). الشهر المرجعي = الشهر الماضي (مفتوح، غير مقفول).
-- يغطي: بصمة→حضور، تأخير مع السماح، خروج مبكر، بصمة ناقصة، غياب، لا غياب قبل نهاية الدوام/للمستقبل،
-- إجازة معتمدة قبل/بعد الغياب (مدفوعة/غير مدفوعة) وإلغاؤها، زمنية في البداية/المنتصف/النهاية،
-- تغيير الشفت بأثر رجعي، حدود التعيين/إنهاء الخدمة، التعديل اليدوي، الشفت الليلي، كشف المالية.
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('1c000000-0000-0000-0000-00000000000a', 'lc-hr@t.iq'), ('1c000000-0000-0000-0000-00000000000b', 'lc-mgr@t.iq'), ('1c000000-0000-0000-0000-00000000000c', 'lc-emp@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('1c000000-0000-0000-0000-00000000000a', 'hr_officer'), ('1c000000-0000-0000-0000-00000000000b', 'employee'), ('1c000000-0000-0000-0000-00000000000c', 'employee')
on conflict do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('1c000000-0000-0000-0000-0000000000d1', 'lc صباحي', '08:00', '16:00', 15, '{0,1,2,3,4,5,6}'),
  ('1c000000-0000-0000-0000-0000000000d2', 'lc مسائي', '14:00', '20:00', 10, '{0,1,2,3,4,5,6}'),
  ('1c000000-0000-0000-0000-0000000000d3', 'lc ليلي', '22:00', '06:00', 10, '{0,1,2,3,4,5,6}')
on conflict (name) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, biometric_pin) values
  ('1c000000-0000-0000-0000-0000000000e0', '1c000000-0000-0000-0000-00000000000b', 'LC-MGR', 'مدير الدورة', '2024-01-01', '7100')
on conflict (employee_number) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, biometric_pin, manager_id) values
  ('1c000000-0000-0000-0000-0000000000e1', '1c000000-0000-0000-0000-00000000000c', 'LC-EMP', 'موظف الدورة', '2024-01-01', '7101', '1c000000-0000-0000-0000-0000000000e0')
on conflict (employee_number) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('1c000000-0000-0000-0000-0000000000e1', '1c000000-0000-0000-0000-0000000000d1', '2024-01-01'),
  ('1c000000-0000-0000-0000-0000000000e0', '1c000000-0000-0000-0000-0000000000d1', '2024-01-01')
on conflict do nothing;
-- أداة: بصمة بتوقيت بغداد
create or replace function pg_temp.lc_punch(p_pin text, p_day date, p_time time) returns void language sql as $$
  insert into public.biometric_punches (device_serial, pin, employee_id, punched_at, method)
  select 'LC', p_pin, e.id, (p_day + p_time)::timestamp - interval '3 hours', 'manual' from public.employees e where e.biometric_pin = p_pin
$$;

select auth.set_test_user('1c000000-0000-0000-0000-00000000000a');

-- ── L1: الحالات الأساسية من البصمات مباشرة (بلا احتساب يدوي) ──
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := '1c000000-0000-0000-0000-0000000000e1'; a record; begin
  perform pg_temp.lc_punch('7101', m + 1, '07:55'); perform pg_temp.lc_punch('7101', m + 1, '16:05');     -- حاضر
  perform pg_temp.lc_punch('7101', m + 2, '08:10'); perform pg_temp.lc_punch('7101', m + 2, '16:00');     -- ضمن السماح (15) → حاضر
  perform pg_temp.lc_punch('7101', m + 3, '08:40'); perform pg_temp.lc_punch('7101', m + 3, '16:00');     -- متأخر 25 دقيقة بعد السماح
  perform pg_temp.lc_punch('7101', m + 4, '08:00'); perform pg_temp.lc_punch('7101', m + 4, '15:00');     -- خروج مبكر 60
  perform pg_temp.lc_punch('7101', m + 5, '08:00');                                                      -- بصمة ناقصة
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 1;
  assert a.status = 'present' and a.late_minutes = 0 and a.worked_minutes = 490 and a.proposed_deduction_days = 0, 'L1 حاضر: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 2;
  assert a.status = 'present' and a.late_minutes = 0, 'L1 ضمن السماح: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 3;
  assert a.status = 'late' and a.late_minutes = 25 and a.shortfall_minutes = 40, 'L1 متأخر: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 4;
  assert a.status = 'early_leave' and a.early_minutes = 60 and a.shortfall_minutes = 60 and a.deduction_reason is not null, 'L1 خروج مبكر: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 5;
  assert a.status = 'incomplete' and a.check_in is not null and a.check_out is null, 'L1 ناقصة: ' || row_to_json(a)::text;
  -- اليوم 6: لا بصمة → غياب عند الاحتساب (يوم ماضٍ)
  perform public.hr_attendance_evaluate(m + 6, m + 6, e);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 6;
  assert a.status = 'absent' and a.proposed_deduction_days = 1, 'L1 غياب: ' || row_to_json(a)::text;
  raise notice 'L1 ✅ حاضر/سماح/متأخر/مبكر/ناقصة/غياب من البصمات مباشرة';
end $$;

-- ── L2: لا غياب وهمي: اليوم قبل نهاية الدوام ولا المستقبل؛ والإجازة المعتمدة تُكتب للمستقبل ──
do $$ declare e uuid := '1c000000-0000-0000-0000-0000000000e1'; today date := app.hr_local_date(now()); a record; n int; t uuid; lid uuid; begin
  -- غداً وبعد غد: احتساب نطاق يشملهما لا يُنشئ غياباً
  perform public.hr_attendance_evaluate(today, today + 2, e);
  select count(*) into n from public.hr_attendance_days where employee_id = e and work_date between today + 1 and today + 2;
  assert n = 0, 'L2 أيام مستقبلية كُتبت غياباً: ' || n;
  -- اليوم: إن لم ينتهِ الدوام بعد (قبل 16:00 بغداد) → لا صف؛ إن انتهى → غياب (كلاهما صحيح بحسب الساعة)
  select count(*) into n from public.hr_attendance_days where employee_id = e and work_date = today;
  if now() < ((today + time '16:00')::timestamp - interval '3 hours') then
    assert n = 0, 'L2 اليوم قبل نهاية الدوام كُتب غياباً';
  else
    assert n = 1, 'L2 اليوم بعد نهاية الدوام لم يُكتب غياباً';
  end if;
  -- صف غياب تلقائي قديم خاطئ ليوم مستقبلي يُزال عند إعادة الاحتساب
  insert into public.hr_attendance_days (employee_id, work_date, status, source) values (e, today + 5, 'absent', 'auto') on conflict do nothing;
  perform app.hr_evaluate_day(e, today + 5);
  select count(*) into n from public.hr_attendance_days where employee_id = e and work_date = today + 5; assert n = 0, 'L2 الصف الوهمي لم يُزل';
  -- إجازة معتمدة مستقبلية تُكتب «إجازة» فوراً
  select id into t from public.hr_leave_types where code = 'annual';
  lid := public.hr_leave_request(e, t, today + 3, today + 4, null, null, 'مستقبلية');
  perform auth.set_test_user('1c000000-0000-0000-0000-00000000000b');
  perform public.hr_leave_decide(lid, true, 'موافق');
  perform auth.set_test_user('1c000000-0000-0000-0000-00000000000a');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = today + 3;
  assert a.status = 'leave', 'L2 إجازة مستقبلية: ' || coalesce(a.status, 'null');
  perform public.hr_leave_cancel(lid, 'تنظيف');
  select count(*) into n from public.hr_attendance_days where employee_id = e and work_date between today + 3 and today + 4;
  assert n = 0, 'L2 بعد إلغاء الإجازة المستقبلية بقي صف: ' || n;
  raise notice 'L2 ✅ لا غياب قبل نهاية الدوام ولا للمستقبل؛ الإجازة تُكتب مسبقاً وتُزال بإلغائها';
end $$;

-- ── L3: الإجازة بعد الغياب (مدفوعة → بلا استقطاع، غير مدفوعة → استقطاع يوم) وإلغاؤها يعيد الغياب ──
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := '1c000000-0000-0000-0000-0000000000e1'; a record; t uuid; lid uuid; begin
  perform public.hr_attendance_evaluate(m + 7, m + 8, e);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 7; assert a.status = 'absent', 'L3 قبل';
  select id into t from public.hr_leave_types where code = 'unpaid';
  lid := public.hr_leave_request(e, t, m + 7, m + 7, null, null, 'بدون راتب');
  perform auth.set_test_user('1c000000-0000-0000-0000-00000000000b'); perform public.hr_leave_decide(lid, true, 'موافق'); perform auth.set_test_user('1c000000-0000-0000-0000-00000000000a');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 7;
  assert a.status = 'leave' and a.proposed_deduction_days = 1 and a.deduction_reason like '%بدون راتب%' and a.shortfall_minutes = 0, 'L3 بدون راتب: ' || row_to_json(a)::text;
  select id into t from public.hr_leave_types where code = 'sick';
  lid := public.hr_leave_request(e, t, m + 8, m + 8, null, null, 'مرضية', 'docs/x.pdf');
  perform auth.set_test_user('1c000000-0000-0000-0000-00000000000b'); perform public.hr_leave_decide(lid, true, 'موافق'); perform auth.set_test_user('1c000000-0000-0000-0000-00000000000a');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 8;
  assert a.status = 'leave' and a.proposed_deduction_days = 0 and a.deduction_reason is null, 'L3 مرضية مدفوعة: ' || row_to_json(a)::text;
  perform public.hr_leave_cancel(lid, 'خطأ إدخال');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 8;
  assert a.status = 'absent' and a.proposed_deduction_days = 1, 'L3 بعد الإلغاء: ' || row_to_json(a)::text;
  raise notice 'L3 ✅ الإجازة تحكم اليوم بنوعها (مدفوعة/غير مدفوعة) وإلغاؤها يعيد الحقيقة';
end $$;

-- ── L4: الزمنية: في البداية تعذر التأخير، في النهاية تعذر الخروج المبكر، في المنتصف لا تعذر أياً منهما ──
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := '1c000000-0000-0000-0000-0000000000e1'; a record; t uuid; lid uuid; begin
  select id into t from public.hr_leave_types where code = 'permit_paid';
  -- يوم 10: زمنية 08:00→10:00 ثم حضر 09:50 وخرج 16:00 → زمنية بلا تأخير
  lid := public.hr_leave_request(e, t, m + 10, m + 10, '08:00', '10:00', 'بداية');
  perform auth.set_test_user('1c000000-0000-0000-0000-00000000000b'); perform public.hr_leave_decide(lid, true, 'ok'); perform auth.set_test_user('1c000000-0000-0000-0000-00000000000a');
  perform pg_temp.lc_punch('7101', m + 10, '09:50'); perform pg_temp.lc_punch('7101', m + 10, '16:00');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 10;
  assert a.status = 'time_permit' and a.late_minutes = 0 and a.permit_minutes = 120 and a.shortfall_minutes = 0 and a.proposed_deduction_days = 0, 'L4 بداية: ' || row_to_json(a)::text;
  -- يوم 11: زمنية 14:00→16:00 (نهاية) وحضر 08:00 وخرج 14:05 → زمنية بلا خروج مبكر
  lid := public.hr_leave_request(e, t, m + 11, m + 11, '14:00', '16:00', 'نهاية');
  perform auth.set_test_user('1c000000-0000-0000-0000-00000000000b'); perform public.hr_leave_decide(lid, true, 'ok'); perform auth.set_test_user('1c000000-0000-0000-0000-00000000000a');
  perform pg_temp.lc_punch('7101', m + 11, '08:00'); perform pg_temp.lc_punch('7101', m + 11, '14:05');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 11;
  assert a.status = 'time_permit' and a.early_minutes = 0 and a.shortfall_minutes = 0, 'L4 نهاية: ' || row_to_json(a)::text;
  -- يوم 12: زمنية 11:00→13:00 (منتصف) لكنه تأخر 09:00 وخرج 16:00 → يبقى «متأخر» 45 دقيقة (الزمنية لا تعذر التأخير)
  lid := public.hr_leave_request(e, t, m + 12, m + 12, '11:00', '13:00', 'منتصف');
  perform auth.set_test_user('1c000000-0000-0000-0000-00000000000b'); perform public.hr_leave_decide(lid, true, 'ok'); perform auth.set_test_user('1c000000-0000-0000-0000-00000000000a');
  perform pg_temp.lc_punch('7101', m + 12, '09:00'); perform pg_temp.lc_punch('7101', m + 12, '16:00');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 12;
  assert a.status = 'late' and a.late_minutes = 45 and a.permit_minutes = 120, 'L4 منتصف: ' || row_to_json(a)::text;
  -- يوم 13: زمنية في المنتصف وحضر في وقته → زمنية
  lid := public.hr_leave_request(e, t, m + 13, m + 13, '11:00', '12:00', 'منتصف2');
  perform auth.set_test_user('1c000000-0000-0000-0000-00000000000b'); perform public.hr_leave_decide(lid, true, 'ok'); perform auth.set_test_user('1c000000-0000-0000-0000-00000000000a');
  perform pg_temp.lc_punch('7101', m + 13, '08:00'); perform pg_temp.lc_punch('7101', m + 13, '16:00');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 13;
  assert a.status = 'time_permit' and a.late_minutes = 0, 'L4 منتصف في وقته: ' || row_to_json(a)::text;
  raise notice 'L4 ✅ الزمنية تعذر طرف الدوام الذي تغطيه فقط';
end $$;

-- ── L5: تغيير الشفت بأثر رجعي يعيد الاحتساب تلقائياً ──
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := '1c000000-0000-0000-0000-0000000000e1'; a record; begin
  -- يوم 15: بصم 14:05 و 19:58 — على الشفت الصباحي = متأخر جداً (365 دقيقة)
  perform pg_temp.lc_punch('7101', m + 15, '14:05'); perform pg_temp.lc_punch('7101', m + 15, '19:58');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 15; assert a.status = 'late', 'L5 قبل: ' || a.status;
  -- HR تنقله إلى المسائي من يوم 15 → اليوم يصبح حاضراً تلقائياً
  perform public.hr_employee_assign_shift(e, '1c000000-0000-0000-0000-0000000000d2', m + 15);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 15;
  -- خرج قبل دقيقتين (ضمن السماح 10) → حاضر لا «خروج مبكر»، مع حفظ الدقيقتين
  assert a.status = 'present' and a.shift_name = 'lc مسائي' and a.late_minutes = 0 and a.early_minutes = 2 and a.proposed_deduction_days = 0, 'L5 بعد: ' || row_to_json(a)::text;
  -- الأيام السابقة لتاريخ السريان لم تتأثر
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 3; assert a.status = 'late' and a.shift_name = 'lc صباحي', 'L5 قبل السريان تغيّر';
  -- إعادته صباحياً من أول الشهر التالي (تنظيف للفحوص اللاحقة)
  perform public.hr_employee_assign_shift(e, '1c000000-0000-0000-0000-0000000000d1', m + 16);
  raise notice 'L5 ✅ تغيير الشفت يعيد احتساب الأيام من تاريخ السريان';
end $$;

-- ── L6: الشفت الليلي: الدخول 22:05 والخروج 05:55 يُنسبان ليوم البداية؛ زمنية نهاية الليلي 04:00→06:00 ──
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := '1c000000-0000-0000-0000-0000000000e1'; a record; t uuid; lid uuid; n int; begin
  perform public.hr_employee_assign_shift(e, '1c000000-0000-0000-0000-0000000000d3', m + 18);
  perform pg_temp.lc_punch('7101', m + 18, '22:05'); perform pg_temp.lc_punch('7101', m + 19, '05:55');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 18;
  assert a.status = 'present' and a.worked_minutes = 470 and a.early_minutes = 5, 'L6 ليلي: ' || row_to_json(a)::text;
  select count(*) into n from public.hr_attendance_days where employee_id = e and work_date = m + 19 and status = 'incomplete'; assert n = 0, 'L6 اليوم التالي التقط الخروج كبصمة وحيدة';
  select id into t from public.hr_leave_types where code = 'permit_paid';
  lid := public.hr_leave_request(e, t, m + 20, m + 20, '04:00', '06:00', 'نهاية ليلي');
  perform auth.set_test_user('1c000000-0000-0000-0000-00000000000b'); perform public.hr_leave_decide(lid, true, 'ok'); perform auth.set_test_user('1c000000-0000-0000-0000-00000000000a');
  perform pg_temp.lc_punch('7101', m + 20, '22:00'); perform pg_temp.lc_punch('7101', m + 21, '04:02');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 20;
  assert a.status = 'time_permit' and a.early_minutes = 0, 'L6 زمنية نهاية الليلي: ' || row_to_json(a)::text;
  perform public.hr_employee_assign_shift(e, '1c000000-0000-0000-0000-0000000000d1', m + 22);
  raise notice 'L6 ✅ الليلي يُنسب ليوم البداية والزمنية بعد منتصف الليل تُحسب صحيحاً';
end $$;

-- ── L7: حدود التعيين وإنهاء الخدمة والتعديل اليدوي ──
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := '1c000000-0000-0000-0000-0000000000e1'; a record; n int; begin
  -- قبل تاريخ التعيين لا شيء
  update public.employees set hire_date = m + 1 where id = e;
  perform public.hr_attendance_evaluate(m, m, e);
  select count(*) into n from public.hr_attendance_days where employee_id = e and work_date = m; assert n = 0, 'L7 قبل التعيين';
  update public.employees set hire_date = '2024-01-01' where id = e;
  -- تعديل يدوي من غرفة العمليات يصمد أمام بصمة لاحقة
  update public.hr_attendance_days set source = 'manual', status = 'present', late_minutes = 0 where employee_id = e and work_date = m + 3;
  perform pg_temp.lc_punch('7101', m + 3, '12:00');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 3; assert a.status = 'present' and a.source = 'manual', 'L7 يدوي';
  -- إنهاء الخدمة في يوم 25: يوم 26 لا يُحتسب غياباً
  perform public.hr_employee_terminate(e, 'resignation', m + 25, 'استقالة');
  perform public.hr_attendance_evaluate(m + 24, m + 26, e);
  select count(*) into n from public.hr_attendance_days where employee_id = e and work_date = m + 26; assert n = 0, 'L7 بعد إنهاء الخدمة';
  select count(*) into n from public.hr_attendance_days where employee_id = e and work_date = m + 24 and status = 'absent'; assert n = 1, 'L7 قبل إنهاء الخدمة غياب';
  raise notice 'L7 ✅ حدود التعيين/الإنهاء والتعديل اليدوي';
end $$;

-- ── L8: كشف المالية الشهري يجمع الاستقطاعات المقترحة (غياب + بدون راتب + نقص) للموظف ──
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := '1c000000-0000-0000-0000-0000000000e1'; v_days numeric; v_sum numeric; begin
  select coalesce(sum(proposed_deduction_days), 0) into v_sum from public.hr_attendance_days where employee_id = e and work_date between m and (m + interval '1 month')::date - 1 and not deduction_waived;
  assert v_sum >= 3, 'L8 مجموع أيام الاستقطاع المقترحة: ' || v_sum;  -- غياب 6 + بدون راتب 7 + غياب 8 + 24 على الأقل
  raise notice 'L8 ✅ الاستقطاعات المقترحة مجمّعة: % يوم', v_sum;
end $$;
select 'hr-attendance-lifecycle ok' as result;
