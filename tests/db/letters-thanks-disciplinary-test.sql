-- 00357 · كتب الشكر والتنبيه/الإنذار (بادئة lt): كتاب شكر تلقائي من مكافأة thanks_letter (المدير المفوض والمعاون) + تبليغ المدير المباشر،
--        لا كتاب لباقي أنواع المكافآت، كتاب تنبيه/إنذار يدوي بسبب مع تسلسل سجل الموظف وتبليغ الموظف والمدير، منع غير المخوّلين والمدخلات الخاطئة،
--        مرشّحات letters_list، ثبات الكتاب، كتالوج الصلاحيات.
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values ('da000000-0000-0000-0000-000000000002', 'lt-exec@t.iq'), ('da000000-0000-0000-0000-000000000003', 'lt-dep@t.iq'),
  ('da000000-0000-0000-0000-000000000005', 'lt-hr@t.iq'), ('da000000-0000-0000-0000-000000000009', 'lt-mgr@t.iq'), ('da000000-0000-0000-0000-00000000000a', 'lt-emp@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('da000000-0000-0000-0000-000000000002', 'executive_director'), ('da000000-0000-0000-0000-000000000003', 'deputy_director'),
  ('da000000-0000-0000-0000-000000000005', 'hr_officer'), ('da000000-0000-0000-0000-000000000009', 'department_manager'), ('da000000-0000-0000-0000-00000000000a', 'employee') on conflict do nothing;
insert into public.departments (id, name, code) values ('da000000-0000-0000-0000-0000000000d1', 'lt النقل', 'LTD') on conflict (id) do nothing;
insert into public.employees (id, full_name, employee_number, hire_date, department_id, user_id) values
  ('da000000-0000-0000-0000-0000000000e9', 'lt مدير القسم', 'LT-M', '2015-01-01', 'da000000-0000-0000-0000-0000000000d1', 'da000000-0000-0000-0000-000000000009'),
  ('da000000-0000-0000-0000-0000000000e1', 'lt مجتهد', 'LT-A', '2021-05-01', 'da000000-0000-0000-0000-0000000000d1', 'da000000-0000-0000-0000-00000000000a'),
  ('da000000-0000-0000-0000-0000000000e2', 'lt مقصّر', 'LT-B', '2023-02-01', 'da000000-0000-0000-0000-0000000000d1', null) on conflict (id) do nothing;
update public.employees set manager_id = 'da000000-0000-0000-0000-0000000000e9' where id in ('da000000-0000-0000-0000-0000000000e1', 'da000000-0000-0000-0000-0000000000e2');
select set_config('test.lt_before', (select coalesce(max(letter_no), 0) from public.official_letters where letter_year = extract(year from now() at time zone 'Asia/Baghdad')::int)::text, false);

-- ═══ T1 · المدير المفوض يسجّل «كتاب شكر» ⇒ كتاب «شكر وتقدير» تلقائي برقم متسلسل، بالسبب، مصدره حركة المكافأة، والمدير المباشر يُبلَّغ ═══
select auth.set_test_user('da000000-0000-0000-0000-000000000002');
select set_config('test.lt_tx', (public.exec_treasury_record('reward', null, null, 'da000000-0000-0000-0000-0000000000e1', 'thanks_letter', 'إنجاز حملة النظافة الكبرى قبل موعدها') ->> 'id'), false);
reset role; select set_config('auth.user_id','', false);
do $$ declare l public.official_letters; y int := extract(year from now() at time zone 'Asia/Baghdad')::int; b int := current_setting('test.lt_before')::int; n int; begin
  select * into l from public.official_letters where source_kind = 'treasury' and source_id = current_setting('test.lt_tx')::uuid and kind = 'thanks';
  assert found, 'T1 thanks letter issued';
  assert l.letter_year = y and l.letter_no = b + 1 and l.ref = (b + 1)::text || '/' || y::text, 'T1 numbering: ' || l.ref;
  assert l.kind_label = 'شكر وتقدير' and l.subject = 'شكر وتقدير / lt مجتهد' and l.employee_number = 'LT-A' and l.department_name = 'lt النقل', 'T1 snapshot: ' || l.subject;
  assert jsonb_array_length(l.body) = 3 and (l.body ->> 0) like '%الشكر والتقدير وذلك لقاء: إنجاز حملة النظافة الكبرى قبل موعدها.' and (l.body ->> 2) like '%المدير المباشر (lt مدير القسم)%', 'T1 body: ' || l.body::text;
  assert l.payload ->> 'reward_ref' like 'TR-%' and l.payload ->> 'reason' = 'إنجاز حملة النظافة الكبرى قبل موعدها' and l.payload ->> 'manager_name' = 'lt مدير القسم', 'T1 payload: ' || l.payload::text;
  assert l.signer_title = 'المدير المفوض', 'T1 signer';
  select count(*) into n from public.notifications where user_id = 'da000000-0000-0000-0000-000000000009' and title = 'كتاب شكر وتقدير لأحد منتسبيك' and body like 'صدر الكتاب ' || l.ref || '%lt مجتهد%';
  assert n = 1, 'T1 manager notified: ' || n;
  raise notice 'T1 ✅ كتاب شكر تلقائي % من المكافأة %', l.ref, l.payload ->> 'reward_ref';
end $$;

-- ═══ T2 · المعاون يسجّل كتاب شكر ⇒ كتاب أيضاً · المكافأة النقدية والهدية والإجازة التشجيعية بلا كتاب · لا تكرار ═══
select auth.set_test_user('da000000-0000-0000-0000-000000000003');
do $$ declare j jsonb; n int; lid uuid; begin
  j := public.exec_treasury_record('reward', null, null, 'da000000-0000-0000-0000-0000000000e2', 'thanks_letter', 'مبادرة ذاتية');
  perform public.exec_treasury_record('reward', 100000, null, 'da000000-0000-0000-0000-0000000000e1', 'cash', 'نقدي');
  perform public.exec_treasury_record('reward', null, null, 'da000000-0000-0000-0000-0000000000e1', 'gift', 'ساعة');
  perform public.exec_treasury_record('reward', null, null, 'da000000-0000-0000-0000-0000000000e1', 'incentive_leave', 'إجازة', 1);
  select count(*) into n from public.official_letters where source_kind = 'treasury' and source_id = (j ->> 'id')::uuid; assert n = 1, 'T2 deputy thanks letter: ' || n;
  select count(*) into n from public.official_letters where employee_id = 'da000000-0000-0000-0000-0000000000e1' and kind = 'thanks'; assert n = 1, 'T2 no letters for cash/gift/leave: ' || n;
  reset role; perform set_config('auth.user_id','', false);
  lid := app.letter_for_thanks((j ->> 'id')::uuid);
  select count(*) into n from public.official_letters where source_kind = 'treasury' and source_id = (j ->> 'id')::uuid; assert n = 1 and lid is not null, 'T2 idempotent';
  raise notice 'T2 ✅ شكر من المعاون · لا كتب لباقي الأنواع · لا تكرار';
end $$;

-- ═══ T3 · تنبيه ثم إنذار يدويان: الرقم، السبب، تسلسل السجل («الثاني»)، تبليغ الموظف والمدير، letter_get ═══
select auth.set_test_user('da000000-0000-0000-0000-000000000002');
do $$ declare j1 jsonb; j2 jsonb; l public.official_letters; n int; begin
  j1 := public.letter_issue_disciplinary('da000000-0000-0000-0000-0000000000e1', 'notice', 'التأخر المتكرر عن الدوام الصباحي');
  assert j1 ->> 'kind' = 'notice' and j1 ->> 'kind_label' = 'تنبيه' and j1 ->> 'subject' = 'تنبيه / lt مجتهد' and (j1 -> 'payload' ->> 'prior_count')::int = 0, 'T3 notice json: ' || j1::text;
  assert (j1 -> 'body' ->> 0) = 'لوحظ من قبل الإدارة ما يأتي: التأخر المتكرر عن الدوام الصباحي.' and (j1 -> 'body' ->> 1) like 'لذا نوجّه إليكم هذا التنبيه مع ضرورة%' and (j1 -> 'body' ->> 2) like '%المدير المباشر (lt مدير القسم)%', 'T3 notice body: ' || (j1 -> 'body')::text;
  select count(*) into n from public.notifications where user_id = 'da000000-0000-0000-0000-00000000000a' and title = 'كتاب تنبيه رسمي' and body like 'صدر بحقك الكتاب ' || (j1 ->> 'ref') || '%التأخر%'; assert n = 1, 'T3 employee notified: ' || n;
  select count(*) into n from public.notifications where user_id = 'da000000-0000-0000-0000-000000000009' and title = 'كتاب تنبيه لأحد منتسبيك' and body like '%lt مجتهد%'; assert n = 1, 'T3 manager notified: ' || n;
  j2 := public.letter_issue_disciplinary('da000000-0000-0000-0000-0000000000e1', 'warning', 'تكرار التأخر بعد التنبيه');
  assert j2 ->> 'kind_label' = 'إنذار' and (j2 -> 'payload' ->> 'prior_count')::int = 1 and (j2 -> 'body' ->> 1) like 'لذا تقرَّر توجيه إنذار رسمي إليكم (وهو الثاني في سجلكم)%إنهاء الخدمة.', 'T3 warning: ' || (j2 -> 'body')::text;
  assert (j2 ->> 'letter_no')::int = (j1 ->> 'letter_no')::int + 1, 'T3 sequential';
  select * into l from public.official_letters where id = (j2 ->> 'id')::uuid;
  assert l.source_kind = 'disciplinary' and l.source_id is not null and l.payload ->> 'issued_by_role' = 'executive' and l.issued_by = 'da000000-0000-0000-0000-000000000002', 'T3 source/issuer';
  raise notice 'T3 ✅ تنبيه % ثم إنذار % (الثاني في السجل) مع التبليغات', j1 ->> 'ref', j2 ->> 'ref';
end $$;

-- ═══ T4 · المعاون يصدر إنذاراً (issued_by_role=deputy) · HR والموظف ممنوعان · نوع/سبب/موظف غير صالح ═══
select auth.set_test_user('da000000-0000-0000-0000-000000000003');
do $$ declare j jsonb; begin
  j := public.letter_issue_disciplinary('da000000-0000-0000-0000-0000000000e2', 'warning', 'ترك موقع العمل دون إذن');
  assert j -> 'payload' ->> 'issued_by_role' = 'deputy' and (j -> 'payload' ->> 'prior_count')::int = 0, 'T4 deputy: ' || j::text;
  begin perform public.letter_issue_disciplinary('da000000-0000-0000-0000-0000000000e2', 'reprimand', 'سبب طويل كفاية'); raise exception 'should fail'; exception when others then assert sqlerrm = 'LETTER_KIND_INVALID', 'T4 kind: ' || sqlerrm; end;
  begin perform public.letter_issue_disciplinary('da000000-0000-0000-0000-0000000000e2', 'notice', 'قصير'); raise exception 'should fail'; exception when others then assert sqlerrm = 'LETTER_REASON_REQUIRED', 'T4 reason: ' || sqlerrm; end;
  begin perform public.letter_issue_disciplinary(gen_random_uuid(), 'notice', 'سبب طويل كفاية'); raise exception 'should fail'; exception when others then assert sqlerrm = 'LETTER_EMPLOYEE_INVALID', 'T4 emp: ' || sqlerrm; end;
end $$;
select auth.set_test_user('da000000-0000-0000-0000-000000000005');
do $$ begin
  begin perform public.letter_issue_disciplinary('da000000-0000-0000-0000-0000000000e2', 'notice', 'سبب طويل كفاية'); raise exception 'should fail'; exception when others then assert sqlerrm = 'LETTER_FORBIDDEN', 'T4 hr: ' || sqlerrm; end;
end $$;
select auth.set_test_user('da000000-0000-0000-0000-00000000000a');
do $$ begin
  begin perform public.letter_issue_disciplinary('da000000-0000-0000-0000-0000000000e2', 'notice', 'سبب طويل كفاية'); raise exception 'should fail'; exception when others then assert sqlerrm = 'LETTER_FORBIDDEN', 'T4 emp role: ' || sqlerrm; end;
  raise notice 'T4 ✅ المعاون يصدر · HR/الموظف ممنوعان · المدخلات الخاطئة تُرفض';
end $$;

-- ═══ T5 · المرشّحات: admin_any / disciplinary_any / thanks / termination_any تستثني الجديدة · الثبات · كتالوج الصلاحيات ═══
select auth.set_test_user('da000000-0000-0000-0000-000000000003');
do $$ declare n int; m int; begin
  select count(*) into n from public.letters_list('admin_any', null, 'lt ', 50); assert n = 5, 'T5 admin_any: ' || n;
  select count(*) into n from public.letters_list('disciplinary_any', null, 'lt ', 50); assert n = 3, 'T5 disciplinary_any: ' || n;
  select count(*) into n from public.letters_list('thanks', null, 'LT-', 50); assert n = 2, 'T5 thanks: ' || n;
  select count(*) into n from public.letters_list('termination_any', null, 'lt ', 50); assert n = 0, 'T5 termination_any excludes: ' || n;
  select count(*) into n from public.letters_list('warning', null, 'lt مقصّر', 50); assert n = 1, 'T5 warning by name: ' || n;
  reset role; perform set_config('auth.user_id','', false);
  begin update public.official_letters set subject = 'x' where employee_id = 'da000000-0000-0000-0000-0000000000e1' and kind = 'notice'; raise exception 'should fail'; exception when others then assert sqlerrm = 'LETTER_IMMUTABLE', 'T5 immutable: ' || sqlerrm; end;
  select count(*) into n from public.permission_units where key in ('executive.letters', 'deputy.letters') and 'create' = any(actions); assert n = 2, 'T5 perm units: ' || n;
  select count(*) into m from public.official_letters where kind = 'thanks' and source_kind = 'treasury'; assert m >= 2, 'T5 backfill shape';
  raise notice 'T5 ✅ المرشّحات والثبات والصلاحيات';
end $$;
reset role; select set_config('auth.user_id','', false);
