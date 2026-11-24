# تشخيص: البقع غير المحددة على خريطة النفايات (642 بقعة = 13% من 5,031)

## الأرقام (بناءً على snapshot 2026-11-24)

| المقاس | القيمة |
|---|---|
| إجمالي البقع في `gps_hotspots` (الشهر المعروض) | 5,031 |
| البقع غير المحددة (`geo_sector_id is null`) | 642 |
| النسبة | ≈ 13% |
| الأشهر في النافذة | 2026-10 (معروض)، 2026-11 (جارٍ التجميع) |
|क्रون النسخ الليلي | `30 20 * * *` UTC = `23:30` بغداد |

## ما يعني «غير محددة»

بقعة تُعدّ «غير محددة» عندما `geo_sector_id is null` في صف `gps_hotspots`، أي موقع التوقف (lat/lng) لا يقع داخل أي **سياج نشط** (`gps_geofences` حيث `is_active = true` و `sector_id` غير فارغ) يعرّف قاطعاً.

التدفق في `00333_gps_hotspots_geo_sectors.sql`:
1. عند كل نسخ شهر، المشغل `gps_hotspots_locate_trg` يُنفّذ `app.gps_hotspot_locate(lat, lng)` — يبحث عن أصغر سياج نشط يحتوي النقطة وي_has sector_id.
2. إن لم يوجد سياج → `geo_sector_id = null`، `geo_sector_name = null`، `geo_zone_name = null`.
3. رد `gps_hotspots_list` يتضمن حقل `unlocated` = عدد البقع ذات `geo_sector_id is null` للشهر المعروض.
4. على جانب العميل، `spotSectorIds(h)` يُعيد `[geo_sector_id]` إن وُجد، وإلا يعود إلى `sector_ids` (قواطع الآلية احتياطاً). `placeDescription(h)` تُظهر «لم يُحدَّد القاطع» عندما لا يوجد أي إسناد.

## الأسباب المحتملة للـ 642 بقعة غير محددة (بترتيب الاحتمال)

| السبب | الملاحظة | كيف يُؤكَّد / يُصلح |
|---|---|---|
| ① موقع التوقف خارج حدود كل الزونات النشطة |ocasions التوقف تحدث على طرق رئيسية أو خارج أحياء القواطع المسجَّلة | قارن `lat/lng` للبقع غير المحددة مع حدود `gps_geofences` — إن كانت كلها خارج السياجات، هذا متوقع وليس عطلاً |
| ② سياجzone موجود ولكن `sector_id = null` (غير مربوط بقاطع) | المشغل يشترط `g.sector_id is not null` — سياج بدون sector_id يُتجاهل حتى لو.Contains النقطة | فحص `select count(*) from gps_geofences where is_active and sector_id is null` |
| ③ السياج غير نشط (`is_active = false`) | المشغل يشترط `g.is_active` | فحص السياجات المعطلة التي كانت تحتوي البقع في الماضي |
| ④EPSG/إحداثيات مقلوبة (lng/lat) | `gps_point_in_polygon(p_lat, p_lng, polygon)` — إن كان المخزن يعكس الترتيب، لا تتطابق أي نقطة | مقارنة عينة من `lat/lng` مع خريطة فعّالة |
| ⑤ 점이 على الحدود تماماً | خوارزمية ray-casting قد تُصنّف النقطة على الحد بأنها خارج | 희박 — يؤثر على نقاط محدودة وليس على 642 |

## ما لا يعد عطلاً (حسب التصميم الحالي)

- البقع خارج الزونات **تظل ظاهرة على الخريطة** وتُحسب في الملخص — فقط لا تُحمل اسم قاطع/Zone.
- فلتر «غير محدد» (`waste-filter-sector-unlocated`) يعزلها لعرضها على حدة، وهو ما يُنفذ بالفعل في `OpsWasteMapPage.tsx`.
- `spotSectorIds` يعود إلى `sector_ids` (قواطع الآلية) كاحتياط، فل.btn残一些 البقع غير المحددة قد تُظهر قاطع آليتها بدلاً من «غير محدد».

## التوصيات (لا تُنفذ في هذه الجولة — لا تغيير في السلوك)

1. **تأكيد النسبة**: تشغيل `select count(*) from gps_hotspots where month = <month> and geo_sector_id is null` على بيئة مرحلية للتحقق من 642.
2. **خريطة السياجات غير المرتبطة**: `select name, sector_id, is_active from gps_geofences` — تحديد السياحات النشطة بدون `sector_id` والمناطق غير المشمولة بأي سياج.
3. **عينة من الإحداثيات**: أخذ 10–20 بقعة غير محددة ورسم مواقعها على خريطة لمعرفة ما إذا كانت خارج حدود بغداد/الكرادة/الأعظمية/المنصور.
4. **إن تبين أن السبب② أو ③**: تفعيل/ربط `sector_id` للسياجات المعنية، ثم إعادة تشغيل `update gps_hotspots set lat = lat` (يشغّل المشغل ويُعيد الإسناد) للشهر المعروض.

## المراجع
- `docs/waste-map-2-month-window.md` — تصميم النافذة الشهرين والتقليم.
- `supabase/migrations/00333_gps_hotspots_geo_sectors.sql` — دالة الإسناد الجغرافي وحقل `unlocated`.
- `src/features/gps-hotspots/hotspots.logic.ts` — `spotSectorIds`، `placeDescription`، `spotPlace`.
- `tests/unit/features/waste-map-window.test.ts` — اختبارات regresion لسلوك `unlocated` على جانب العميل.
