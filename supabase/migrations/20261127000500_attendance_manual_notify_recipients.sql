-- ═══════════════════════════════════════════════════════════════════════════
-- 20261127000500 — إشعارات التفعيل اليدوي: المستلمون الخمسة المعتمدون
-- ═══════════════════════════════════════════════════════════════════════════
-- المشكلة (أصلها 20261118150000):
--   `app.manual_att_notify` كانت ترسل إلى `ops_room` + المخوّلين صراحةً
--   فقط. و`tests/db/attendance-manual-test.sql` يثبّت تصميماً أوسع:
--
--       A6 — «إشعارات التفعيل: غرفة العمليات + الموارد + المعاون + التقنية
--              + مشرف البوابة؛ لا بوابة الصيانة»  ⇒  n = 5 بالضبط
--
--   فكان الاختبار يفشل دائمًا (`assert n = 5` جاء 1) — أي أن الحاجز في CI
--   كان يفشل قبل هذا العمل بأسابيع، لا بسببه.
--
--   ⚠ و`n = 5` رقم صحيح **في بيئة الاختبار المعزولة** فقط (فيها مستخدم واحد
--   لكل دور). في الإنتاج ظهر 13 مستلماً لأن كل دور يحمله عدة مستخدمين —
--   وهو سلوك صحيح: العدد يتبع عدد الحاملين الفعليين لا ثابتاً مكتوباً.
--
-- الحل: توسيع المستلمين إلى من لهم صلة فعلية بالنطاق الموقوف:
--
--   ① ops_room           — تُدير الكشف وتحتاجه فوراً                (دائماً)
--   ② it_admin           — مُشغِّل التفعيل، يُبلَّغ بما فعله/بما أُوقف (دائماً)
--   ③ hr_officer         — الرواتب والحضور معطّلان على هذا النطاق      (دائماً)
--   ④ deputy_director    — المعاون: يعتمد الحضورية الشهرية             (دائماً)
--   ⑤ مشرف البوابة       — أصحاب الدور المرتبط بالبوابة الموقوفة فقط.
--                           ⚠ اسم البوابة `transfer-station` والدور
--                           `transfer_station`: التطبيع بـ`replace(_,-)`
--                           ضروري وإلا لم يستلم المشرف شيئاً (عيب وُجد
--                           بالفحص الفعلي قبل الدمج).
--   ⑥ المخوّلون صراحةً    — `attendance_manual_recorders` (كما كان)
--
--   ولا تُشعَر بوابة الصيانة ولا أي دور غير ذي صلة، تطبيقاً لنصّ الاختبار.
--
-- الرابط لكل مستلم يُحدَّد بدوره: غرفة العمليات ← صفحة غرفة العمليات،
-- أصحاب البوابة ← صفحة بوابتهم. البقية بلا رابط (إشعار معلوماتي) — وهذا
-- ما يتحقّق منه الاختبار: `link = '/transfer-station/manual-attendance'`
-- لمشرف البوابة و`link = '/ops-room/manual-attendance'` لغرفة العمليات.
--
-- الترقيم: 20261127000500 — بعد 00400.
-- التراجع: أعد تشغيل 20261118150000 (يستعيد النسخة السابقة للدالة).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.manual_att_notify(p_activation uuid, p_event text) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  a        public.attendance_manual_activations;
  r        record;
  v_title  text;
  v_body   text;
  v_link   text;
  v_scope  text;
  v_label  text;
begin
  select * into a from public.attendance_manual_activations where id = p_activation;
  if a.id is null then return; end if;

  v_label := app.manual_att_portal_label(a.portal);
  v_scope := app.manual_att_scope_label(a.branch_id, a.department_id, a.include_sub_departments);

  if p_event = 'on' then
    v_title := 'تفعيل الحضور اليدوي — ' || v_label;
    v_body  := 'أُوقفت البصمة منطقياً لنطاق «' || v_scope || '» اعتباراً من '
               || a.starts_on::text
               || ' وأُضيفت صفحة «الحضور اليدوي» للحسابات المخوّلة وغرفة العمليات. السبب: '
               || a.reason;
  else
    v_title := 'إيقاف الحضور اليدوي — ' || v_label;
    v_body  := 'عادت البصمة لنطاق «' || v_scope || '» بعد ' || a.ends_on::text
               || '. الأيام التي لم يُسجَّل كشفها تبقى بانتظار الكشف وتمنع اعتماد الحضورية حتى تكتمل.';
  end if;

  -- ⚠ مستخدم واحد قد يحمل دورين معاً (غرفة عمليات + مشرف بوابة). التجميع
  --   على `user_id` يمنع إشعارين متطابقين لنفس الشخص، ويحسم الرابط بأعلى
  --   أولوية: البوابة (١) ← غرفة العمليات (٢) ← البقية (٣).
  for r in
    with cand as (
      -- ① مشرف البوابة الموقوفة: له رابط صفحة بوابته تحديداً.
      --    ⚠ الاسم يختلف: البوابة `transfer-station` بشرطة، والدور
      --    `transfer_station` بشرطة سفلية. المقارنة بالتطبيع ضرورية،
      --    وإلا لم يستلم مشرف البوابة شيئاً (عيب حقيقي وُجد بالفحص).
      select ur.user_id, 1 as prio, ur.role::text as role
        from public.user_roles ur
       where replace(ur.role::text, '_', '-') = a.portal
         and ur.role::text not in ('employee', 'maintenance')

      union all

      -- ② غرفة العمليات: تُدير الكشف
      select ur.user_id, 2, 'ops_room'::text
        from public.user_roles ur
       where ur.role = 'ops_room'

      union all

      -- ③ التقنية · الموارد · المعاون
      select ur.user_id, 3, ur.role::text
        from public.user_roles ur
       where ur.role in ('it_admin', 'hr_officer', 'deputy_director')

      union all

      -- ④ المخوّلون صراحةً لهذا التفعيل
      select ar.user_id, 4, null::text
        from public.attendance_manual_recorders ar
       where ar.activation_id = p_activation
    )
    select c.user_id, min(c.prio) as priority,
           (array_agg(c.role order by c.prio))[1] as role
      from cand c
     group by c.user_id
     order by min(c.prio), c.user_id
  loop
    -- الرابط بحسب الدور. **الترتيب مهم**: مشرف البوابة يسبق فحص غرفة
    -- العمليات، لأن حساباً واحداً قد يحمل الدورين — والاختبار يثبّت أن
    -- مشرف البوابة يستلم رابط صفحة بوابته تحديداً.
    v_link := case
                when replace(r.role, '_', '-') = a.portal
                  then '/' || a.portal || '/manual-attendance'
                when r.role = 'ops_room' then '/ops-room/manual-attendance'
                else null
              end;
    -- نُبقي دالة الربط الأصلية كأساس عند غياب رابط صريح (تحترم الصلاحيات)
    if v_link is null then
      v_link := app.manual_att_user_link(r.user_id, p_activation);
    end if;

    perform app.hr_notify(r.user_id, v_title, v_body, v_link,
                          'att_manual_' || p_event || ':' || a.id::text, 'warning');
  end loop;
end$$;

comment on function app.manual_att_notify(uuid, text) is
  'إشعار التفعيل/الإيقاف: غرفة العمليات + التقنية + الموارد + المعاون + مشرف البوابة + المخوّلين. لا بوابة الصيانة (عقد A6 في attendance-manual-test)';

revoke all on function app.manual_att_notify(uuid, text) from public, anon, authenticated;
