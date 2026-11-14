-- ════════════════════════════════════════════════════════════════════════
-- V-39 + V-40 — تصحيح تعريف «نسبة الحضور» في exec_overview
-- التاريخ: 2026-11-10 · الجولة 15/16 · قرار المستخدم: (أ)
--
-- الحضور = حاضر + تأخير + انصراف مبكر (early_leave) + إذن (time_permit)
-- الإجازة (leave) تبقى مستبعدة من المقام (لا تُحسب ضد الموظف)
-- وكان: early_leave غير محسوب أصلاً (يُحذف من المقام ⇒ تضخيم النسبة)،
--       و time_permit إجازةً في التجميع وحضوراً في السلسلة ⇒ تناقض داخلي.
--
-- طُبِّق فعلياً على المشروع بتاريخ 2026-11-10 (التحقق: نسبة الحضور 10٪ ← 18٪
-- على بيانات 2026-11-01…2026-11-10، وهي القيمة الصحيحة حسابياً).
-- ════════════════════════════════════════════════════════════════════════

do $do$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'exec_overview';

  -- 1) خانة الحضور تشمل الانصراف المبكر والإذن
  d := replace(d,
    '''present'',    count(*) filter (where a.status = ''present''),',
    '''present'',    count(*) filter (where a.status in (''present'', ''early_leave'', ''time_permit'')),');

  -- 2) خانة الإجازة للإجازة فقط (كانت تضم الإذن)
  d := replace(d,
    '''leave'',      count(*) filter (where a.status in (''leave'', ''time_permit'')),',
    '''leave'',      count(*) filter (where a.status = ''leave''),');

  -- 3) السلسلة الزمنية تتوافق مع مقام/بسط النسبة
  d := replace(d,
    'count(*) filter (where a.status in (''present'', ''late'', ''time_permit'')) as p,',
    'count(*) filter (where a.status in (''present'', ''late'', ''early_leave'', ''time_permit'')) as p,');

  execute d;
end $do$;

-- تحقق: يجب أن تظهر الثلاثة في التعريف الجديد ولا يبقى النص القديم
select
  position('''present'',    count(*) filter (where a.status in (''present'', ''early_leave'', ''time_permit''))' in def) > 0 as present_fixed,
  position('''leave'',      count(*) filter (where a.status = ''leave'')' in def) > 0 as leave_fixed,
  position('in (''present'', ''late'', ''early_leave'', ''time_permit'')) as p,' in def) > 0 as series_fixed
from (select pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'exec_overview') s;
