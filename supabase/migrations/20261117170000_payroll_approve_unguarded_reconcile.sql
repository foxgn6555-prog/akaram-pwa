-- ═══════════════════════════════════════════════════════════════
-- إصلاح: اعتماد المالية لكشف رواتب الموظفين يفشل بـ DUPLICATE_SUBMIT إن جاء خلال 8 ثوانٍ من فتح الكشف
--   الخلل (قائم قبل مسار الصرف، لا علاقة له به): app.finance_payroll_approve__raw تتحقق من تطابق أرقام الكشف بنداء
--          public.finance_payroll_reconcile(...)، وهو الغلاف المحروس (app.guard_duplicate: نافذة تكرار 8 ثوانٍ + صلاحية finance.payroll/execute).
--          الواجهة تنادي الغلاف نفسه عند فتح كشف الاعتماد (المطابقة). فإن ضغط المحاسب «اعتماد» قبل مرور 8 ثوانٍ على تلك المطابقة
--          رفضه الحارس المتداخل بـ DUPLICATE_SUBMIT (HTTP 400) بلا أي تغيير في الحالة، فيبدو الاعتماد معطَّلاً ثم ينجح بعد لحظات.
--          وللنداء المتداخل أثر ثانٍ: يفرض داخل الاعتماد صلاحية execute على finance.payroll، والاعتماد نفسه مربوط بـ decide فقط.
--   الإصلاح: يُنادى الأصل app.finance_payroll_reconcile__raw(date) مباشرة بدل الغلاف. الغلاف ليس إلا
--          «app.guard_duplicate ثم return query select * from app.finance_payroll_reconcile__raw(p_month)»، فالنتيجة بالأعمدة نفسها.
--          يبقى الحارس الخارجي (public.finance_payroll_approve: تكرار الاعتماد نفسه + صلاحية decide + قفل السجل)،
--          ويبقى فحص الدور داخل الدالة (finance_officer أو super_admin). لا يُضعَف شيء من الحماية.
--   لماذا تعديل في المكان لا إعادة تعريف بنص كامل: نص الدالة الحي على الإنتاج يختلف عن نصها في مجلد الترحيلات (00350)
--          بتعديل 00395 (من لا ملف راتب له، أي pay_type فارغ، لا يوقف الاعتماد: الشرط «and pay_type is not null» في فحص HR_SALARY_MISSING)،
--          وذلك التعديل غير موجود في المجلد (المجلد يقفز من 00371 إلى 00405). إعادة تعريف الدالة بنص كامل كانت ستُلغي أحد النصّين
--          (على الإنتاج أو في أي قاعدة تُبنى من المجلد). لذلك تقرأ الترحيلة التعريف الحالي وتستبدل فيه النداء وحده، فتبقى كل بيئة على سلوكها
--          الحالي عدا هذا الإصلاح. تفشل بوضوح (M5_CHECK) إن لم يرد النداء القديم مرة واحدة بالضبط.
--   لا يتغير: توقيع الدالة، SECURITY DEFINER، search_path، الامتيازات، والغلاف العام finance_payroll_reconcile (يبقى محروساً للنداء المباشر).
--   التراجع: نفّذ الاستبدال المعاكس نفسه:
--          do $r$ begin execute replace(pg_get_functiondef('app.finance_payroll_approve__raw(uuid, boolean)'::regprocedure),
--                                       'app.finance_payroll_reconcile__raw(x.period_month)', 'public.finance_payroll_reconcile(x.period_month)'); end $r$;
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  c_old constant text := 'public.finance_payroll_reconcile(x.period_month)';
  c_new constant text := 'app.finance_payroll_reconcile__raw(x.period_month)';
  v_oid oid := to_regprocedure('app.finance_payroll_approve__raw(uuid, boolean)');
  v_def text;
  v_n int;
  v_chk record;
begin
  if v_oid is null then raise exception 'M5_CHECK: الدالة app.finance_payroll_approve__raw غير موجودة'; end if;
  if to_regprocedure('app.finance_payroll_reconcile__raw(date)') is null then raise exception 'M5_CHECK: الدالة app.finance_payroll_reconcile__raw(date) غير موجودة'; end if;

  v_def := pg_get_functiondef(v_oid);
  v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if v_n <> 1 then
    raise exception 'M5_CHECK: النداء المتداخل يرد % مرة في الدالة الحالية والمتوقع مرة واحدة — نصها تغيّر عمّا كُتبت عليه هذه الترحيلة، راجعها قبل التنفيذ', v_n;
  end if;

  execute replace(v_def, c_old, c_new);

  select p.prosrc, p.prosecdef, p.proconfig into v_chk from pg_proc p where p.oid = v_oid;
  if position(c_new in v_chk.prosrc) = 0 or position(c_old in v_chk.prosrc) > 0 then
    raise exception 'M5_CHECK: النداء لم يُستبدل';
  end if;
  if not v_chk.prosecdef or v_chk.proconfig is distinct from array['search_path=public, app'] then
    raise exception 'M5_CHECK: خصائص الدالة تغيّرت (security definer / search_path)';
  end if;
  if position('HR_PAYROLL_RECONCILE_MISMATCH' in v_chk.prosrc) = 0 or position('app.payroll_carry_uncollected(p_export)' in v_chk.prosrc) = 0 then
    raise exception 'M5_CHECK: بقية منطق الاعتماد ناقصة';
  end if;
end$$;
