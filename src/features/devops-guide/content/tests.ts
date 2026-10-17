/** 00276 — دليل الاختبارات: أنواعها في مشروعنا، كيف تُشغَّل، كيف تُقرأ النتيجة */
import type { Guide } from '../types'

export const testsGuide: Guide = {
  slug: 'tests',
  title: 'الاختبارات',
  subtitle: 'ما أنواع الاختبارات في المشروع، ماذا يحمي كل نوع، كيف تشغّلها بنفسك، وكيف تقرأ «أخضر» و«أحمر»',
  notice: 'قاعدتنا: لا تُرسَل جولة إلا وكل الاختبارات خضراء (قاعدة البيانات + الوحدات + العقود + الأمان + typecheck + lint). ما تراه هنا هو نفس ما أشغّله قبل كل باتش.',
  sections: [
    {
      id: 'types',
      title: '١ · أنواع الاختبارات عندنا',
      concepts: [
        { term: 'اختبارات قاعدة البيانات (tests/db/*.sql)', meaning: 'تبني قاعدة فارغة، تطبّق كل الترحيلات (243)، ثم تنفّذ سيناريوهات حقيقية بالدوال نفسها وتتأكد من النتيجة. هي الأهم لأنها تحمي الرواتب والحضور والصلاحيات.', example: 'maintenance-workshops-test.sql: حساب الزعفرانية لا يرى حالات المركزية، والتحويل يتطلب سبباً.' },
        { term: 'اختبارات الوحدات (tests/unit)', meaning: 'تفحص الصفحات والمكونات والدوال في الواجهة: هل الزر يظهر؟ هل يُرسل البيانات الصحيحة؟ تعمل بدون قاعدة بيانات (محاكاة).', example: 'maintenance-cases.test.tsx: زر التحويل لا يظهر لحالة مركزية، ويُعطَّل بلا سبب.' },
        { term: 'اختبارات العقود (tests/contract)', meaning: 'تثبّت «اتفاقات» البنية: عدد وحدات كل بوابة وترتيبها، أسماء دوال RPC التي تناديها الواجهة موجودة فعلاً، كل صفحة تستخدم الرأس الموحد.', example: 'portal-contracts: بوابة التطوير بها 11 وحدة بترتيب محدد؛ إن أضفنا وحدة بلا تحديث العقد يفشل.' },
        { term: 'اختبارات الأمان (tests/security)', meaning: 'تتأكد أن الأدوار لا تصل لما لا يحق لها، وأن لا بيانات مالية في بوابات الميدان، وأن المفاتيح السرية ليست في الكود.', example: 'permission-integrity: كل بوابة لها أدوار مسموحة صريحة.' },
        { term: 'الفحص الساكن: typecheck + lint', meaning: 'typecheck يتأكد أن الأنواع متسقة (لا استدعاء بحقل غير موجود)؛ lint يتأكد من جودة الكود وغياب الأخطاء الشائعة. صفر تحذيرات مسموح.', example: 'إن غيّرنا اسم حقل في SDK ونسينا صفحة تستخدمه ⇒ typecheck أحمر قبل أي تشغيل.' },
        { term: 'اختبارات الطرف للطرف E2E (tests/e2e — Playwright)', meaning: 'تفتح متصفحاً حقيقياً وتسجّل دخولاً وتتنقل. تحتاج بيئة كاملة؛ تُشغَّل في CI عند الحاجة لا مع كل جولة.', example: 'auth-flow: تسجيل الدخول ثم الوصول إلى البوابة الصحيحة حسب الدور.' },
      ],
    },
    {
      id: 'run',
      title: '٢ · كيف تشغّلها بنفسك (داخل C:\\fox)',
      intro: 'المرة الأولى فقط: npm install (يثبّت الأدوات). بعدها الأوامر التالية.',
      commands: [
        { cmd: 'npm test', what: 'يشغّل كل اختبارات الوحدات والعقود والأمان (Vitest) مرة واحدة.', when: 'بعد تطبيق باتش إن أردت التأكد بنفسك؛ يستغرق ٤–٦ دقائق.', example: 'النهاية الخضراء: Test Files 253 passed · Tests 1770 passed.', ifFails: 'يطبع اسم الملف والاختبار الفاشل والسبب. أرسل لي السطور التي تبدأ بـ FAIL وما تحتها.', danger: 'safe' },
        { cmd: 'npx vitest run tests/unit/portals/maintenance-cases.test.tsx', what: 'يشغّل ملف اختبار واحداً فقط.', when: 'عندما تريد نتيجة سريعة لصفحة محددة.', example: 'Tests 7 passed خلال ثوانٍ.', ifFails: 'نفس قراءة npm test.', danger: 'safe' },
        { cmd: 'npm run typecheck', what: 'فحص الأنواع للمشروع كاملاً (tsc).', when: 'قبل أي رفع. يستغرق نحو دقيقة.', example: 'لا ناتج = نجاح. أي سطر بصيغة src/…: error TS… = خطأ.', ifFails: 'إن ظهر «JavaScript heap out of memory» شغّله بذاكرة أكبر: set NODE_OPTIONS=--max-old-space-size=4096 ثم أعد الأمر.', danger: 'safe' },
        { cmd: 'npm run lint', what: 'فحص جودة الكود (ESLint) بصفر تحذيرات.', when: 'قبل أي رفع.', example: 'لا ناتج = نجاح.', ifFails: 'يطبع الملف والسطر والقاعدة. غالباً لا يخصّك — أرسله لي.', danger: 'safe' },
        { cmd: 'npm run build', what: 'يبني نسخة الإنتاج (مجلد dist) — نفس الملفات التي سترفعها إلى هوستنجر.', when: 'قبل النشر، أو للتأكد أن المشروع يُبنى بلا أخطاء.', example: 'ينتهي بـ ✓ built in 40s وقائمة ملفات dist/assets/…', ifFails: 'خطأ البناء = خطأ typecheck غالباً؛ شغّل typecheck لترى التفاصيل.', danger: 'safe' },
        { cmd: 'npm run test:e2e', what: 'اختبارات المتصفح الحقيقي (Playwright).', when: 'ليست مطلوبة منك؛ تحتاج متصفحات مثبتة وبيئة Supabase للاختبار.', example: 'تُشغَّل في GitHub Actions (ملف e2e.yml).', ifFails: 'إن أردت تشغيلها محلياً: npx playwright install أولاً.', danger: 'safe' },
      ],
    },
    {
      id: 'db',
      title: '٣ · اختبارات قاعدة البيانات — كيف تعمل عندي وكيف تشغّلها أنت',
      intro: 'تحتاج PostgreSQL. على جهازك الطريقة الأسهل هي السكربت المضمّن الذي يشغّل PostgreSQL مؤقتاً دون تثبيت.',
      commands: [
        { cmd: 'node scripts/db-migrations-test.mjs', what: 'يشغّل PostgreSQL مضمّناً مؤقتاً، يطبّق كل الترحيلات من الصفر، ويطبع migrations ok: 243.', when: 'للتأكد أن كل الترحيلات تُبنى من قاعدة فارغة بلا خطأ.', example: 'migrations ok: 243', ifFails: 'FAIL <اسم الملف> <الرسالة> ⇒ أرسل لي السطر كاملاً. المرة الأولى تنزّل PostgreSQL (دقائق).', danger: 'safe' },
        { cmd: 'node scripts/db-migrations-test.mjs tests/db/maintenance-workshops-test.sql', what: 'نفس السابق ثم يشغّل ملف اختبار محدداً بعد الترحيلات.', when: 'لفحص ميزة محددة.', example: 'test ok: tests/db/maintenance-workshops-test.sql', ifFails: 'ERROR: <نص assert> ⇒ النص يشرح ما كان متوقعاً وما حدث.', danger: 'safe' },
        { cmd: 'bash scripts/test-migrations-postgres.sh', what: 'النسخة الكاملة على PostgreSQL مثبّت (كل الترحيلات + كل ملفات tests/db).', when: 'للمطوّرين أو في CI (ملف db-smoke.yml).', example: 'يطبع APPLY لكل ترحيل ثم نتائج الاختبارات.', ifFails: 'يتطلب TEST_DATABASE_ADMIN_URL وpsql؛ غير مطلوب منك.', danger: 'safe' },
      ],
    },
    {
      id: 'read',
      title: '٤ · كيف تقرأ النتيجة',
      steps: [
        { title: 'أخضر ✓ / passed', body: 'الاختبار نجح. السطر الأخير يلخّص: Test Files X passed · Tests Y passed. أي رقم failed غير صفر = هناك مشكلة.' },
        { title: 'أحمر × / FAIL', body: 'يظهر اسم الملف ثم اسم الاختبار بالعربية (يصف ما كان يجب أن يحدث) ثم AssertionError: expected … to be … (ما وُجد مقابل ما كان متوقعاً).' },
        { title: 'skipped / todo', body: 'اختبارات مؤجلة عمداً (9 حالياً) — ليست فشلاً.' },
        { title: 'ماذا ترسل لي عند الفشل', body: 'السطور من FAIL حتى نهاية AssertionError، واسم الأمر الذي شغّلته. لا حاجة لإرسال كل الناتج.' },
        { title: 'لماذا كل جولة تحوي اختباراً جديداً', body: 'لأن الاختبار هو ما يمنع عودة الخطأ لاحقاً. كل ميزة لها اختبار DB (المنطق) واختبار واجهة (الشاشة)؛ وكل خطأ أُصلح يُثبَّت باختبار حتى لا يتكرر.' },
      ],
    },
    {
      id: 'ci',
      title: '٥ · ما الذي يعمل تلقائياً على GitHub (CI)',
      faq: [
        { q: 'ci.yml', a: 'عند كل رفع: فحص الأسرار، env:check، lint، typecheck، npm test، التغطية، والبناء. إن فشل يظهر ✗ أحمر بجانب الالتزام على GitHub.' },
        { q: 'db-smoke.yml', a: 'يبني قاعدة فارغة ويطبّق كل الترحيلات ويشغّل اختبارات tests/db.' },
        { q: 'e2e.yml', a: 'اختبارات المتصفح الحقيقي عند الطلب.' },
        { q: 'security-scan.yml', a: 'فحص الحزم والثغرات المعروفة.' },
        { q: 'cd-staging.yml / cd-production.yml', a: 'النشر التلقائي للواجهة. مع الانتقال إلى هوستنجر سيُشرح في دليل الاستضافة كيف يُستبدل بالرفع اليدوي أو FTP.' },
      ],
    },
  ],
}
