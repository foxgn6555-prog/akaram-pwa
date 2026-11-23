# الجولة ⑫ — إظهار الوحدات في التنقّل

> **التاريخ:** ٢٠٢٦-١١-١٩ · **الفرع:** `arena/f49ad6a1-akaram-pwa`
> **الحالة:** مكتمل ومُختبَر · **لم يُدمج** (يُدمج في الجولة الأخيرة).

---

## ① المشكلة الأصلية

طلبت: «نعم اجعل كل الصفحات ظاهره لكن اجمعهن بوحده واحده».

الوحدات كانت **تعمل** لكن **لا مدخل لها في الشريط الجانبي** — تُفتح فقط بكتابة
العنوان يدوياً. هذا أسوأ من صفحة معطّلة: الصفحة موجودة ومكتوبة ومختبَرة، والمستخدم
لا يدري بوجودها.

## ② ما وُجد — لا ستة بل **ثمانية**

بدأت بالبحث عن الستة المعروفة، فتملّى الـفحص الشامل حالات أخرى بنفس النمط.

| المسار | الوحدة | الحالة قبل |
|---|---|---|
| `/ops-room/map-planning` | محرّر الخريطة | ❌ بلا مدخل |
| `/ops-room/map-planning/table` | جدول الأزقة | ❌ بلا مدخل |
| `/ops-room/map-planning/visits` | زيارات الأزقة | ❌ بلا مدخل |
| `/ops-room/map-planning/coverage` | تغطية الأزقة | ❌ بلا مدخل |
| `/ops-room/map-planning/vehicle-visits` | زيارات الآليات | ❌ بلا مدخل |
| `/complaints/guidance` | دليل موظف الشكاوى | ❌ بلا مدخل |
| `/media/designs` | وحدة التصاميم | ❌ بلا مدخل |
| `/it/database/errors` | — | ✅ تحويل `<Navigate>` فقط (ليس نقصاً) |

`/ops-room/map-planning/import` كان **الوحيد الظاهر** من مجموعة التخطيط — وهو ما
جعل الفجوة تُلاحَظ.

## ③ الإصلاح

**`src/config/portals.config.ts`** — ثمانية مدخلات في بوابتين:

```ts
// غرفة العمليات — بعد waste-map (المجموعة المكانية متجاورة)
{ path: '/ops-room/map-planning', labelKey: 'nav.map_editor', icon: 'map-pin', exact: true },
{ path: '/ops-room/map-planning/table', labelKey: 'nav.map_table', icon: 'list' },
{ path: '/ops-room/map-planning/visits', labelKey: 'nav.map_visits', icon: 'map-pin' },
{ path: '/ops-room/map-planning/coverage', labelKey: 'nav.map_coverage', icon: 'globe' },
{ path: '/ops-room/map-planning/vehicle-visits', labelKey: 'nav.map_vehicle_visits', icon: 'truck' },
{ path: '/ops-room/map-planning/import', labelKey: 'nav.map_import', icon: 'upload' },

// الشكاوى والإعلام
{ path: '/complaints/guidance', labelKey: 'nav.complaints_guidance', icon: 'file-text', exact: true },
{ path: '/media/designs', labelKey: 'nav.media_designs', icon: 'layout-grid', exact: true },
```

**`src/i18n/ar/sidebar.json`** — سبعة مفاتيح جديدة، بلا تكرار نص (شكوى «تكرر نفس النص»
سارية — اختبار يفرض تفرّد النصوص الستة).

**`supabase/migrations/20261125000100_permission_catalog_map_planning_nav.sql`** —
كتالوج الصلاحيات مولَّد آلياً: كل وحدة تنقّل صارت لها صلاحية. **٨ مفاتيح جديدة**
(‎`ops-room.map-planning.*` الخمسة + `complaints.guidance` + `media.designs` — والسادس
`map-planning.import` كان موجوداً).

## ④ العقد — ما يمنع التكرار

`tests/contract/map-planning-nav-contract.test.ts` · **٢٠ اختباراً**

لا يكتفي بوجود المدخلات — يفرض **تطابقاً تاماً** بين ما يعمل وما يظهر، على **عشر
بوابات**. القاعدة:

1. مدخل تنقّل صريح ⇒ مقبول
2. حقن تلقائي (`approvals`, `manual-attendance` من `unit-routes.tsx`) ⇒ مقبول
3. **تحويل `<Navigate>`** ⇒ مقبول (مسار قديم للتوافق)
4. **رابط عميق** ⇒ مقبول **إن أُثبت**: يُشار إليه فعلاً من صفحة في `src/`

النوعان ٣ و٤ **لا يُستثنيان بالاسم** بل يُتحقَّق من دليلهما — فلو حُذف الرابط من
الصفحة صار المسار ميتاً وسقط الاختبار.

### اختبارُ الاختبار

أزلت `map-planning/coverage` يدوياً ⇒ **سقط اختباران** بالرسالة الصحيحة. أُعيد.

## ⑤ حالات مقصودة وُثِّقت لا أُخفيت

| المسار | لماذا مقبول |
|---|---|
| `hr/biometric/unmatched` | رابط عميق من `BiometricLedger.tsx` |
| `it/login-support` | رابط عميق من `ITDashboard.tsx` |
| `manager/complaints-guidance` | رابط عميق من `AssignedComplaintsPage.tsx` |
| `it/database/errors` | تحويل `<Navigate to="/it/console" replace />` |
| `approvals` | يُحقن تلقائياً لكل بوابة في `unit-routes.tsx:43` |

## ⑥ بوابة الاختبارات

| البوابة | النتيجة |
|---|---|
| `vitest` كامل | **٣٨٤٣ ✓** · ٤٦٦ ملفاً · ١٠ متخطّى · ٩ todo |
| `tsc --noEmit` | ٠ |
| `eslint` | ٠ |

**ثلاثة اختبارات قديمة حُدِّثت** (كانت تثبّت العدد القديم — تغيير مقصود لا كسر):

- `tests/unit/portals/complaints-units.test.ts`: ١٢ ⇒ ١٣
- `tests/contract/media-portal-contract.test.ts`: ٨ ⇒ ٩
- `tests/contract/permission-catalog.test.ts`: أُعيد توليد الكتالوج

## ⑦ ملاحظة على ذات الاختبار

الفشل الأول كان في اختباري أنا: `approvals` ظهر «مدخلاً ميتاً» لأن الاختبار لم يعرف
الحقن التلقائي. الاختبار الضعيف كان سيمرّر الثغرة — لهذا صار يفحص **السبب** لا مجرد
الوجود.

## ⑧ الملفات

```
src/config/portals.config.ts                                          (+8 مدخلات)
src/i18n/ar/sidebar.json                                             (+7 مفاتيح)
supabase/migrations/20261125000100_permission_catalog_map_planning_nav.sql  (351 سطراً)
tests/contract/map-planning-nav-contract.test.ts                     (20 اختباراً)
tests/unit/portals/complaints-units.test.ts                          (12⇒13)
tests/contract/media-portal-contract.test.ts                         (8⇒9)
```

## ⑨ ما لم يُنفَّذ

`/it/database/errors` تُرك تحويلاً — لم أخلق صفحة له لأن التحويل يعمل منذ سابق ولا
شكوى عليه. تحويله إلى ميزة جديدة خارج نطاق هذه الجولة.
