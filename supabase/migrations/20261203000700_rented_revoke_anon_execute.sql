-- 20261203000700 — سحب EXECUTE من anon عن دوال الآليات المؤجرة (وإصلاح ثغرة سابقة)
--
-- السبب: 20261203000100–000300 تنشئ 14 دالة في المخطط public بلا `revoke` صريح، فترث
-- EXECUTE من الامتياز الافتراضي لـ PostgreSQL. القاعدة القائمة في المشروع
-- (20261115120000_revoke_anon_execute_public_schema.sql) تمنع ذلك، لكنها طبّقت
-- `alter default privileges` بصلاحية الدور الذي شغّلها، فالدوال المُنشأة لاحقاً من دور آخر
-- ترث EXECUTE من PUBLIC. النتيجة في الإنتاج: anon يستطيع تنفيذ الـ14 دالة.
--
-- الأثر الفعلي: محدود — كل الدوال تفحص الدور بـ app.has_role() فترفع *_FORBIDDEN،
-- لكن طبقة الدفاع الأولى (منع التنفيذ أصلاً) كانت غائبة. هذا الترحيل يعيدها.
--
-- يستثني صراحةً دوال بوابة المواطن (citizen_*) — القائمة البيضاء في 20261115120000.
-- ويضمّ disclosure_reject: كانت مكشوفة لـ anon قبل هذا الترحيل (محمية داخلياً لكن يجب سحبها).
--
-- ⚠️ لا يُغيّر أي تعريف دالة ولا أي بيانات — امتيازات تنفيذ فقط. آمن للتكرار.

begin;

-- ① الدوال الأربع عشرة للآليات المؤجرة
revoke execute on function public.rented_attendance_month(date, text)                        from public, anon;
revoke execute on function public.rented_attendance_garages()                               from public, anon;
revoke execute on function public.rented_attendance_set_day(uuid, uuid, date, text, text)   from public, anon;
revoke execute on function public.rented_discharge_save(uuid, numeric, numeric, text)       from public, anon;
revoke execute on function public.rented_discharge_list()                                   from public, anon;
revoke execute on function public.rented_tax_save(uuid, text, numeric, text)                from public, anon;
revoke execute on function public.rented_tax_clear(uuid, text)                              from public, anon;
revoke execute on function public.rented_tax_list()                                         from public, anon;
revoke execute on function public.rented_salary_save(uuid, uuid, date, text, numeric, text) from public, anon;
revoke execute on function public.rented_payroll_sheet(date)                                from public, anon;
revoke execute on function public.rented_month_submit(date)                                 from public, anon;
revoke execute on function public.rented_month_decide_deputy(date, boolean, text)          from public, anon;
revoke execute on function public.rented_month_pay(date, text)                              from public, anon;
revoke execute on function public.rented_attendance_audit_list(int)                         from public, anon;

-- ② إعادة المنح للمسجّلين (لا نسحب من authenticated — البوابات الداخلية تستدعيها)
grant execute on function public.rented_attendance_month(date, text)                        to authenticated, service_role;
grant execute on function public.rented_attendance_garages()                               to authenticated, service_role;
grant execute on function public.rented_attendance_set_day(uuid, uuid, date, text, text)   to authenticated, service_role;
grant execute on function public.rented_discharge_save(uuid, numeric, numeric, text)       to authenticated, service_role;
grant execute on function public.rented_discharge_list()                                   to authenticated, service_role;
grant execute on function public.rented_tax_save(uuid, text, numeric, text)                to authenticated, service_role;
grant execute on function public.rented_tax_clear(uuid, text)                              to authenticated, service_role;
grant execute on function public.rented_tax_list()                                         to authenticated, service_role;
grant execute on function public.rented_salary_save(uuid, uuid, date, text, numeric, text) to authenticated, service_role;
grant execute on function public.rented_payroll_sheet(date)                                to authenticated, service_role;
grant execute on function public.rented_month_submit(date)                                 to authenticated, service_role;
grant execute on function public.rented_month_decide_deputy(date, boolean, text)          to authenticated, service_role;
grant execute on function public.rented_month_pay(date, text)                              to authenticated, service_role;
grant execute on function public.rented_attendance_audit_list(int)                         to authenticated, service_role;

-- ③ ثغرة سابقة: disclosure_reject كانت منفَّذة لـ anon (محمية داخلياً، لكن تُسحب)
do $disc$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'disclosure_reject') then
    execute 'revoke execute on function public.disclosure_reject(uuid, text) from public, anon';
    execute 'grant execute on function public.disclosure_reject(uuid, text) to authenticated, service_role';
  end if;
end $disc$;

-- ④ الدوال القديمة للضريبة (00251) — مربوطة الآن بحرس الكتابة، وتُسحب من anon أيضاً
do $oldtax$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'deputy_rented_tax_set_pct') then
    execute 'revoke execute on function public.deputy_rented_tax_set_pct(numeric, text) from public, anon';
    execute 'revoke execute on function public.deputy_rented_tax_override_set(uuid, text, numeric, text, date) from public, anon';
    execute 'revoke execute on function public.deputy_rented_tax_override_clear(uuid, text) from public, anon';
    execute 'grant execute on function public.deputy_rented_tax_set_pct(numeric, text) to authenticated, service_role';
    execute 'grant execute on function public.deputy_rented_tax_override_set(uuid, text, numeric, text, date) to authenticated, service_role';
    execute 'grant execute on function public.deputy_rented_tax_override_clear(uuid, text) to authenticated, service_role';
  end if;
end $oldtax$;

commit;

-- ── فحص ذاتي ─────────────────────────────────────────────────────────────────
-- الشرط: صفر دوال rented_* منفَّذة لـ anon، و14 دالة منفَّذة لـ authenticated.
do $grantcheck$ declare v_bad text; v_n int;
begin
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'rented\_%'
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad is not null then
    raise exception 'RENTED_GRANTS: دوال ما زالت منفَّذة لـ anon: %', v_bad;
  end if;

  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('rented_attendance_month','rented_attendance_garages','rented_attendance_set_day',
                       'rented_discharge_save','rented_discharge_list','rented_tax_save','rented_tax_clear',
                       'rented_tax_list','rented_salary_save','rented_payroll_sheet','rented_month_submit',
                       'rented_month_decide_deputy','rented_month_pay','rented_attendance_audit_list')
     and has_function_privilege('authenticated', p.oid, 'execute');
  if v_n <> 14 then
    raise exception 'RENTED_GRANTS: دوال الآليات المؤجرة المنفَّذة للمسجّلين يجب أن تكون 14، وُجد %', v_n;
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'disclosure_reject')
     and has_function_privilege('anon', 'public.disclosure_reject(uuid, text)', 'execute') then
    raise exception 'RENTED_GRANTS: disclosure_reject ما زالت منفَّذة لـ anon';
  end if;
end $grantcheck$;
