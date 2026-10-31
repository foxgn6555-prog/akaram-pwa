-- 00399-ب — تسلسل واقعي: تعديل جماعي ← موافقة ← إعادة بصمة ← إلغاء، وقفل واعتماد حضورية.
insert into auth.users(id,email) values ('39920000-0000-0000-0000-000000000001','leave-priority@test.invalid');
insert into public.user_roles(user_id,role) values ('39920000-0000-0000-0000-000000000001','super_admin');
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values
 ('39920000-0000-0000-0000-000000000002','LP-1','اختبار الإجازة الأول','2024-01-01','399201'),
 ('39920000-0000-0000-0000-000000000003','LP-2','اختبار الإجازة الثاني','2024-01-01','399202');
insert into public.hr_shifts(id,name,start_time,end_time,grace_minutes,work_days) values
 ('39920000-0000-0000-0000-000000000004','اختبار الأولوية','16:00','22:00',0,'{0,1,2,3,4,5,6}');
insert into public.employee_shift_assignments(employee_id,shift_id,effective_from)
select e,'39920000-0000-0000-0000-000000000004'::uuid,'2024-01-01' from unnest(array['39920000-0000-0000-0000-000000000002','39920000-0000-0000-0000-000000000003']::uuid[]) e;
select auth.set_test_user('39920000-0000-0000-0000-000000000001');
do $$ declare m date := (date_trunc('month',current_date)-interval '2 months')::date; d date := m+10;
 e uuid := '39920000-0000-0000-0000-000000000002'; f uuid := '39920000-0000-0000-0000-000000000003'; typ uuid; l uuid; l2 uuid; j jsonb; a record; b jsonb; x jsonb; n int;
begin
  insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values
    ('T','399201',e,(d+time '16:30')::timestamp - interval '3 hours','manual'),
    ('T','399201',e,(d+time '21:30')::timestamp - interval '3 hours','manual');
  j := public.attendance_edit_create('employees',array[e],array[d],'full_presence','{}','اختبار تعديل جماعي سابق','direct');
  select to_jsonb(z) into b from public.hr_attendance_days z where z.employee_id=e and z.work_date=d;
  assert b->>'status'='present' and b->>'source'='manual', 'التعديل الجماعي قبل الإجازة';
  select id into typ from public.hr_leave_types where code='official';
  insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,status) values(e,'leave',typ,d,d,'pending') returning id into l;
  perform public.hr_leave_decide(l,true);
  select * into a from public.hr_attendance_days z where z.employee_id=e and z.work_date=d;
  assert a.status='leave' and a.source='manual' and a.approved_leave_original->>'status'='present', 'إجازة أعلى أولوية: ' || row_to_json(a)::text;
  assert a.check_in=(b->>'check_in')::timestamptz and a.check_out=(b->>'check_out')::timestamptz and a.edit_reason=b->>'edit_reason', 'أوقات وسجل التعديل محفوظان';
  assert (select count(*) from public.biometric_punches where employee_id=e)=2, 'دفتر البصمات لم يُمس';
  select count(*) into n from public.hr_attendance_audit where employee_id=e and work_date=d and action='leave_sync';
  perform app.hr_evaluate_day(e,d); perform app.hr_evaluate_day_safe(e,d);
  assert (select count(*) from public.hr_attendance_audit where employee_id=e and work_date=d and action='leave_sync')=n, 'الإعادة لا تكرر السجل';
  insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values ('T','399201',e,(d+time '21:45')::timestamp - interval '3 hours','manual');
  assert (select status from public.hr_attendance_days where employee_id=e and work_date=d)='leave', 'إعادة السحب لا تخفي الإجازة';
  begin
    perform public.ops_attendance_edit(e,d,(d+time '16:00')::timestamp - interval '3 hours',(d+time '22:00')::timestamp - interval '3 hours','present','تجربة منع تغليب التعديل');
    raise exception 'EXPECTED_CONFLICT';
  exception when others then if sqlerrm <> 'HR_APPROVED_LEAVE_CONFLICT' then raise; end if; end;
  perform public.hr_leave_cancel(l,'إلغاء اختبار');
  select * into a from public.hr_attendance_days z where z.employee_id=e and z.work_date=d;
  assert a.status='present' and a.approved_leave_original is null and a.check_in=(b->>'check_in')::timestamptz and a.check_out=(b->>'check_out')::timestamptz, 'الإلغاء يستعيد الأصل دون مس البصمات';
  -- شهر معتمد حضورياً وغير مقفل مالياً: يُفتح تلقائياً ويُصحح، مع تنبيه وسبب.
  insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,status) values(e,'leave',typ,d,d,'pending') returning id into l2;
  insert into public.hr_attendance_confirmations(period_month,status) values(m,'confirmed');
  insert into public.hr_attendance_pending_auto(period_month,employee_id,work_date,would_be_status) values(m,f,m+9,'absent');
  perform public.hr_leave_decide(l2,true);
  assert (select status from public.hr_attendance_days where employee_id=e and work_date=d)='leave', 'الإجازة تطبق بالمفتوح مالياً';
  assert (select status from public.hr_attendance_confirmations where period_month=m)='reopened', 'تحتاج الحضورية إعادة اعتماد';
  assert exists (select 1 from public.hr_attendance_pending_auto where period_month=m and employee_id=f and work_date=m+9), 'التغييرات الأخرى المعلقة لم تُحذف';
  assert exists(select 1 from public.hr_attendance_audit where employee_id=e and work_date=d and action='reopen'), 'توثيق إعادة الفتح';
  -- القفل المالي: إعادة التقييم لا تغير الصف أو كشف الراتب.
  insert into public.hr_attendance_days(employee_id,work_date,status,source) values(f,m+11,'present','manual');
  insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,status) values(f,'leave',typ,m+11,m+11,'approved');
  insert into public.hr_month_exports(period_month,status) values(m,'approved');
  select to_jsonb(z) into x from public.hr_attendance_days z where z.employee_id=f and z.work_date=m+11;
  perform app.hr_evaluate_day(f,m+11);
  assert x=(select to_jsonb(z) from public.hr_attendance_days z where z.employee_id=f and z.work_date=m+11), 'لا تغيير في يوم الشهر المقفل';
  assert (select status from public.hr_month_exports where period_month=m)='approved', 'القفل لم يتغير';
  perform app.hr_leave_reconcile_existing(); perform app.hr_leave_reconcile_existing();
  assert x=(select to_jsonb(z) from public.hr_attendance_days z where z.employee_id=f and z.work_date=m+11), 'المصالحة لا تغير المقفل';
  assert (select count(*) from public.hr_attendance_audit where employee_id=f and work_date=m+11 and action='auto_blocked' and reason like '%مقفل مالياً%')=1, 'تعارض المقفل للمراجعة بلا تكرار';
end $$;
-- فترة طويلة: لا يمكن الموافقة أو الإلغاء إذا كان أي شهر ضمنها مقفلاً حتى لو كان الطرفان مفتوحين.
do $$ declare m date := (date_trunc('month',current_date)-interval '7 months')::date;
 e uuid := '39920000-0000-0000-0000-000000000003'; typ uuid; l uuid; lc uuid; ok boolean;
begin
  select id into typ from public.hr_leave_types where code='official';
  insert into public.hr_month_exports(period_month,status) values ((m+interval '1 month')::date,'approved');
  insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,status) values(e,'leave',typ,m+1,(m+interval '2 months')::date+1,'pending') returning id into l;
  ok:=false; begin perform public.hr_leave_decide(l,true); exception when others then ok:=sqlerrm='HR_MONTH_LOCKED'; end;
  assert ok and (select status from public.hr_leaves where id=l)='pending', 'لا موافقة على شهر مقفل وسيط';
  insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,status) values(e,'leave',typ,m+2,(m+interval '2 months')::date+2,'approved') returning id into lc;
  ok:=false; begin perform public.hr_leave_cancel(lc,'اختبار الإلغاء'); exception when others then ok:=sqlerrm='HR_MONTH_LOCKED'; end;
  assert ok and (select status from public.hr_leaves where id=lc)='approved', 'لا إلغاء لطلب يمتد على شهر مقفل';
  assert (select bool_and(guarded) from app.write_guard_audit()), 'أغلفة الصلاحية وحراسة التكرار باقية';
end $$;
-- محاكاة بيانات سابقة كانت موجودة قبل الترقية: التصحيح قابل للإعادة دون سجلات مكررة.
do $$ declare m date := (date_trunc('month',current_date)-interval '5 months')::date;
 e uuid := '39920000-0000-0000-0000-000000000002'; typ uuid; a record; c int;
begin
  select id into typ from public.hr_leave_types where code='official';
  insert into public.hr_attendance_days(employee_id,work_date,status,source,check_in,check_out,worked_minutes)
    values(e,m+5,'present','manual',(m+5+time '16:00')::timestamp - interval '3 hours',(m+5+time '22:00')::timestamp - interval '3 hours',360);
  insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,status) values(e,'leave',typ,m+5,m+5,'approved');
  perform app.hr_leave_reconcile_existing();
  select * into a from public.hr_attendance_days where employee_id=e and work_date=m+5;
  assert a.status='leave' and a.approved_leave_original->>'status'='present' and a.worked_minutes=360, 'تصحيح التعارض التاريخي المفتوح';
  select count(*) into c from public.hr_attendance_audit where employee_id=e and work_date=m+5 and action='leave_sync';
  perform app.hr_leave_reconcile_existing();
  assert c=1 and (select count(*) from public.hr_attendance_audit where employee_id=e and work_date=m+5 and action='leave_sync')=1, 'تصحيح التاريخ لا يتكرر';
  assert (select days_leave from app.hr_month_summary(m) where employee_id=e)=1, 'تظهر الإجازة في ملخص الرواتب';
end $$;
-- التراجع عن التعديل الجماعي أثناء الإجازة يحفظ الإجازة ويستعيد الحالة السابقة تحتها.
do $$ declare m date := (date_trunc('month',current_date)-interval '4 months')::date; d date:=m+8;
 e uuid := '39920000-0000-0000-0000-000000000003'; typ uuid; l uuid; j jsonb; a record;
begin
  insert into public.hr_attendance_days(employee_id,work_date,status,source,check_in,check_out,worked_minutes,late_minutes)
  values(e,d,'late','auto',(d+time '17:00')::timestamp-interval '3 hours',(d+time '22:00')::timestamp-interval '3 hours',300,60);
  j:=public.attendance_edit_create('employees',array[e],array[d],'full_presence','{}','تعديل يجب التراجع عنه','direct');
  select id into typ from public.hr_leave_types where code='official';
  insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,status) values(e,'leave',typ,d,d,'pending') returning id into l;
  perform public.hr_leave_decide(l,true);
  perform public.attendance_edit_revert((j->>'id')::uuid,'سبب التراجع التجريبي');
  select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
  assert a.status='leave' and a.approved_leave_original->>'status'='late' and a.check_in=(d+time '17:00')::timestamp-interval '3 hours', 'التراجع يحافظ على الإجازة والأصل';
  perform public.hr_leave_cancel(l,'إلغاء الاختبار');
  select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
  assert a.status='late' and a.late_minutes=60, 'إلغاء الإجازة يستعيد الحالة بعد التراجع';
end $$;
-- الإجازة بلا راتب لا تتحول إلى يوم حضور مدفوع بسبب تعديل جماعي سابق.
do $$ declare m date := (date_trunc('month',current_date)-interval '8 months')::date; d date:=m+6;
 e uuid := '39920000-0000-0000-0000-000000000002'; typ uuid; l uuid; s record; a record; j jsonb;
begin
  j:=public.attendance_edit_create('employees',array[e],array[d],'full_presence','{}','اختبار الإجازة غير المدفوعة','direct');
  select id into typ from public.hr_leave_types where code='unpaid';
  insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,status) values(e,'leave',typ,d,d,'pending') returning id into l;
  perform public.hr_leave_decide(l,true);
  select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
  select * into s from app.hr_month_summary(m) where employee_id=e;
  assert a.status='leave' and s.days_leave_unpaid=1 and s.days_leave_paid=0 and s.days_present=0, 'الإجازة غير المدفوعة في ملخص الراتب: '||row_to_json(s)::text;
end $$;
