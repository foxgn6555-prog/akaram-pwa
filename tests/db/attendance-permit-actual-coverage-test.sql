-- 00399-ج: تداخل الزمنيات والأشهر المالية واليدوي والليل وبنك الساعات.
insert into auth.users(id,email) values('39930000-0000-0000-0000-000000000001','permit-coverage@test.invalid');
insert into public.user_roles(user_id,role) values('39930000-0000-0000-0000-000000000001','super_admin');
insert into public.employees(id,employee_number,full_name,hire_date,biometric_pin) values
 ('39930000-0000-0000-0000-000000000002','PC-1','الزمنية النهارية','2024-01-01','399301'),
 ('39930000-0000-0000-0000-000000000003','PC-2','الزمنية الليلية','2024-01-01','399302'),
 ('39930000-0000-0000-0000-000000000006','PC-3','الزمنية المرنة','2024-01-01','399303'),
 ('39930000-0000-0000-0000-000000000007','PC-4','الزمنية المرنة الليلية','2024-01-01','399304');
insert into public.hr_shifts(id,name,start_time,end_time,grace_minutes,work_days) values
 ('39930000-0000-0000-0000-000000000004','شفت تغطية نهاري','16:00','22:00',0,'{0,1,2,3,4,5,6}'),
 ('39930000-0000-0000-0000-000000000005','شفت تغطية ليلي','22:00','06:00',0,'{0,1,2,3,4,5,6}');
insert into public.hr_shifts(id,name,start_time,end_time,grace_minutes,work_days,kind,required_hours) values
 ('39930000-0000-0000-0000-000000000008','اختبار مرن','08:00','20:00',0,'{0,1,2,3,4,5,6}','flexible',6),
 ('39930000-0000-0000-0000-000000000009','اختبار مرن ليلي','20:00','04:00',0,'{0,1,2,3,4,5,6}','flexible',6);
insert into public.employee_shift_assignments(employee_id,shift_id,effective_from) values
 ('39930000-0000-0000-0000-000000000002','39930000-0000-0000-0000-000000000004','2024-01-01'),
 ('39930000-0000-0000-0000-000000000003','39930000-0000-0000-0000-000000000005','2024-01-01'),
 ('39930000-0000-0000-0000-000000000006','39930000-0000-0000-0000-000000000008','2024-01-01'),
 ('39930000-0000-0000-0000-000000000007','39930000-0000-0000-0000-000000000009','2024-01-01');
select auth.set_test_user('39930000-0000-0000-0000-000000000001');
create function app.test_permit(e uuid,d date,t1 time,t2 time,paid boolean default true) returns uuid language plpgsql as $$
declare p uuid; id uuid; begin
 select x.id into p from public.hr_leave_types x where x.code=case when paid then 'permit_official' else 'permit_unpaid' end;
 insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,start_time,end_time,minutes,status)
 values(e,'time_permit',p,d,d,t1,t2,extract(epoch from(t2-t1))::int/60,'approved') returning hr_leaves.id into id;
 return id;
end$$;
create function app.test_punch(e uuid,d date,t1 time,t2 time,night boolean default false) returns void language plpgsql as $$
declare pin text; begin
 select biometric_pin into pin from public.employees where id=e;
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method)
 values('PC',pin,e,(d+t1)::timestamp-interval '3 hours','manual') on conflict do nothing;
 if t2 is not null then
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method)
 values('PC',pin,e,(d+t2)::timestamp-interval '3 hours'+case when night then interval '1 day' else interval '0' end,'manual') on conflict do nothing; end if;
 perform app.hr_evaluate_day(e,d);
end$$;
do $$ declare m date := (date_trunc('month',current_date)-interval '2 months')::date;
 e uuid:='39930000-0000-0000-0000-000000000002'; night_e uuid:='39930000-0000-0000-0000-000000000003';
 p uuid; p2 uuid; export_id uuid; a record; s record; v int; j jsonb; b jsonb; n int; ok boolean; v_text text;
begin
 -- زمنية وسط الشفت لا تبرر تأخير بدايته.
 perform app.test_permit(e,m+1,'19:00','20:00'); perform app.test_punch(e,m+1,'17:00','22:00');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+1;
 assert a.status='late' and a.late_minutes=60 and a.shortfall_minutes=60 and a.overtime_minutes=0, 'وسط الشفت: '||row_to_json(a);
 -- تغطية كاملة، جزئية، وزمنيات متداخلة تاريخياً (اتحاد لا جمع مرتين).
 perform app.test_permit(e,m+2,'16:00','17:00'); perform app.test_punch(e,m+2,'17:00','22:00');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+2;
 assert a.status='time_permit' and a.shortfall_minutes=0 and a.overtime_minutes=0, 'تغطية كاملة';
 perform app.test_permit(e,m+3,'16:00','16:30'); perform app.test_punch(e,m+3,'17:00','22:00');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+3;
 assert a.late_minutes=30 and a.shortfall_minutes=30, 'تغطية جزئية';
 perform app.test_permit(e,m+4,'16:00','16:20'); perform app.test_permit(e,m+4,'16:10','16:30'); perform app.test_punch(e,m+4,'17:00','22:00');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+4;
 assert a.late_minutes=30 and a.shortfall_minutes=30 and a.permit_minutes=30, 'اتحاد المتداخل لا يجمع مرتين: '||row_to_json(a);
 -- غير المدفوعة تعذر الحالة لا المال؛ ولا يوصف نقص خارجها بأنه غير مدفوع.
 perform app.test_permit(e,m+5,'16:00','17:00',false); perform app.test_punch(e,m+5,'17:00','22:00');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+5;
 assert a.status='time_permit' and a.shortfall_minutes=60 and a.permit_minutes=0 and a.deduction_reason like '%زمنية غير مدفوعة 60 د%', 'الزمنية غير المدفوعة';
 perform app.test_permit(e,m+6,'19:00','20:00',false); perform app.test_punch(e,m+6,'17:00','22:00');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+6;
 assert a.shortfall_minutes=60 and coalesce(a.deduction_reason,'') not like '%زمنية غير مدفوعة%', 'غير المدفوعة بعيدة عن النقص';
 -- الحضور المبكر والعودة المتأخرة لا يصنعان أوفرتايم من الزمنية.
 perform app.test_permit(e,m+7,'21:00','22:00'); perform app.test_punch(e,m+7,'15:00','21:00');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+7;
 assert a.shortfall_minutes=0 and a.overtime_minutes=0 and a.ot_early_minutes=0 and a.ot_late_minutes=0, 'الزمنية لا تنشئ إضافي: '||row_to_json(a);
 perform app.test_permit(e,m+8,'16:00','16:30'); perform app.test_permit(e,m+8,'21:30','22:00'); perform app.test_punch(e,m+8,'17:00','21:00');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+8;
 assert a.shortfall_minutes=60 and a.late_minutes=30 and a.early_minutes=30, 'نقص طرفي الشفت';
 perform app.test_permit(e,m+9,'16:00','17:00'); perform app.test_punch(e,m+9,'17:00',null);
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+9;
 assert a.status='incomplete' and a.check_out is null, 'الزمنية لا تخفي البصمة الناقصة';
 select (x.days->9->>'has_permit')::boolean into ok from public.ops_attendance_month_grid(m) x where x.employee_id=e;
 assert ok, 'تظهر شارة الزمنية مع البصمة الناقصة';
 -- بعد منتصف الليل في شفت يبدأ 22 وينتهي 06.
 perform app.test_permit(night_e,m+10,'03:00','06:00'); perform app.test_punch(night_e,m+10,'22:00','03:00',true);
 select * into a from public.hr_attendance_days where employee_id=night_e and work_date=m+10;
 assert a.status='time_permit' and a.shortfall_minutes=0 and a.overtime_minutes=0, 'زمنية بعد منتصف الليل: '||row_to_json(a);
 -- شفت مرن انتهى فعلياً بعد منتصف الليل رغم نهاية نافذته المحددة في اليوم السابق.
 perform app.test_permit('39930000-0000-0000-0000-000000000006',m+10,'23:30','24:00');
 perform app.test_permit('39930000-0000-0000-0000-000000000006',m+10,'00:00','01:00');
 perform app.test_punch('39930000-0000-0000-0000-000000000006',m+10,'19:00','23:30');
 select * into a from public.hr_attendance_days where employee_id='39930000-0000-0000-0000-000000000006' and work_date=m+10;
 assert a.status='time_permit' and a.expected_out=((m+11+time '01:00')::timestamp-interval '3 hours') at time zone 'UTC' and a.shortfall_minutes=0, 'مرن يعبر منتصف الليل: '||row_to_json(a);
 -- مرن يبدأ فعلياً بعد منتصف الليل كله ضمن اليوم التالي للشفت.
 perform app.test_permit('39930000-0000-0000-0000-000000000007',m+11,'03:00','06:00');
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values
  ('PC','399304','39930000-0000-0000-0000-000000000007',((m+12+time '00:00')::timestamp-interval '3 hours') at time zone 'UTC','manual'),
  ('PC','399304','39930000-0000-0000-0000-000000000007',((m+12+time '03:00')::timestamp-interval '3 hours') at time zone 'UTC','manual');
 perform app.hr_evaluate_day('39930000-0000-0000-0000-000000000007',m+11);
 select * into a from public.hr_attendance_days where employee_id='39930000-0000-0000-0000-000000000007' and work_date=m+11;
 assert a.status='time_permit' and a.shortfall_minutes=0, 'مرن يبدأ بعد منتصف الليل: '||row_to_json(a);
 -- طلب فعلي بعد تعديل يدوي مع استعادة الأصل عند الإلغاء وإعادة الاحتساب بلا تغيير البصمات.
 perform public.ops_attendance_edit(e,m+11,(m+11+time '16:00')::timestamp-interval '3 hours',(m+11+time '22:00')::timestamp-interval '3 hours','present','تعديل موثق للاختبار');
 select id into p2 from public.hr_leave_types where code='permit_official';
 insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,start_time,end_time,minutes,status)
 values(e,'time_permit',p2,m+11,m+11,'19:00','20:00',60,'pending') returning id into p;
 insert into public.hr_attendance_confirmations(period_month,status) values(m,'confirmed');
 insert into public.hr_month_exports(period_month,status,review_status,exported_at) values(m,'exported','approved',now()-interval '2 minutes') returning id into export_id;
 insert into public.hr_attendance_pending_auto(period_month,employee_id,work_date,would_be_status) values(m,night_e,m+27,'absent');
 perform public.hr_leave_decide(p,true);
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+11;
 assert a.status='time_permit' and a.source='manual' and a.approved_permit_original->>'status'='present' and a.worked_minutes=360, 'أولوية الزمنية اليدوية';
 assert (select status from public.hr_attendance_confirmations where period_month=m)='reopened', 'قرار الزمنية يفتح اعتماد الحضور';
 assert exists(select 1 from public.hr_attendance_pending_auto where period_month=m and employee_id=night_e), 'عدم حذف انتظار آخر';
 assert (app.hr_month_export_status(m)->>'needs_reexport')::boolean, 'التصدير القديم يحتاج إعادة تصدير';
 ok:=false; begin perform public.finance_payroll_approve(export_id,false); exception when others then ok:=sqlerrm='HR_EXPORT_STALE'; end;
 assert ok, 'المالية لا تعتمد التصدير القديم';
 select count(*) into n from public.hr_attendance_audit where employee_id=e and work_date=m+11 and action='leave_sync';
 perform app.hr_evaluate_day(e,m+11); perform app.hr_evaluate_day_safe(e,m+11);
 assert (select count(*) from public.hr_attendance_audit where employee_id=e and work_date=m+11 and action='leave_sync')=n, 'لا تكرار تدقيق';
 perform public.hr_leave_cancel(p,'إلغاء اختبار الزمنية');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+11;
 assert a.status='present' and a.approved_permit_original is null and a.worked_minutes=360, 'إلغاء الزمنية يستعيد الأصل';
 -- تعديل أوقات مع زمنية سابقة يجب ألا يخصم التداخل مرتين من التأخير.
 perform app.test_permit(e,m+12,'16:00','16:30');
 perform public.ops_attendance_edit(e,m+12,(m+12+time '17:00')::timestamp-interval '3 hours',(m+12+time '22:00')::timestamp-interval '3 hours','late','تعديل وقت ناقص للاختبار');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+12;
 assert a.status='late' and a.late_minutes=30 and a.shortfall_minutes=30, 'التعديل اليدوي يحسب التداخل مرة: '||row_to_json(a);
 -- لا يجوز أن تخفي تغطية أحد طرفي الشفت نقص الطرف الآخر في الحالة اليدوية.
 perform app.test_permit(e,m+17,'16:00','17:00');
 perform app.attendance_edit_apply_day(e,m+17,(m+17+time '17:00')::timestamp-interval '3 hours',(m+17+time '21:00')::timestamp-interval '3 hours','auto','اختبار طرفي الشفت');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+17;
 assert a.status='early_leave' and a.late_minutes=0 and a.early_minutes=60 and a.shortfall_minutes=60, 'الزمنية لا تخفي الخروج المبكر الآخر: '||row_to_json(a);
 -- إعادة البصمة لا تتراجع عن المصحح، وملخص الرواتب يرى النقص المصحح.
 perform app.test_punch(e,m+1,'17:00','22:00');
 select * into s from app.hr_month_summary(m) where employee_id=e;
 assert s.shortfall_minutes >= 60 and s.days_leave=0, 'ملخص الراتب يعرض النقص والزمنيات ليست إجازة';
 -- بنك الساعات: التغطية من بداية الشفت فقط، ثم يُحتسب البقاء بعد الدوام مقابل المتبقي.
 update public.hr_policy set settings=settings||'{"shortfall_method":"hour_bank","grace_minutes_default":0}'::jsonb where id=1;
 perform app.test_permit(e,m+13,'19:00','20:00'); perform app.test_punch(e,m+13,'17:00','22:30');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+13;
 assert a.shortfall_minutes=30 and a.overtime_minutes=0, 'بنك ساعات: زمنية وسط الشفت لا تغطي تأخيراً';
 perform app.test_permit(e,m+14,'16:00','16:30'); perform app.test_punch(e,m+14,'17:00','22:30');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+14;
 assert a.shortfall_minutes=0 and a.overtime_minutes=0, 'بنك ساعات: تغطية + البقاء';
 -- التداخل خارج الشفت لا يغطي الغياب ولا يخلق وقتاً إضافياً.
 v:=app.hr_permit_overlap_minutes(e,m+14,(m+14+time '15:00')::timestamp-interval '3 hours',(m+14+time '17:00')::timestamp-interval '3 hours','16:00','22:00',true);
 assert v=30, 'الاقتصار على داخل الشفت';
 perform app.test_permit(e,m+16,'15:00','16:30');
 v:=app.hr_permit_overlap_minutes(e,m+16,(m+16+time '16:00')::timestamp-interval '3 hours',(m+16+time '17:00')::timestamp-interval '3 hours','16:00','22:00',true);
 assert v=30, 'لا تغطية خارج الشفت حتى إذا شملتها الزمنية';
 -- اختلاف TimeZone في الجلسة لا يغير الحساب الفعلي.
 perform set_config('TimeZone','Asia/Baghdad',true);
 perform app.test_permit(e,m+18,'16:00','16:30');
 insert into public.biometric_punches(device_serial,pin,employee_id,punched_at,method) values
  ('PC-TZ','399301',e,((m+18+time '17:00')::timestamp-interval '3 hours') at time zone 'UTC','manual'),
  ('PC-TZ','399301',e,((m+18+time '22:00')::timestamp-interval '3 hours') at time zone 'UTC','manual');
 perform app.hr_evaluate_day(e,m+18);
 select * into a from public.hr_attendance_days where employee_id=e and work_date=m+18;
 assert a.expected_in=(((m+18+time '16:00')::timestamp-interval '3 hours') at time zone 'UTC') and a.shortfall_minutes=30, 'اختلاف منطقة الجلسة لا يغير النتيجة: '||row_to_json(a);
 select (x.days->18->>'in') into v_text from public.ops_attendance_month_grid(m) x where x.employee_id=e;
 assert v_text='17:00', 'عرض وقت بغداد لا يتأثر بمنطقة جلسة القاعدة';
 perform set_config('TimeZone','UTC',true);
 assert not has_function_privilege('authenticated','app.hr_permit_overlap_minutes(uuid,date,timestamptz,timestamptz,time,time,boolean)','EXECUTE'), 'حساب الزمنية الداخلي ليس عاماً';
 assert not has_function_privilege('authenticated','app.hr_compute_day_metrics(uuid,date)','EXECUTE') and not has_function_privilege('anon','app.hr_evaluate_day(uuid,date)','EXECUTE'), 'الاحتساب الداخلي لا يتاح مباشرة';
end$$;
-- التراجع عن تعديل جماعي مع زمنية معتمدة يحفظ أصل الحالة، ثم الإلغاء يستعيدها.
do $$ declare m date:=(date_trunc('month',current_date)-interval '4 months')::date; d date:=m+4;
 e uuid:='39930000-0000-0000-0000-000000000002'; typ uuid; p uuid; j jsonb; a record;
begin
 perform public.ops_attendance_edit(e,d,(d+time '17:00')::timestamp-interval '3 hours',(d+time '22:00')::timestamp-interval '3 hours','late','اختبار الحالة الأصلية');
 select id into typ from public.hr_leave_types where code='permit_official';
 insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,start_time,end_time,minutes,status)
 values(e,'time_permit',typ,d,d,'16:00','16:30',30,'pending') returning id into p;
 perform public.hr_leave_decide(p,true);
 j:=public.attendance_edit_create('employees',array[e],array[d],'full_presence','{}','تعديل جماعي للاختبار','direct');
 perform public.attendance_edit_revert((j->>'id')::uuid,'اختبار التراجع عن الجماعي');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.status='late' and a.late_minutes=30 and a.approved_permit_original->>'status'='late', 'التراجع يعيد الأصل تحت الزمنية: '||row_to_json(a);
 perform public.hr_leave_cancel(p,'اختبار إلغاء الزمنية بعد التراجع');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.status='late' and a.late_minutes=60 and a.approved_permit_original is null, 'إلغاء الزمنية يستعيد أصل التراجع: '||row_to_json(a);
end$$;

-- عند تعدد الزمنيات يبقى الجزء المعتمد بعد إلغاء إحداها، ثم تستعاد الحالة الأصلية.
do $$ declare m date:=(date_trunc('month',current_date)-interval '3 months')::date; d date:=m+6;
 e uuid:='39930000-0000-0000-0000-000000000002'; p1 uuid; p2 uuid; a record;
begin
 perform public.ops_attendance_edit(e,d,(d+time '17:00')::timestamp-interval '3 hours',(d+time '22:00')::timestamp-interval '3 hours','late','اختبار زمنيات متعددة');
 p1:=app.test_permit(e,d,'16:00','16:20'); p2:=app.test_permit(e,d,'16:20','16:40');
 perform app.hr_evaluate_day(e,d);
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.late_minutes=20 and a.shortfall_minutes=20, 'تجميع الزمنيات اليدوية';
 perform public.hr_leave_cancel(p1,'اختبار إلغاء الزمنية الأولى');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.late_minutes=40 and a.shortfall_minutes=40 and a.approved_permit_original is not null, 'تبقى الزمنية الثانية بعد إلغاء الأولى';
 perform public.hr_leave_cancel(p2,'اختبار إلغاء الزمنية الثانية');
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.status='late' and a.late_minutes=60 and a.shortfall_minutes=60 and a.approved_permit_original is null, 'الأصل بعد إلغاء جميع الزمنيات';
end$$;

-- مصالحة بيانات قديمة في المفتوح والمقفول: لا تغير القفل وسجل مراجعة واحد فقط.
do $$ declare m date:=(date_trunc('month',current_date)-interval '5 months')::date; d date:=m+2;
 e uuid:='39930000-0000-0000-0000-000000000002'; a record; b jsonb; n int; p uuid; typ uuid; ok boolean;
begin
 update public.hr_policy set settings=settings||'{"shortfall_method":"tiers"}'::jsonb where id=1;
 perform app.test_permit(e,d,'19:00','20:00'); perform app.test_punch(e,d,'17:00','22:00');
 update public.hr_attendance_days set shortfall_minutes=0,proposed_deduction_minutes=0 where employee_id=e and work_date=d;
 insert into public.hr_attendance_confirmations(period_month,status) values(m,'confirmed');
 perform app.hr_permit_reconcile_existing();
 select * into a from public.hr_attendance_days where employee_id=e and work_date=d;
 assert a.shortfall_minutes=60 and (select status from public.hr_attendance_confirmations where period_month=m)='reopened', 'التصحيح التاريخي يفتح الحضورية';
 select count(*) into n from public.hr_attendance_audit where employee_id=e and work_date=d and action='leave_sync';
 perform app.hr_permit_reconcile_existing();
 assert (select count(*) from public.hr_attendance_audit where employee_id=e and work_date=d and action='leave_sync')=n, 'المصالحة قابلة للتكرار';
 m:=(date_trunc('month',current_date)-interval '6 months')::date; d:=m+2;
 p:=app.test_permit(e,d,'19:00','20:00'); perform app.test_punch(e,d,'17:00','22:00');
 update public.hr_attendance_days set shortfall_minutes=0,proposed_deduction_minutes=0 where employee_id=e and work_date=d;
 insert into public.hr_month_exports(period_month,status) values(m,'approved');
 select to_jsonb(x) into b from public.hr_attendance_days x where employee_id=e and work_date=d;
 perform app.hr_permit_reconcile_existing(); perform app.hr_permit_reconcile_existing();
 perform app.hr_compute_day_metrics(e,d);
 assert b=(select to_jsonb(x) from public.hr_attendance_days x where employee_id=e and work_date=d), 'المصالحة لا تعدل اليوم المقفل';
 assert (select count(*) from public.hr_attendance_audit where employee_id=e and work_date=d and action='auto_blocked' and reason like '%تعارض زمنية%')=1, 'مراجعة المقفل مرة واحدة';
 ok:=false; begin perform public.hr_leave_cancel(p,'اختبار منع الإلغاء بعد القفل'); exception when others then ok:=sqlerrm='HR_MONTH_LOCKED'; end;
 assert ok and (select status from public.hr_leaves where id=p)='approved', 'لا إلغاء بعد القفل';
 select id into typ from public.hr_leave_types where code='permit_official';
 insert into public.hr_leaves(employee_id,kind,leave_type_id,start_date,end_date,start_time,end_time,minutes,status)
 values(e,'time_permit',typ,d,d,'16:00','17:00',60,'pending') returning id into p;
 ok:=false; begin perform public.hr_leave_decide(p,true); exception when others then ok:=sqlerrm='HR_MONTH_LOCKED'; end;
 assert ok and (select status from public.hr_leaves where id=p)='pending', 'لا موافقة بعد القفل';
end$$;
drop function app.test_permit(uuid,date,time,time,boolean);
drop function app.test_punch(uuid,date,time,time,boolean);
