-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124000600 — الجولة ⑪: سقف الوقت ٨ ثوانٍ ⇒ ١١٠، والدفعة الفاشلة
--                              لا تُسقط الاستيراد
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## العَرَض من الميدان (لقطتان، ٢٠٢٦-١١)
--
-- ```
-- ⚠ تعذّر إكمال العملية
-- canceling statement due to statement timeout
-- ```
--
-- في وحدة التحكّم: `Failed to load resource: the server responded with a status of 500`.
-- والنتيجة: **لا يُدرَج شيء** — ولا صف واحد.
--
-- ## الجذر (مقيس على قاعدة الإنتاج، ٢٠٢٦-١١-١٩)
--
-- ```
-- select rolname, rolconfig from pg_roles where rolname in ('anon','authenticated');
--
--   anon          => statement_timeout=3s
--   authenticated => statement_timeout=8s     ← ← ←
--
-- select proconfig from pg_proc where proname like 'map_import%';
--
--   public.map_import_batch      => search_path=public, app        (لا سقف)
--   app.map_import_batch         => search_path=public, app        (لا سقف)
--   app.map_import_batch_impl    => search_path=public, app        (لا سقف)
-- ```
--
-- **أي أن سقف المستخدم ٨ ثوانٍ، ولا دالة ترفعه.**
--
-- والقياس: دفعة ٢٠٠ صف = **٨.٦٥ ثانية** (بعد تحسين الجولة ⑦). أي أن كل
-- دفعة تقريباً **تُلغى قبل آخر صف**، فتُرجَع المعاملة كاملة وتضيع.
-- والمشغّل يرى رسالة عامة لا يقول له إن السبب مهلة.
--
-- ## الحماية الناقصة الثانية: الدفعة الفاشلة تُسقط البقية
--
-- في `useMapImport.insert`:
--
--     for (…) {
--       const res = await mapImportSdk.sendBatch(…);   // ← throw عند أي فشل
--       …
--     }
--   } catch (err) { setPhase({kind:'error', …}) }
--
-- فدفعة واحدة فاشلة (من ٣) **توقف الحلقة كلها**: تبقى الشوارع إلى الدفعة
-- السابقة فقط، ويُقال «فشل الإدراج» بلا ذكر للتي نجحت.
--
-- ## الإصلاح — طبقتان
--
--   ① **سقف الوقت**: `SET statement_timeout = '110s'` على **الغلاف العلوي**
--      `public.map_import_batch`. الخاصية `SET` على دالة تُعيد ضبط الإعداد
--      عند دخولها وتُعيده عند خروجها (تحقّق حيّ: دالة بـ`statement_timeout='12s'`
--      تُرجع `12s` من داخل `current_setting`). وهي تتجاوز سقف الدور لأنها
--      تُطبَّق **بعد** سقف الدور.
--
--      لماذا ١١٠ لا ١٢٠؟ السقف العالمي للمشروع ١٢٠ ثانية. ١١٠ يترك عشر
--      ثوانٍ للـrollback وإرجاع الاستجابة قبل أن يقطع الخادم الاتصال.
--
--      ⚠ **لا `set statement_timeout` على `app.map_import_batch`** (غلاف
--      السقف ٣٠٠): ترتيب تطبيق `SET` على دوال متداخلة غير موثوق، والاعتماد
--      عليه هشّ. الخاصية على الغلاف الأبعد كافية وتُورَّث للداخل.
--
--   ② **التحصين في الواجهة**: `try/catch` **داخل** الحلقة، فكل دفعة تُسجَّل
--      نتيجتها، والفاشلة تُضاف إلى `failedBatches` مع سببها، ويُكمل الباقي.
--      لا `throw` يُخرج من كل شيء.
--
-- ## 🔴 اكتشاف أثناء التنفيذ: التدهور تربيعي — الجذر الحقيقي أعمق
--
-- بعد رفع السقف إلى ١١٠ ثانية، قِيس الإدراج على الإنتاج فظهر:
--
--   ```
--   25 صف  =>   634,722 us  (0.63 ث)   ← 25.4 مللي/صف
--   50 صف  => 2,365,177 us  (2.37 ث)   ← 47.3 مللي/صف   (×3.7 عند ×2)
--   75 صف  => 5,300,000 us  (5.30 ث)   ← 70.7 مللي/صف
--   100 صف => 9,500,000 us  (9.50 ث)   ← 95.0 مللي/صف
--   ```
--
--   بينما ٥٠ صفاً في **حالة أخرى** = ٢٥,٢٥٠ us فقط (٠.٥ مللي/صف).
--
-- **المضاعفة تُضاعف الزمن ٣.٧×** ⇒ **O(n²)**، لا O(n).
--
-- السبب (مؤكَّد بقراءة القاعدة):
--
--   trigger `map_streets_overlap_trg` → `app.map_overlap_check()`
--
--   ```sql
--   for r in select * from app.map_nearby_streets(new.zone_id, new.path, new.id)
--   ```
--
--   `map_nearby_streets` تجلب **كل** صف ضمن ٦٠٠ متر — ومنها الصفوف التي
--   أُدرجت **للتوّ في نفس الدفعة**. فالصف رقم n يقارن بـ(n-1) صفاً سبقه.
--   مجموع المقارنات = n(n-1)/2 ⇒ تربيعي.
--
--   القياس: ١٠٠ صف ⇒ ٤,٩٥٠ زوج × ~٢ms (بعد تحسين الجولة ⑩) ≈ ٩.٥ ث ✓
--   مطابق للمقيس.
--
-- ## الأثر الفعلي بعد رفع السقف
--
--   | الصفوف | الزمن | السقف ١١٠ ث |
--   |---|---|---|
--   | ٥٠    | ٠.٦ ث  | ✓ |
--   | ١٠٠   | ٩.٥ ث  | ✓ |
--   | ٢٠٠   | ~٣٨ ث  | ✓ |
--   | ٣٠٠   | ~٨٥ ث  | ✓ (لكن بطيء جداً) |
--   | ٤٥٠ (زون كامل) | ~١٩٠ ث | ✗ **يتجاوز** |
--
--   أي أن ١١٠ ثانية **تكفي ٣٠٠ صف بحدّ السقف** (٨٥ ث) لكنها لا تكفي
--   زوناً كاملاً في دفعة واحدة. والواجهة ترسل ٢٠٠ ⇒ ٣٨ ث للدفعة.
--   والأهم: **٣٨ ثانية لكل دفعة** تجربة سيئة ولا تُحلّ برفع السقف.
--
-- ## ما تفعله هذه الهجرة وما لا تفعله — بصراحة
--
--   ✅ **ترفع السقف** ٨ ث ⇒ ١١٠ ث: يمنع الإلغاء (وهو سبب رسالة ٥٠٠).
--   ✅ **تُحصّن الحلقة**: دفعة فاشلة لا تُسقط البقية.
--   ⛔ **لا تُصلح O(n²)** — الإصلاح بنيوي: إمّا
--        (أ) علمٌ على الدالة يتجاوز فحص التطابق في الدفعات المستوردة
--            (استيراد موثوق المصدر، والتحرير اليدوي يبقى محروساً)، أو
--        (ب) فهرس مكاني حقيقي (PostGIS) بدل `bbox &&` الخطي، مع
--            استثناء صفوف الدفعة نفسها بـ`created_at`.
--      كلاهما **جولة مستقلة**. لا تُخلَط هنا: الهجرة الحالية آمنة ومحدودة،
--      وإضافة تغيير بنيوي إليها يجعل التراجع غامضاً.
--
-- ## الأثر المتوقّع
--
-- | | قبل | بعد |
-- |---|---|---|
-- | سقف الوقت للمستخدم | ٨ ث | ١١٠ ث |
-- | دفعة ٢٠٠ صف | **إلغاء (٥٠٠)** | تنجح (~٣٨ ث) |
-- | دفعة فاشلة من ٣ | يُلغى الكل | يُكمل الاثنتين ويُبلّغ |
-- | ١٠٠ صف (كانت تُلغى) | إلغاء | ٩.٥ ث ✓ |
--
-- ## التراجع
--
-- ```sql
-- create or replace function public.map_import_batch(…)
--   … set search_path = public, app            -- بلا statement_timeout
-- ```
-- (نص الغلاف في `20261122001600_map_public_rpc_wrappers.sql` مع تعديل 00300).
-- ⚠ التراجع يُعيد سقف ٨ ثوانٍ وعيب الإلغاء — لا يُنصح به.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① الغلاف العلوي: سقف ١١٠ ثانية + اليسر نفسه
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.map_import_batch(
  p_zone     uuid,
  p_rows     jsonb,
  p_mahallas jsonb default '{}'::jsonb,
  p_batch    uuid  default null,
  p_meta     jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, app
set statement_timeout = '110s'
as $function$
begin
  /*
   * الحارس أولاً — قبل أي عمل.
   * `map_require_editor()` يرفع `MAP_FORBIDDEN` (errcode insufficient_privilege)
   * إن لم يكن المستخدم محرّراً. لا يُنشأ صف ولا سجل دفعة عند الرفض.
   */
  perform public.map_require_editor();
  return app.map_import_batch(p_zone, p_rows, p_mahallas, p_batch, p_meta);
end $function$;

comment on function public.map_import_batch(uuid, jsonb, jsonb, uuid, jsonb) is
  'الجولة ⑪: غلاف حراسة بسقف ١١٠ ثانية (كان سقف الدور ٨ ثوانٍ فيُلغى كل '
  'إدراج). يتجاوز السقف لأن SET على الدالة يُطبَّق بعد سقف الدور. '
  'ينادي map_require_editor ثم app.map_import_batch (سقف ٣٠٠ صفّاً) → _impl.';

revoke all on function public.map_import_batch(uuid, jsonb, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.map_import_batch(uuid, jsonb, jsonb, uuid, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- ② دالة تشخيص: هل السقف مرفوع فعلاً في هذا الاتصال؟
-- ───────────────────────────────────────────────────────────────────────────

create or replace function app.map_import_limits()
returns table(
  outer_timeout text,
  role_timeout  text,
  global_timeout text,
  batch_cap_rows int
)
language plpgsql
stable
security definer
set search_path = public, app
set statement_timeout = '110s'
as $function$
begin
  return query select
    current_setting('statement_timeout'),
    (
      select coalesce(array_to_string(r.rolconfig, ','), '(none)')
      from pg_roles r
      where r.rolname = current_user
    ),
    (
      select s.setting || coalesce(s.unit, '')
      from pg_settings s where s.name = 'statement_timeout'
    ),
    300;
end $function$;

comment on function app.map_import_limits() is
  'تشخيص الجولة ⑪: يُظهر statement_timeout الفعلي داخل دالة السقف مقابل '
  'سقف الدور والسقف العالمي. للتشخيص لا للواجهة.';

revoke all on function app.map_import_limits() from public, anon;
grant execute on function app.map_import_limits() to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- ③ تحديث أسماء/تعليقات الدوال الداخلية بنفس السلسلة
-- ───────────────────────────────────────────────────────────────────────────

comment on function app.map_import_batch(uuid, jsonb, jsonb, uuid, jsonb) is
  'سقف ٣٠٠ صفّاً في الدفعة (من 20261124000300). يُستدعى من '
  'public.map_import_batch الذي يرفع statement_timeout إلى ١١٠ ثانية.';

notify pgrst, 'reload schema';
