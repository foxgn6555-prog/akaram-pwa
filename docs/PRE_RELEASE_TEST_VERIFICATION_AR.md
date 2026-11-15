# تقرير تغييرات الاختبارات والتحقق قبل النشر — جزيرة الأكارم PWA

رأس الشيفرة المفحوص: `2fd7d1ff763b2aaf89b0e9573c9ff647334174cf`

الفرع: `arena/73e961af-akaram-pwa` — الأساس: `f69fb6a224757c6dc87e46734882a92c6fe590c7` من `port-00134`

طلب الدمج: [#1](https://github.com/foxgn6555-prog/akaram-pwa/pull/1)

> الحالة التشغيلية: لا دمج، لا نشر، لا تطبيق مهاجرات على المشروع الحي، ولا إعادة لضبط Auth الحي في هذه الجولة. التحقق الحي المضاف هنا قراءة فقط (`SELECT`).

## 1. الخلاصة التنفيذية

- تغيّر **24 ملف اختبار** مقارنة بالأساس: **13 ملفاً جديداً** (12 TypeScript/TSX + ملف SQL واحد) و**11 ملفاً معدّلاً** (6 TypeScript/TSX + 5 SQL). لم يُحذف أي اختبار.
- الملفات الجديدة من نوع TypeScript/TSX تحتوي **114 حالة اختبار منفّذة**، وأضيفت حالة منتصف الليل إلى ملف موجود. أضيف أيضاً جناح SQL محصّن لموافقات الأدوار الحساسة.
- عتبات التغطية بقيت **70/70/70/70** كما في الأساس. لم يُخفّض حاجز ولم تُحذف اختبارات لتمرير الفحص.
- التغطية المحلية النهائية على رأس الشيفرة:

| المقياس | النهائي | الحاجز |
|---|---:|---:|
| Statements | 78.88% | 70% |
| Branches | 70.39% | 70% |
| Functions | 79.16% | 70% |
| Lines | 80.35% | 70% |

- نتيجة الاختبارات الكاملة محلياً: **386 ملفاً ناجحاً / 10 ملفات متخطّاة**، و**2656 اختباراً ناجحاً / 1 متخطّى / 9 todo**.
- حواجز GitHub على رأس الشيفرة: CI، E2E، Security Scan، DB Migrations Smoke، DB SQL Tests. النتائج التفصيلية في §2.
- حاجز SQL المحصّن يشمل **15 ملفاً**. تقرير SQL غير المحصّن يشمل **219 ملفاً** وهو غير حاجز بالتصميم؛ ظهرت فيه 10 إخفاقات موثقة في §8 ولم تُخفَ.
- المهاجرات الأربع الجديدة ما زالت **غير مطبقة حياً** وفق آخر قراءة فقط: الإشعارات Realtime، تقاطع الجلسات الليلية، RPC إثباتات التواجد، وكتالوج صلاحية الإثباتات.
- الأيقونات السبع الأصلية مطابقة للأساس بايتاً ببايت. لم يُعد `interactive-widget=` إلى viewport. قرارات Leave السابقة لم تُمسّ.

## 2. نتائج البوابات على رأس الشيفرة

| البوابة | التشغيل | النتيجة | ما أثبتته |
|---|---|---|---|
| CI | [43710041083](https://github.com/foxgn6555-prog/akaram-pwa/actions/runs/43710041083) | نجاح | secrets، env، lint، typecheck، unit/security، coverage 70%، build |
| E2E | [43710041138](https://github.com/foxgn6555-prog/akaram-pwa/actions/runs/43710041138) | نجاح | تشغيل Playwright على Chromium وWebKit وmobile-chrome وفق الإعداد الحالي |
| Security Scan | [43710041137](https://github.com/foxgn6555-prog/akaram-pwa/actions/runs/43710041137) | نجاح | `npm audit --audit-level=high`: لا high/critical |
| DB Migrations Smoke | [43710041098](https://github.com/foxgn6555-prog/akaram-pwa/actions/runs/43710041098) | نجاح | reset محلي، 401 مهاجرة، smoke، دورة الشكاوى، إسناد GPS، وتوليد أنواع غير فارغة |
| DB SQL Tests | [43710041148](https://github.com/foxgn6555-prog/akaram-pwa/actions/runs/43710041148) | نجاح | حاجز المحصّنة 15 ملفاً؛ ثم تقرير غير المحصّنة |

التشغيل السابق `c927b799` اكتمل أخضر في البوابات الخمس. رأس الشيفرة الحالي `2fd7d1ff` يضيف تقوية مؤكّد الرفض في اختبار SQL فقط، وأعيد تشغيل البوابات عليه.

### نتيجة محلية مساندة

| الفحص | النتيجة |
|---|---|
| `npm run test:coverage` | نجاح؛ 78.88 / 70.39 / 79.16 / 80.35 |
| `npm run typecheck` | نجاح |
| `npm run lint` | نجاح بـ `--max-warnings 0` |
| `npm run env:check` | نجاح بمتغيرات CI placeholders |
| `bash scripts/check-secrets.sh` | نجاح |
| `git diff --check` | نجاح |
| `npm run build` | نجاح؛ precache 404 entries / 8448.44 KiB، و`dist/sw.mjs` بحجم 20.00 kB |
| `npm audit --audit-level=high` | نجاح؛ 0 high و0 critical، مع 2 low و10 moderate متبقية |
| الأيقونات السبع | SHA-256 مطابق للأساس `f69fb6a2` |
| PostgreSQL مضمّن محلي | 401/401 مهاجرة؛ ROLE_GATE وPARITY صحيحان؛ 13 ملف SQL محصّناً نجحت محلياً، وملفا pgTAP تحققا في CI |
| بذور الأقسام | نجح جناح المحصّنة مع بذور GEN/WKS وبدونها |
| mutation لمؤكّدات الرفض | نجاح العبارة غير المتوقعة يفشل الاختبار؛ الخطأ المختلف عن الرمز المتوقع لا يُبتلع |
| `npx playwright test --list` | 141 حالة في 20 ملفاً عبر المشاريع الثلاثة؛ هذا تعداد تعريفات وليس ادعاء أن كلها نُفّذت بلا skip |
| `npm run format:check` | فشل واسع في 1268 ملفاً، يشمل ملفات لم تغيّرها الجولة؛ ليس حاجزاً في CI ولم تُنفّذ إعادة تنسيق جماعية |

## 3. حدود الإثبات

1. اختبارات SDK/الخدمات تستخدم mocks محلية ولا تتصل بالمشروع الحي. هي تثبت أسماء RPC/الجداول، المعاملات، التطبيع، ومسارات الخطأ، لا تثبت وحدها RLS الحي.
2. عقود `pre-release-fixes-contract` تقرأ ملفات المصدر وتمنع الانحدار النصي/البنيوي؛ لا تحل محل اختبار متصفح أو SQL حي.
3. مشغّل PostgreSQL المضمّن محلياً يشغّل المهاجرات على قاعدة حقيقية، لكن إضافات Supabase غير الموجودة فيه (`cron`/`net`/`vault`) عُوّضت بـ shims لا تنفّذ جدولة أو HTTP. لذلك التحقق النهائي لهذه المسارات هو CI/Supabase المحلي، لا الـ shim.
4. خطوة توليد الأنواع في DB Smoke تتحقق أن الملف الناتج غير فارغ؛ ليست مقارنة بايتية كاملة مع `src/types/database.types.ts`.
5. E2E الأخضر يعني نجاح مسار Playwright بالإعداد الحالي. بعض specs مشروطة بحسابات E2E أو preview وقد تُتخطّى؛ لا يُستنتج أن كل رحلة مستخدم حي اختُبرت.
6. تقرير SQL غير المحصّنة `continue-on-error` بحكم التصميم؛ لا يُستخدم كحاجز، وإخفاقاته مفصولة في §8.

## 4. الملفات المعدّلة — TypeScript/TSX

### `tests/unit/console/capture.test.ts`

- التغيير: استيراد `type Mock` وتعريف `send` بـ `Mock<(ev: ConsoleEventPayload[]) => Promise<void>>` بدلاً من `ReturnType<typeof vi.fn>`.
- السبب: توافق أنواع مع Vitest 4 دون تغيير التأكيدات.
- الأثر على النظام المنشور: لا تغيير سلوكي؛ يحافظ على اختبار التقاط console/batch send كحاجز قابل للترجمة.

### `tests/unit/portals/media-design-export.test.tsx`

- التغيير: `beforeEach` بجسم block، ومحاكاة الرفض بـ `mockImplementation(async () => { throw ... })`، ومحاكي `jsPDF` قابل للاستدعاء بـ `new`.
- السبب: أنماط صحيحة في Vitest 4؛ تجنّب إعادة mock من الخطاف وفشل constructor.
- الأثر: لا تغيير في التصدير نفسه؛ يبقي اختبار PDF/PowerPoint/HTML/Word وحالة `NO_PAGES` فعالاً.

### `tests/contract/ops-room-design-contract.test.ts`

- التغيير: إضافة `ContractorProofs/OpsContractorPresenceProofsPage` إلى قائمة صفحات غرفة العمليات الموحّدة.
- السبب: الصفحة الجديدة يجب أن تخضع لعقد التصميم نفسه.
- الأثر: يمنع إضافة عارض إثباتات خارج نمط غرفة العمليات؛ لا يغيّر الصفحة المنشورة مباشرة.

### `tests/security/portal-layout-contract.test.ts`

- التغيير: توقع درج الموبايل `z-[90] h-dvh` مع safe-area، والخلفية `z-[85]`.
- السبب: تثبيت إصلاح تراكب الدرج فوق الهيدر على الموبايل.
- الأثر: يحرس إصلاح تجربة الموبايل؛ عرض الدسكتوب يبقى كما يفحصه العقد.

### `tests/unit/features/live-data-logic.test.ts`

- التغيير: حساب الفلاتر بتوقيت بغداد، وإضافة حالة `20:59:59Z` / `21:00:00Z` لقلب اليوم، وفحص `isoDay` و`dayOf`.
- السبب: منع اعتماد يوم جهاز المستخدم أو UTC في فلاتر البث.
- الأثر: يثبت اتساق اليوم/الفلاتر/عمود اليوم مع بغداد، خصوصاً عبور منتصف الليل.

### `tests/unit/portals/ops-live-data-00288.test.tsx`

- التغيير: توقع تاريخ اليوم عبر `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' })`.
- السبب: إزالة فشل كاذب عندما يختلف timezone جهاز الاختبار.
- الأثر: يبقي اختبار واجهة بيانات البث مرتبطاً ببغداد لا بمنطقة الـ runner.

## 5. الملفات الجديدة — TypeScript/TSX

| الملف | الحالات | ما يغطيه | الأثر على النظام المنشور |
|---|---:|---|---|
| `tests/security/pre-release-fixes-contract.test.ts` | 6 | قصّ مفاتيح Supabase، VAPID في CD/env، مهاجرات الإشعارات/الليل/الإثباتات، جرس الهيدر، PWA/orientation/install، الدرج/الدخول، وبث بغداد | يمنع رجوع إصلاحات ما قبل النشر؛ عقد نصي/بنيوي لا اختبار حي |
| `tests/unit/features/pwa/pwa-nav-controls.test.tsx` | 2 | الاختفاء في المتصفح العادي؛ في standalone رجوع/تقدم/تحديث مع تاريخ React Router | يثبت سلوك أزرار التطبيق المثبت فقط |
| `tests/unit/lib/query-keys-all.test.ts` | 29 | كل مصانع Query Keys: بادئة الوحدة، مصفوفة، وسائط اختيارية | يقلل خطر كسر cache/invalidation بين الوحدات |
| `tests/unit/portals/ops-contractor-presence-proofs.test.tsx` | 4 | تسجيل الوحدة view-only، الصور الموقّعة والأعداد الثلاثة بلا أزرار كتابة، فلتر المتعهد وlightbox/Escape، وخطأ عربي | يحرس عارض إثباتات غرفة العمليات كقراءة فقط |
| `tests/unit/services/auth-session.sdk.test.ts` | 12 | الدخول برموز الخادم، تطبيع البريد، أخطاء بلا كلمة مرور، ردود ناقصة/غير JSON، فشل حفظ الجلسة، getSession/token، المستمع والإلغاء، أولوية الأدوار، logout | يثبت عقد الجلسة الآمن على مستوى SDK |
| `tests/unit/services/media-surface.sdk.test.ts` | 10 | التذاكر/الدمج/الأرشفة، الفلاتر، رفع دفعات مرتب بلا upsert، روابط ساعة، الغلاف، تفاصيل التصميم وzoom=0، القوالب والغلافات | يحمي عقود الإعلام والتخزين من فقدان null/0 أو ترتيب الملفات |
| `tests/unit/services/operations-support.sdk.test.ts` | 15 | attendanceEdits وبغداد، disclosuresUnit، contractors/checkin وصور، loginSupport، gpsHotspots قراءة فقط، platformReset معاينة/dفعات/أخطاء | يثبت معاملات خدمات مساندة العمليات؛ أفعال reset مفحوصة بـ mocks لا بتنفيذ حي |
| `tests/unit/services/ops-contractor-headcounts.sdk.test.ts` | 2 | `presenceProofs` ومعاملاته وnull→[]، وبقاء أسماء sheet/audit | يربط عارض الإثباتات الجديد بعقد RPC دون كسر القديم |
| `tests/unit/services/records-support.sdk.test.ts` | 8 | archive أعمدة/تطبيع/RPC، disclosures القديمة، gpsWarehouse كجسر Edge وأخطاء منظمة | يحمي الأرشيف/الكشوفات/جسر المستودع من ابتلاع الأخطاء |
| `tests/unit/services/sdk-rpc-surface.test.ts` | 10 | سطح واسع من RPC والمعاملات عبر وحدات الإدارة/المالية/التشغيل/المتابعة/المخزن/الأرشيف/الموافقات/الآليات | يقلل أخطاء 404 أو انحراف أسماء الدوال والمعاملات |
| `tests/unit/services/sector-surface.sdk.test.ts` | 9 | القواطع، ملف المدير، العمال/الآليات، المستلزمات/الأعطال، الصور، الحضور، الملخص | يثبت تطبيع بيانات القاطع وخصوصاً حفظ `present=false` |
| `tests/unit/services/transfer-station.sdk.test.ts` | 7 | الأوزان والصافي بخانتين، الفلاتر، RPC، حدود الشهر نصف المفتوحة وديسمبر، سير العمل والتقارير | يحمي حسابات محطة التحويل من أخطاء الوزن/الشهر |

ملاحظة: `query-keys-all.test.ts` يولّد 29 حالة ديناميكياً من المصانع الموجودة؛ العدد مأخوذ من تشغيل Vitest لا من عدّ `it(` نصياً.

## 6. ملفات SQL — جديد ومعدّل

### `tests/db/sensitive-role-approval-test.sql` — جديد، محصّن

- معاملة `begin/rollback` وخمسة مستخدمين بمعرّفات UUID صريحة.
- يفحص أولوية JWT: `ops_room` ثم `ops_room_manager` ثم `employee`.
- يفحص أن `ops_room_manager` يقرأ تقارير الكراج عبر `garage_report_actor` ولا يمرّ من `require_garage_actor`.
- يفحص V-36: منح/سحب دور حساس لا يغيّر الدور قبل موافقة المدير المفوض، طلب ومهمة واحدان عند التكرار، ظهور القائمة للطالب/المعتمد لا للعادي، الرفض والاعتماد عبر محرك الموافقات، وإعادة ضبط علم الموافقة.
- أُضيف حامل `finance_officer` ثانٍ كي لا يصطدم الاختبار بحماية `LAST_ROLE_HOLDER` قبل حالة السحب المقصودة.
- مؤكّد `expect_err` لا يبتلع نجاح العبارة: الرفض المتوقع يمرّ، والخطأ المختلف أو عدم الرفض يفشلان. تم فحص ذلك بفحص mutation محلي.
- الأثر: حاجز حقيقي لحوكمة الأدوار الحساسة على PostgreSQL؛ لا يترك بيانات في قاعدة الاختبار.

### `supabase/tests/rls_isolation.sql` — معدّل، محصّن

- بذر سبعة مستخدمين بمعرّفات صريحة بدلاً من الاعتماد على default لـ `auth.users.id`.
- أقسام GEN/WKS تستخدم `on conflict (code)` لتعمل مع قاعدة مبذورة أو غير مبذورة.
- `assert_raises` أصبح لا يبتلع استثناء الفشل المتعمّد: نجاح العبارة التي كان يجب أن تُرفض يفشل الاختبار.
- اختبار ذات IT حُدّث وفق 00371: منح الذات دوراً عادياً مسموح، وسحب آخر `it_admin` ممنوع.
- الأثر: إزالة فشل null-id في CI، وتقوية عزل الأدوار بدلاً من اختبار رفض صوري.

### `supabase/tests/manager_service_areas.sql` — معدّل، غير محصّن

- إضافة UUID صريح لمستخدمي `manager-all-areas` و`manager-invalid-area`.
- الأثر: يزيل اعتماد البذر على default غير مضمون في مخطط auth المحلي؛ لا يغيّر قواعد المناطق الثماني.

### `supabase/tests/round2_smoke.sql` — معدّل، غير محصّن

- أربعة UUID صريحة لمستخدمي IT/الهدف/الموظف/super_admin.
- الأثر: إصلاح بذر دخان الجولة 2 فقط؛ لم تُعدّل منطق البصمة أو GPS أو الصلاحيات في الملف.

### `supabase/tests/round6_isolation.sql` — معدّل، غير محصّن

- أربعة UUID صريحة لمستخدمي الجولة 6.
- الأثر: إصلاح بذر المستخدمين فقط؛ لم تُمسّ قرارات Leave الخاصة بالبصمة/الوحدات القديمة.

### `supabase/tests/rpc_public_test.sql` — معدّل، غير محصّن

- UUID صريح لمستخدم IT والهدف.
- تأكيد منح الدور أصبح إلزامياً وعلى `target_user` لا `it_user`، وبمراقب postgres لأن RLS يخفي أدوار الآخرين عن IT، ثم يعود دور الجلسة إلى authenticated.
- رفض anon من `set_user_role` و`db_table_details` يجب أن يكون بالرمز المتوقع، ولا يُقبل أي خطأ عشوائي أو نجاح صوري.
- الأثر: اختبار أغلفة public/RPC صار يثبت الوصول الفعلي للدور والرفض الأمني، لا notice اختياري.

## 7. ملفات مساندة غيّرت سلوك الفحص أو النشر

| الملف | التغيير | الأثر |
|---|---|---|
| `package.json` | Vitest ^4.1.12، إضافة `@vitest/coverage-v8` و`@testing-library/dom` | أدوات تطوير/اختبار فقط؛ لا تُضاف كاعتماديات تشغيلية للواجهة |
| `package-lock.json` | قفل الاعتماديات المتوافقة | يجعل `npm ci` في CI قابلاً للتكرار |
| `vitest.config.ts` | **لم يتغير عن الأساس** | العتبات 70×4 ونطاق services/lib/schemas كما هي |
| `tests/setup.ts` | **لم يتغير عن الأساس** | لا تغيير في env/i18n/cleanup العام |
| `scripts/db-tests.sh` | annotation لكل ملف SQL فاشل، مع تهريب `%`/CR/LF وآخر 12 سطراً | سبب الفشل يظهر في GitHub حتى عندما لا يتاح raw log؛ لم يتغير تصنيف 15/219/2 |
| `.github/workflows/db-tests.yml` | تثبيت CLI 2.122.1، أسماء خدمات حديثة mailpit/supavisor، `bash scripts/...`، وتشخيص بدء محجوب الأسرار | بيئة SQL قابلة للتكرار؛ لا نشر للإنتاج |
| `.github/workflows/db-smoke.yml` | تثبيت CLI، `pipefail`، التقاط stdout+stderr في ملف ثم grep، وتشخيص فشل، وإضافة مسار workflow نفسه للمحفّزات | إصلاح false-negative لأن `SMOKE OK` كان يصل عبر stderr |
| `.github/workflows/cd-production.yml` | تمرير `VITE_VAPID_PUBLIC_KEY` إلى env/build | لن يُبنى إنتاجياً بلا المفتاح العام المطلوب |
| `.github/workflows/cd-staging.yml` | نفس مفتاح VAPID العام للتجربة | نفس الحاجز على staging |
| `scripts/check-env.ts` | التحقق من صيغة مفتاح VAPID العام ووجوبه في production/staging | يمنع بناء push بمفتاح خاص أو مفتاح عام غائب/مشوّه |
| `.env.example` / `docs/deployment.md` | توثيق أن المفتاح العام مطلوب في الإنتاج/التجربة والخاص يبقى في Supabase | تقليل خطأ النشر الصامت |
| `eslint.config.js` | استثناء سكربتات تشخيص جذرية قديمة `probe*.mjs`/`dbg-*.mjs` وpreview من lint | لا يُستثنى أي ملف داخل `src`؛ بوابة lint تبقى على التطبيق والاختبارات |
| `probe-bridge.mjs` | قراءة المفتاح العام من env بدلاً من تضمينه | إزالة مفتاح مضمّن من سكربت تشخيص يدوي |
| `tools/akaram-archive/config.example.json` | placeholder لا يبدو كمفتاح حقيقي | يمرّ فحص الأسرار دون قيمة فعلية |
| `.gitignore` | تجاهل `preview/` | يمنع دخول لوحة معاينة محلية إلى الحزمة/المستودع |

### إصلاحات المهاجرات التي كشفتها الفحوص

1. `supabase/migrations/20261110180000_sensitive_role_approval.sql`: إصلاح فاصلة ناقصة داخل SQL المولّد لسطر `values (... 'UPDATE', ...)`. الخطأ كان 42601 ويمنع reset من الاكتمال.
2. `supabase/migrations/20261111120000_ops_room_manager_portal.sql`: استبدال الاقتباس اليدوي المكسور بـ dollar-quoting `$pat$`/`$rep$` في تعديل أولوية JWT وقائمة الأدوار.
3. `supabase/migrations/20261115130000_activity_30day_reminder.sql`: تحويل `\n` الحرفي بعد `$$` إلى سطر جديد حقيقي.

هذه إصلاحات صياغة/توافق للمهاجرات في المستودع. المكافئات الحية المطبقة سابقاً لم يُعد تطبيقها في هذه الجولة.

### المهاجرات الأربع الجديدة غير المطبقة حياً

| المهاجرة | الوظيفة | الاختبارات المرتبطة |
|---|---|---|
| `20261115140000_notifications_realtime_publication.sql` | إضافة `public.notifications` إلى منشور Realtime إن لم يكن موجوداً | pre-release contract + DB reset/smoke |
| `20261115150000_live_sessions_overnight_overlap.sql` | تقاطع فترة الجلسة مع مدى أيام بغداد، بما يشمل الجلسات العابرة لمنتصف الليل | live-data logic + pre-release contract + DB reset |
| `20261115160000_ops_contractor_presence_proofs.sql` | RPC قراءة فقط لغرفة العمليات/الإدارة العليا | SDK + page tests + pre-release contract + DB reset |
| `20261115170000_permission_catalog_ops_contractor_proofs.sql` | upsert للكتالوج ووحدة `ops-room.contractor-proofs` بإجراء view فقط، مع إعادة ربط bindings | page/catalog test + DB reset |

قراءة حية فقط أكدت: النسخ الأربع غير موجودة في سجل المهاجرات، `notifications` غير منشور في Realtime، وRPC/وحدة صلاحية الإثباتات غير موجودين.

## 8. تقرير SQL غير المحصّن — غير حاجز

المشغّل صنف 219 ملفاً غير محصّن وشغّلها بوضع التقرير. ظهرت 10 إخفاقات موثقة في annotations، وبقي وضع المهمة ناجحاً لأن `DB_TESTS_ALLOW_FAIL=1` و`continue-on-error` مقصودان لهذا التقرير. لم تُحوّل هذه الملفات إلى محصّنة ولم تُحذف من التقرير.

| الملف | الخطأ المرصود | القراءة العملية |
|---|---|---|
| `supabase/tests/automatic_sector_manager_dispatch.sql` | نص عربي يُمرر إلى معامل UUID في `garage_add_vehicle` | fixture قديم لا يطابق توقيع الدالة الحالي |
| `supabase/tests/central_garage_core.sql` | نفس مشكلة UUID/اسم السائق | يحتاج جولة صيانة كراج منفصلة |
| `supabase/tests/central_garage_departures.sql` | نفس مشكلة UUID/اسم السائق | غير حاجز؛ لم يُمسّ في هذه الجولة |
| `supabase/tests/central_garage_multi_vehicle_reports.sql` | نفس مشكلة UUID/اسم السائق | غير حاجز |
| `supabase/tests/central_garage_vehicle_details.sql` | نفس مشكلة UUID/اسم السائق | غير حاجز |
| `supabase/tests/garage_sector_handover.sql` | نفس مشكلة UUID/اسم السائق | غير حاجز |
| `supabase/tests/garage_two_sector_full_cycle.sql` | `CYCLE_ACTOR_FIXTURE_MISSING` | بيانات الفاعلين غير مكتملة في fixture قديم |
| `supabase/tests/gps_alert_grouping_escalation.sql` | `device_id` null في `gps_operational_alerts` | fixture لا يوفر الربط المطلوب |
| `supabase/tests/gps_history_window_progress.sql` | `GPS_FORBIDDEN` | سياق الدور/الفاعل لا يجتاز حارس GPS |
| `supabase/tests/biometric_bridge.sql` | `IMPORT_EXPOSED` | يقع ضمن منطقة البصمة التي تقرر Leave عدم تعديلها في هذه الجولة |

هذه الإخفاقات لا تُبطل حاجز المحصّنة، لكنها ديون اختبارية يجب ألا تُقدّم على أنها نجاح كامل لكل ملفات SQL القديمة.

## 9. الأثر على النظام المنشور مقابل ما بقي في الفرع

### موجود في الفرع ولم يُنشر بهذه الجولة

- عارض إثباتات التواجد، مهاجراته الأربع، تحسينات PWA/الدرج/الدخول، توقيت بغداد في البث، وربط VAPID العام في CD.
- الاختبارات الجديدة تمنع رجوع هذه العقود، لكنها لا تنشرها تلقائياً.

### تحقق حي قراءة فقط

- المشروع: `rzpitdsuwgprzfvrlkdn`.
- المهاجرات الأربع معلّقة؛ Realtime للإشعارات غير مضاف؛ RPC/وحدة الإثباتات غير موجودين.
- لم تُقرأ مفاتيح خاصة ولم تُعدّل Auth أو الأسرار في هذا التقرير.

### مطلوب قبل أي نشر مصرح

1. موافقة صريحة على الدمج/النشر/تطبيق المهاجرات.
2. التأكد من وجود سر GitHub/Environment باسم `VITE_VAPID_PUBLIC_KEY` الذي يحمل المفتاح العام فقط. محاولة قراءة أسماء الأسرار عبر التكامل أعادت 403، لذلك لا أدعي التحقق من وجوده أو غيابه.
3. تطبيق المهاجرات بالترتيب على البيئة المصرح بها، ثم تحقق حي من الإشعارات/الإثباتات/البث.
4. مراجعة ديون §8 و`format:check` كجولة منفصلة، لا كشرط مخفّض ضمن هذه الجولة.

## 10. قرارات محفوظة لم تُمسّ

- لا نشر/دمج/تطبيق حي بلا موافقة صريحة.
- لا خفض عتبة 70% ولا حذف اختبارات.
- Leave: HR/biometrics، سياجات القاطع 3، قواعد الإشعارات، كلمات مرور الاختبار، pinch-zoom، SMTP/email.
- الأيقونات السبع الأصلية بايتاً ببايت كما في الأساس.
- عدم إعادة `interactive-widget=` إلى viewport.
- تحديث Auth الحي السابق لا يُعاد تشغيله.

## 11. روابط التشغيل

- CI: <https://github.com/foxgn6555-prog/akaram-pwa/actions/runs/43710041083>
- E2E: <https://github.com/foxgn6555-prog/akaram-pwa/actions/runs/43710041138>
- Security: <https://github.com/foxgn6555-prog/akaram-pwa/actions/runs/43710041137>
- DB Smoke: <https://github.com/foxgn6555-prog/akaram-pwa/actions/runs/43710041098>
- DB SQL: <https://github.com/foxgn6555-prog/akaram-pwa/actions/runs/43710041148>
- PR: <https://github.com/foxgn6555-prog/akaram-pwa/pull/1>
