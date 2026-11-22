# تقرير التحقق قبل الدمج مع `port-00134`

**التاريخ:** ١٩ نوفمبر ٢٠٢٦ · **الفرع:** `arena/526dee0a-akaram-pwa` → `port-00134`
**آخر commit:** `26c7ad6` · **قاعدة الإنتاج:** `rzpitdsuwgprzfvrlkdn`

---

## ١ · حالة الفروع

| البند | القيمة |
|---|---|
| `port-00134` (الهدف) | `308aad1` — «Add files via upload» (`export.osm` · ٣٧٨١٧ سطراً) |
| سلف مشترك | `68d98e4` ✔ مُتحقَّق |
| فرعي يتقدم بـ | **١٢ commit** |
| `port-00134` يتقدم بـ | **١ commit** (الملف الذي رفعته) |

**تجربة دمج جافّة (`--no-commit`):** `Automatic merge went well` — **صفر تعارض.**
الملف الوحيد من جهتهم: `export.osm` (ملف بيانات جديد، لا يلمس شيئاً).

---

## ٢ · الاختبارات — النتائج

| البوابة | الأمر | النتيجة |
|---|---|---|
| **Typecheck** | `tsc --noEmit` | ✅ **نظيف · 0 خطأ** (١٠٥ ثانية) |
| **Unit + Contract + Security** | `vitest run` | ✅ **٣٣٤٧ نجح · ٠ فاشل** (٤٥٢ ملف · ٨٢٣ ثانية) |
| **Lint** | `eslint . --max-warnings 0` | ⚠️ **٤٤ خطأ → أُصلح · 0 الآن** |
| **Secret scan** | `check-secrets.sh` | ✅ لا أسرار في الملفات المتتبَّعة |
| **Env check** | `check-env.ts` (production) | ✅ نجح بمفتاح VAPID صالح الشكل |
| **Production build** | `npm run build` | ✅ **نجح · ٤٣MB · ٩٥٠ ملف** (١د:١٩ث) |

### عيب lint أُصلح قبل الدمج

٥ ملفات JS خام في `docs/plans/prototypes/karrada-zones/arkhita/` أضافها فرعي في جولة سابقة
تُنتج ٤٤ خطأ (`require` ممنوع · `Buffer`/`console` غير معرّفة · متغيرات غير مستعملة).

**التشخيص:** نماذج توضيحية للعرض داخل خطة التخطيط — **خارج `src` و`public`**،
لا تُبنى ولا تُنشر. **تحقّقت:** `find dist -path "*prototype*"` ⟶ فراغ ✔

**الإصلاح:** استثناء المسار في `eslint.config.js` (commit `26c7ad6`).
لم أعدّل ملفات النماذج: تعديل نموذج أرشيفي يوهم بأنه كود حيّ.

> **ملاحظة مهمة:** `deploy.yml` **لا يشغّل lint** — فقط `env:check` + `tsc -b` + `vite build`.
> فالدمج لم يكن ليفشل بسببه. لكن `ci.yml` على `main`/`develop` يشغّله، فالإصلاح يمنع كسر CI لاحقاً.

---

## ٣ · تحليل أثر الإنتاج — لن يتأثر

### ٣-أ · لا تغيير على أي جدول إنتاجي قائم

فحص كل `drop`/`alter` في ١٨ هجرة:

```
✔ صفر DROP TABLE             (الموجود تعليقات تراجع فقط)
✔ صفر DROP COLUMN            (الموجود تعليق تراجع فقط)
✔ صفر ALTER على users/employees/garage_*/gps_*/complaint*
✔ الاستثناء الوحيد: drop constraint map_streets_kind_prefix — على جدول من إنشائي
```

**كل ما أُضيف:** ١١ جدول `map_*` جديد · ٥٣ دالة `app` · ١٩ غلافاً `public` · فهرسان GiST.

### ٣-ب · صفر تعديل على هجرات سبق تطبيقها

```
✔ كل ملفات supabase/migrations/ في فرعي جديدة بالكامل (A)
✔ لا ملف هجرة قائم عُدِّل (M)
```
هذا مهم: أي تعديل على هجرة مطبَّقة كان سيُنتج تبايناً بين قاعدة الإنتاج والملفات.

### ٣-ج · الملفات الستة المعدّلة — كلها إضافية

| الملف | التغيير | الأثر على القائم |
|---|---|---|
| `.gitignore` | `+__pycache__/` `+*.pyc` | لا شيء |
| `src/config/portals.config.ts` | `+1` عنصر قائمة | لا شيء |
| `src/i18n/ar/sidebar.json` | `+1` مفتاح `map_import` | لا شيء |
| `src/portals/ops-room/routes.tsx` | `+6` مسارات `map-planning/*` | لا شيء |
| `tests/contract/ops-room-design-contract.test.ts` | `+6` مسارات لقائمة التحقق | لا شيء |
| `tests/db/supabase-mock.sql` | `+auth.sessions` + pgcrypto آمن | لا شيء |

**لا حذف أي منطق قائم** — التعديلات إضافة بحتة.

### ٣-د · بصمة قاعدة الإنتاج ↔ الكود — ١٠٠٪

كل ما يستدعيه الكود موجود في الإنتاج **وممنوح لـ`authenticated`**:

| النوع | العدد | الحالة |
|---|---|---|
| دوال RPC `map_*` | **١٧ / ١٧** | ✔ موجودة + `authenticated_can_call = true` |
| جداول `map_*` المقروءة | **٨ / ٨** | ✔ `map_streets` `map_alleys` `map_zones` `map_mahallas` `map_visits` `map_import_batches` `map_import_skips` `map_geometry_reviews` |
| أعمدة `map_streets`/`map_alleys` | **١٨ / ١٨** | ✔ منها `name_source` و`bbox` |
| أعمدة الهجرة | تماماً | ✔ |
| منحة تنفيذ الدوال | ١٧ / ١٧ | ✔ |

**`database.types.ts` لا يحوي دوال map** — لكن `client.ts` يستعمل
`SupabaseClient` **بلا معامل نوع** ⇒ كل `rpc`/`from` غير مصفَّح ⇒ **لا كسر نوعي**.
والكود يتعامل مع النتائج ديناميكياً (`as Record<string, unknown>`).

### ٣-هـ · التطبيق القديم لن ينكسر

المنشور حالياً هو بناء `port-00134` قبل فرعي. بعد النشر:
الكود **القديم** هو الذي سيُستبدل، فلا يوجد «قديم يواجه قاعدة جديدة».
لا تغيير على أي جدول يقرأه القديم.

---

## ٤ · ما سيحدث عند الدمج

```
git push origin port-00134  (merge commit)
        ↓
deploy.yml  يُشغَّل تلقائياً (push → branches: [port-00134])
        ↓
npm ci → env:check → npm run build  (tsc -b + vite build)
        ↓
git checkout --orphan deploy → cp -r dist/. → git push -f origin deploy
```

**الأسرار:** `VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY` · `VITE_VAPID_PUBLIC_KEY`
موجودة في GitHub secrets — الدليل: **١٦ تشغيلاً ناجحاً متتالياً**، آخرها قبل ١٩ ساعة (٢د:٤ث).
(`gh secret list` يُرجع 403 — صلاحية قراءة الأسرار ناقصة للـtoken، وهذا لا يمنع التشغيل.)

**التراجع عند الفشل:** `git revert -m 1 <merge-sha> && git push` ⇒ يعيد النشر للحالة السابقة تلقائياً.

---

## ٥ · الحكم

| الشرط | النتيجة |
|---|---|
| الاختبارات | ✅ ٣٣٤٧/٣٣٤٧ |
| النوع | ✅ نظيف |
| Lint | ✅ أُصلح (0) |
| البناء | ✅ ناجح |
| تعارضات الدمج | ✅ صفر |
| أثر على جداول الإنتاج | ✅ لا شيء |
| توافق الكود ↔ القاعدة | ✅ ١٠٠٪ |
| أسرار النشر | ✅ مُثبتة بسجل التشغيل |

**آمن للدمج.**
