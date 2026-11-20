-- اختبار 20261120210000 · الجولة ٩ — تحصين بوابة المواطن
-- مستقل: يستخدم أرقاماً خاصة به (0770 900 xx) ولا يعتمد على أي مستخدم.
-- يغطي: بلا تدوير للرمز · مطابقة الاسم + تطبيعه · تقييد التخمين · أذونات anon.
-- محصّن: معاملة واحدة تُرجَع في النهاية (لا أثر على قاعدة الاختبار).

begin;

-- ═══ T0 · تنظيف بقايا تشغيل سابق لهذا الاختبار ═══
delete from public.citizen_complaints where citizen_id in (select id from public.citizen_accounts where phone like '0770900%');
delete from public.citizen_accounts where phone like '0770900%';
delete from public.citizen_signin_attempts where phone like '0770900%';

-- ═══ T1 · حساب جديد: رمز يُنشأ مرة واحدة، returning=false ═══
do $$ declare a jsonb; begin
  a := public.citizen_sign_in('علي حسين', '0770 900 1001');
  if (a ->> 'error') is not null then raise exception 'T1: unexpected error %', a; end if;
  if a ->> 'phone' <> '07709001001' then raise exception 'T1: phone not normalised: %', a; end if;
  if (a ->> 'returning')::boolean is not false then raise exception 'T1: returning يجب أن تكون false'; end if;
  if length(a ->> 'token') <> 36 then raise exception 'T1: token missing'; end if;
  if (select count(*) from public.citizen_accounts where phone = '07709001001') <> 1 then raise exception 'T1: account not created'; end if;
  if (select count(*) from public.citizen_signin_attempts where phone = '07709001001' and outcome = 'created') <> 1 then
    raise exception 'T1: attempt not logged';
  end if;
  perform set_config('test.c9_token', a ->> 'token', false);
  raise notice 'T1 OK — حساب جديد + رمز واحد';
end $$;

-- ═══ T2 · إعادة الدخول بالاسم نفسه: **بلا تدوير** ونفس الرمز ═══
do $$ declare b jsonb; v_old uuid := current_setting('test.c9_token')::uuid; begin
  b := public.citizen_sign_in('علي حسين', '07709001001');
  if (b ->> 'token')::uuid <> v_old then raise exception 'T2: الرمز تغيّر — تدوير ما زال قائماً'; end if;
  if (b ->> 'returning')::boolean is not true then raise exception 'T2: returning يجب أن تكون true'; end if;
  if (select count(*) from public.citizen_accounts where phone = '07709001001') <> 1 then raise exception 'T2: duplicate account'; end if;
  raise notice 'T2 OK — لا تدوير للرمز';
end $$;

-- ═══ T3 · الاسم الثلاثي يطابق المخزَّن الثنائي (احتواء الكلمات + تطبيع المسافات) ═══
do $$ declare c jsonb; v_old uuid := current_setting('test.c9_token')::uuid; begin
  c := public.citizen_sign_in('علي   حسين كاظم', '07709001001');
  if (c ->> 'token')::uuid <> v_old then raise exception 'T3: اسم ثلاثي لم يطابق المخزَّن: %', c; end if;
  raise notice 'T3 OK — تطبيع ومطابقة جزئية';
end $$;

-- ═══ T4 · اسم مختلف: كائن خطأ (بلا استثناء) + الرمز لم يتغيّر + المحاولة مسجّلة ═══
do $$ declare d jsonb; v_old uuid := current_setting('test.c9_token')::uuid; begin
  d := public.citizen_sign_in('حسين محمد', '07709001001');
  if d ->> 'error' <> 'CITIZEN_IDENTITY_MISMATCH' then raise exception 'T4: expected mismatch error, got %', d; end if;
  if d ? 'token' then raise exception 'T4: تسريب الرمز في مسار الرفض'; end if;
  if (d ->> 'attempts_left')::int <> 4 then raise exception 'T4: attempts_left غير صحيح: %', d; end if;
  if (select token from public.citizen_accounts where phone = '07709001001') <> v_old then
    raise exception 'T4: الرمز تغيّر بعد محاولة فاشلة';
  end if;
  if (select count(*) from public.citizen_signin_attempts where phone = '07709001001' and outcome = 'mismatch') <> 1 then
    raise exception 'T4: المحاولة الفاشلة لم تُسجَّل (استثناء يُلغي الكتابة؟)';
  end if;
  raise notice 'T4 OK — رفض مسجَّل بلا تسريب';
end $$;

-- ═══ T5 · تقييد التخمين: خمس محاولات فاشلة ⇒ السادسة مقفلة (والصحيحة أيضاً) ═══
do $$ declare r jsonb; i int; begin
  for i in 2..5 loop
    r := public.citizen_sign_in('محمد جاسم', '07709001001');
    if r ->> 'error' <> 'CITIZEN_IDENTITY_MISMATCH' then raise exception 'T5: المحاولة % لم تُرفض: %', i, r; end if;
  end loop;
  r := public.citizen_sign_in('محمد جاسم', '07709001001');
  if r ->> 'error' <> 'CITIZEN_SIGNIN_LOCKED' then raise exception 'T5: السادسة يجب أن تكون مقفلة: %', r; end if;
  r := public.citizen_sign_in('علي حسين', '07709001001');
  if r ->> 'error' <> 'CITIZEN_SIGNIN_LOCKED' then raise exception 'T5: الاسم الصحيح أثناء القفل يجب أن يُرفض: %', r; end if;
  raise notice 'T5 OK — قفل بعد خمس محاولات';
end $$;

-- ═══ T6 · الرمز القديم ما زال صالحاً (لم يُبطَل بأي محاولة) ═══
do $$ declare v_old uuid := current_setting('test.c9_token')::uuid; v_rows jsonb; begin
  v_rows := public.citizen_my_complaints(v_old);
  if jsonb_typeof(v_rows) <> 'array' then raise exception 'T6: الرمز القديم لم يعد يعمل'; end if;
  begin
    perform public.citizen_my_complaints('11111111-1111-4111-8111-111111111111'::uuid);
    raise exception 'T6: رمز غير صالح مرّ';
  exception when others then
    if sqlerrm <> 'CITIZEN_SESSION_INVALID' then raise; end if;
  end;
  raise notice 'T6 OK — الرمز سليم وغير صالح-الرفض سليم';
end $$;

-- ═══ T7 · أذونات anon: 10 دوال فقط، والدوال الثلاث للموظفين محجوبة ═══
do $$ declare v_n int; begin
  if has_function_privilege('anon', 'public.citizen_complaints_report(date,date)', 'execute') then raise exception 'T7: report مكشوفة'; end if;
  if has_function_privilege('anon', 'public.citizen_complaint_set_status(uuid,text,text)', 'execute') then raise exception 'T7: set_status مكشوفة'; end if;
  if has_function_privilege('anon', 'public.citizen_complaint_add_note(uuid,text)', 'execute') then raise exception 'T7: add_note مكشوفة'; end if;
  if has_function_privilege('anon', 'app.disbursement_json(public.payroll_disbursements)', 'execute') then raise exception 'T7: disbursement_json مكشوفة'; end if;
  if has_function_privilege('anon', 'app.disbursement_kind_label(text)', 'execute') then raise exception 'T7: disbursement_kind_label مكشوفة'; end if;
  if has_function_privilege('anon', 'app.activity_monthly_report()', 'execute') then raise exception 'T7: activity_monthly_report مكشوفة'; end if;
  if has_function_privilege('anon', 'app.data_retention_catalog_disbursements()', 'execute') then raise exception 'T7: data_retention_catalog_disbursements مكشوفة'; end if;
  if has_function_privilege('anon', 'app.platform_reset_catalog_disbursements()', 'execute') then raise exception 'T7: platform_reset_catalog_disbursements مكشوفة'; end if;
  if not has_function_privilege('anon', 'app.citizen_token_valid(text)', 'execute') then raise exception 'T7: citizen_token_valid سُحبت (ستتعطل سياسة التخزين)'; end if;
  if not has_function_privilege('authenticated', 'public.citizen_complaint_set_status(uuid,text,text)', 'execute') then raise exception 'T7: set_status سُحبت عن الموظفين'; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'citizen\_%' and has_function_privilege('anon', p.oid, 'execute');
  if v_n <> 10 then raise exception 'T7: عدد دوال الزائر يجب أن يكون 10، جاء %', v_n; end if;
  raise notice 'T7 OK — مصفوفة الأذونات (10 دوال زائر)';
end $$;

-- ═══ T8 · تنفيذ فعلي بدور anon (كما يصل من PostgREST) ═══
do $$ declare a jsonb; begin
  set local role anon;
  a := public.citizen_sign_in('سعد كريم', '0770 900 2001');
  reset role;
  if (a ->> 'token') is null then raise exception 'T8: الزائر لم يحصل على رمز: %', a; end if;
  if (select count(*) from public.citizen_accounts where phone = '07709002001') <> 1 then raise exception 'T8: الحساب لم يُنشأ'; end if;
  raise notice 'T8 OK — بوابة الزائر تعمل بدور anon';
end $$;

-- ═══ T9 · جدول المحاولات محجوب عن كل الأدوار ═══
do $$ begin
  if has_table_privilege('anon', 'public.citizen_signin_attempts', 'select') then raise exception 'T9: anon يقرأ المحاولات'; end if;
  if has_table_privilege('authenticated', 'public.citizen_signin_attempts', 'select') then raise exception 'T9: authenticated يقرأ المحاولات'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.citizen_signin_attempts'::regclass) then raise exception 'T9: RLS غير مفعّل'; end if;
  raise notice 'T9 OK — جدول المحاولات محجوب';
end $$;

do $$ begin raise notice 'ALL ROUND-9 GUARD TESTS PASSED'; end $$;

rollback;
