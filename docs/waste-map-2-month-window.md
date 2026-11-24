# توثيق: نافذة خريطة النفايات الشهرية (شهران)

## الغرض من المستند
تسجيل تصميم نافذة الاحتفاظ ببقع التوقف (خريطة النفايات / `gps_hotspots`) في المشروع الأول، والحارس الذي يمنع توسيعها عن طريق الخطأ. **لا تغيير في السلوك** في هذه الجولة — التوثيق والتشخيص والاختبارات regression فقط.

---

## 1. النافذة الحالية: `keep_months = 1` ⇒ شهران معروضان

| القيمة | المعنى |
|---|---|
| `keep_months` | `1` (ثابت، غير مقترح توسيعه) |
| الأشهر المحفوظة | `displayed_month` + `collecting_month` = شهران |
| الشهر المعروض (`displayed_month`) | الشهر السابق Relative إلى الآن بتوقيت بغداد (`Asia/Baghdad`) |
| الشهر الجاري تجميعه (`collecting_month`) | الشهر الحالي بتوقيت بغداد |
| `cutoff` | أول يوم في `displayed_month` (نقاط ما قبله تُدرج في الأرشيف/التدوير في المستودع) |
| مجدول النسخ الليلي | `gps-warehouse-hotspots-nightly` عند `30 20 * * *` UTC = `23:30` بغداد |
| الدالة التي تقرر النافذة | `public.wh_window()` في المستودع (المشروع الثاني) |
| الدالة التي تقلم الأشهر الزائدة | `public.gps_hotspots_prune(date[])` في المشروع الأول |

### كيف تعمل الدورة الليلية (20:30 UTC / 23:30 بغداد)
1. حافة `gps-warehouse` تُستدعى بـ `action = sync_hotspots`
2. تُستدعي `wh_ping()` في المستودع → تُعيد `window = { displayed_month, collecting_month }`
3. تُنسخ هذان الشهران فقط من المستودع إلى المشروع الأول عبر `gps_hotspots_replace_month` (استبدال الشهر كاملاً، لا تراكم)
4. تُستدعي `gps_hotspots_prune({ p_keep_months: [displayed_month, collecting_month] })` → تُحذف كل الأشهر الأخرى من جدولي `gps_hotspots` و `gps_hotspots_sync` في المشروع الأول
5. النتيجة: المشروع الأول يحتفظ بـ **شهرين فقط** في أي وقت

### ما يُحفظ إلى الأبد (لا يُقلم)
جدول `gps_hotspots_month_stats` — إحصاء شهري دائم (صف واحد صغير لكل شهر) يُستخدم للمقارنة «هذا الشهر مقابل الشهر السابق». مسجّل في كتالوج الاحتفاظ (`app.data_retention_catalog()`) بـ `deletable = false`, `default_months = 0`، ووصفه «سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد». इसलिए المقارنة الشهرية تعمل حتى بعد خروج الشهر من النافذة الشهرين.

---

## 2. القيود الثابتة (لا تُعدّل في هذه الجولة)

- **النافذة تبقى شهران (`keep_months = 1`)**. لا تُقترح توسعة إلى 3 أشهر أو أكثر، ولا `keep_months = 2`.
- **لا مهاجرات تُطبَّق على الإنتاج** في هذه الجولة. أي SQL مقترح يذهب إلى `docs/proposed-migrations/` فقط.
- **لا تغيير في سلوك القراءة/الكتابة**: القراءة 읽urée عبر RPC (`gps_hotspots_list`)، الكتابة فقط عبر حافة `gps-warehouse` بـ `service_role`.
-月の خارج النافذة تُحذف من المشروع الأول تلقائياً — هذا السلوك موجود قبل الجولة ⑤ وبعدها.

---

## 3. المراجع في الكود

| الملف | ما يحتوي |
|---|---|
| `supabase/migrations/00329_gps_hotspots.sql` | `gps_hotspots_replace_month`، `gps_hotspots_prune(date[])`، `gps_hotspots_list`، المجدول الليلي |
| `supabase/migrations/00331_gps_hotspots_month_stats.sql` | `gps_hotspots_month_stats` (دائم)، `gps_hotspots_month_stats()` RPC |
| `supabase/migrations/00333_gps_hotspots_geo_sectors.sql` | الإسناد الجغرافي (`geo_sector_id`)، حقل `unlocated` في الرد |
| `supabase/migrations/00369_audit_catalog_and_hotspot_publish.sql` | إخفاء النسخة غير المكتملة حتى اكتمال المزامنة النهائية، منح `prune` لخدمة فقط |
| `supabase/functions/gps-warehouse/index.ts` | `syncHotspots()` — يحدد الشهرين من `wh_ping`، ينسخهما، يُستدعي `prune` |
| `src/features/gps-hotspots/hotspots.logic.ts` | `defaultMonth`، `previousMonth`، `prevMonthOf`، `compareMonths`، `applyFilters` (يشمل `unlocated`) |
| `tests/db-warehouse/pull-engine-test.sql` | `E9` — يختبر `wh_window()` يعيد `keep_months = 1` |
| `tests/db/gps-hotspots-test.sql` | `G3` — يختبر `gps_hotspots_prune` يُحذف الشهر خارج النافذة |

---

## 4. التشخيص: 642 بقعة غير محددة (13% من 5,031)

انظر `docs/unlocated-hotspots-diagnosis.md`.

---

## 5. اختبارات regresion المضافة في هذه الجولة

- `tests/unit/features/waste-map-window.test.ts` —vitest (تشغيل عبر `npx vitest run`): pl이기 `defaultMonth`، `previousMonth`، `prevMonthOf`، `compareMonths`، `spotSectorIds`، `spotPlace`، `rankTop`، وسلوك فلتر `unlocated` — كلها من جانب العميل وتعتمد على منطق النافذة.
- اختبارات SQL existentes (ليست في vitest suite): `tests/db-warehouse/pull-engine-test.sql` (`E9` للنافذة) و `tests/db/gps-hotspots-test.sql` (`G3` للتقليم).
