/** 00276 — دليل قاعدة البيانات والترحيلات (Supabase): لصاحب المشروع، بأمثلة من مشروعنا */
import type { Guide } from '../types'

export const databaseGuide: Guide = {
  slug: 'database',
  title: 'قاعدة البيانات والترحيلات',
  subtitle: 'أين تعيش البيانات، ما هو الترحيل، كيف تصل تغييرات القاعدة إلى Supabase، وما الذي لا يجوز لمسه أبداً',
  notice: 'قاعدة البيانات هي قلب المنصة (الموظفون، الرواتب، البصمة، الرحلات…). كل تغيير عليها يمر عبر ملف ترحيل مرقّم يُطبَّق بأمر واحد. لا تعديل يدوي على الجداول من لوحة Supabase أبداً.',
  sections: [
    {
      id: 'concepts',
      title: '١ · المفاهيم',
      concepts: [
        { term: 'Supabase', meaning: 'الخدمة السحابية التي تستضيف قاعدة البيانات (PostgreSQL) وتسجيل الدخول والدوال السحابية والملفات. هي «الخلفية» كاملة.', example: 'عند فتح لوحة Supabase ترى مشروعك وبداخله Table Editor وSQL Editor وAuth وEdge Functions.' },
        { term: 'الترحيل (Migration)', meaning: 'ملف SQL مرقّم تسلسلياً يصف تغييراً واحداً على القاعدة (جدول جديد، عمود، دالة…). تُطبَّق الملفات بالترتيب مرة واحدة فقط ويسجَّل ذلك.', example: 'supabase/migrations/00243_maintenance_workshops_admin.sql — ملفات المشروع الآن 243 ترحيلاً من 00001 إلى 00243.' },
        { term: 'RPC (دالة قاعدة البيانات)', meaning: 'منطق العمل يعيش داخل القاعدة كدوال؛ الواجهة تناديها بالاسم. هذا ما يضمن أن القواعد تُطبَّق على الجميع مهما كانت البوابة.', example: 'maintenance_forward_to_central(case, reason) هي RPC؛ زر «تحويل» في الواجهة يناديها فقط.' },
        { term: 'RLS (أمان الصفوف)', meaning: 'قواعد داخل القاعدة تحدد من يرى أي صف. حتى لو حاول أحد الوصول خارج الواجهة فلن يرى ما لا يحق له.', example: 'موظف يفتح جدول الرواتب مباشرة ⇒ صفر صفوف، لأن RLS يمنعه.' },
        { term: 'Edge Function (دالة سحابية)', meaning: 'برنامج صغير يعمل على Supabase لاستقبال شيء من الخارج أو الاتصال بخدمة خارجية.', example: 'adms-receiver تستقبل بصمات أجهزة ZKTeco؛ gps-receiver تستقبل مواقع الشاحنات.' },
        { term: 'المشروع المحلي مقابل السحابي', meaning: 'ملفات الترحيل في مجلد المشروع على جهازك هي «المصدر». السحابة تطبّق منها. إن اختلفا يظهر خطأ عند db push.', example: 'عندك 00243 ملفاً محلياً والسحابة سجّلت 00243 مطبَّقاً ⇒ متطابقان ⇒ db push يقول: لا شيء جديد.' },
      ],
    },
    {
      id: 'rules',
      title: '٢ · القواعد الذهبية (اقرأها مرة واحدة واحفظها)',
      steps: [
        { title: 'ترحيل مُطبَّق = لا يُعدَّل أبداً', body: 'إن أردنا تغيير شيء فيه نكتب ترحيلاً جديداً يصلحه. تعديل ملف قديم يجعل السحابة والملفات مختلفين ويعطّل db push.' },
        { title: 'لا تعديل يدوي من لوحة Supabase', body: 'Table Editor وSQL Editor مريحان لكنهما يخلقان فرقاً لا يعرفه أحد. كل تغيير يأتي من باتش يحوي ترحيلاً.' },
        { title: 'db push فقط عندما أقول «ترحيل»', body: 'الجولة التي لا تحوي ملفاً جديداً في supabase/migrations لا تحتاج db push. تنفيذه بلا داعٍ لا يضر لكنه مضيعة.' },
        { title: 'الترتيب: الباتش أولاً ثم db push ثم push إلى GitHub', body: 'لأن db push يقرأ ملفات الترحيل من مجلدك؛ إن لم يُطبَّق الباتش فلن يجد الملف الجديد.' },
        { title: 'النسخ الاحتياطي من مسؤولية Supabase', body: 'الخطة المدفوعة تحوي نسخاً يومية واسترجاعاً نقطياً (PITR). قبل أي ترحيل كبير يمكن أخذ نسخة يدوية من لوحة Supabase → Database → Backups.' },
      ],
    },
    {
      id: 'commands',
      title: '٣ · الأوامر',
      commands: [
        { cmd: 'npx supabase db push', what: 'يطبّق كل ملفات الترحيل التي لم تُطبَّق بعد على مشروعك السحابي، بالترتيب.', when: 'بعد تطبيق باتش يحوي ترحيلاً (أقول لك ذلك صراحة).', example: 'Applying migration 00243_maintenance_workshops_admin.sql... ثم Finished supabase db push.', ifFails: '«Remote migration versions not found» أو «migration history does not match» ⇒ لا تنفّذ repair بنفسك؛ أرسل لي الناتج. «password authentication failed» ⇒ كلمة مرور القاعدة في .env.local خاطئة.', danger: 'care' },
        { cmd: 'npx supabase db push --dry-run', what: 'يعرض ما الذي سيُطبَّق دون أن يطبّق شيئاً.', when: 'عندما تريد التأكد قبل التنفيذ الفعلي.', example: 'يظهر: Would apply migration 00243_… ⇒ ملف واحد جديد.', ifFails: 'لا يغيّر شيئاً أبداً؛ آمن دائماً.', danger: 'safe' },
        { cmd: 'npx supabase migration list', what: 'جدول يقارن الترحيلات المحلية بالمطبَّقة على السحابة.', when: 'عند الشك هل طُبِّق ترحيل ما.', example: 'عمود Local وعمود Remote؛ السطر الذي فيه Local بلا Remote = لم يُطبَّق بعد.', ifFails: 'يحتاج اتصالاً بالمشروع (link) وكلمة المرور.', danger: 'safe' },
        { cmd: 'npx supabase link --project-ref <المعرّف>', what: 'يربط مجلد المشروع بمشروع Supabase محدد (مرة واحدة لكل جهاز).', when: 'على جهاز جديد أو إن ظهر «project not linked».', example: 'المعرّف هو الجزء من رابط اللوحة: https://supabase.com/dashboard/project/<المعرّف>', ifFails: 'يطلب كلمة مرور القاعدة؛ تجدها في لوحة Supabase → Settings → Database (أو أعد تعيينها هناك).', danger: 'safe' },
        { cmd: 'npx supabase login', what: 'تسجيل دخول Supabase CLI من المتصفح (مرة واحدة).', when: 'عند «Access token not provided».', example: 'يفتح المتصفح، تضغط موافقة، يعود الطرفية بـ Logged in.', ifFails: 'بديل: ضع SUPABASE_ACCESS_TOKEN في .env.local (من لوحة Supabase → Account → Access Tokens).', danger: 'safe' },
        { cmd: 'npm run db:push', what: 'نفس db push لكنه يقرأ المعرّف وكلمة المرور تلقائياً من .env.local (سكربت المشروع).', when: 'بديل مريح لـ npx supabase db push على ويندوز.', example: 'npm run db:push -- --dry-run للمعاينة.', ifFails: '«SUPABASE_PROJECT_REF مفقود» ⇒ أضفه إلى .env.local.', danger: 'care' },
        { cmd: 'npm run functions:deploy', what: 'ينشر الدوال السحابية (Edge Functions) من مجلد supabase/functions إلى السحابة.', when: 'فقط عندما تقول الجولة «يتضمن تحديث دالة سحابية» (نادر: البصمة، GPS، الشكاوى).', example: 'يرفع adms-receiver وbiometric-pull وgps-receiver… ويطبع رابط كل واحدة.', ifFails: 'يتطلب supabase login؛ وإن فشلت دالة واحدة يطبع اسمها — أرسل لي الناتج.', danger: 'care' },
        { cmd: 'npm run db:types', what: 'يولّد ملف أنواع TypeScript من القاعدة المحلية (للمطوّرين).', when: 'لا تحتاجه؛ أتولاه أنا داخل الباتشات.', example: 'src/types/database.types.ts', ifFails: 'يتطلب Supabase محلياً (Docker)؛ غير مطلوب منك.', danger: 'safe' },
      ],
    },
    {
      id: 'dashboard',
      title: '٤ · ماذا تفعل من لوحة Supabase (وماذا لا تفعل)',
      steps: [
        { title: 'مسموح: المشاهدة', body: 'Table Editor للاطلاع، Logs لمعرفة الأخطاء، Auth → Users لرؤية الحسابات، Database → Backups للنسخ.' },
        { title: 'مسموح: الإعدادات التي لا تُكتب في ملفات', body: 'Auth → URL Configuration (روابط إعادة التوجيه مثل عنوان هوستنجر)، Auth → Providers، تفعيل MFA، مفاتيح الدوال السحابية (Secrets).' },
        { title: 'ممنوع: تعديل البيانات أو الهيكل', body: 'لا إضافة أعمدة، لا حذف صفوف، لا تشغيل SQL يغيّر شيئاً. الاستثناء الوحيد: عندما أعطيك أمر SQL محدداً لتصحيح طارئ، وتنفّذه كما هو.' },
        { title: 'مفاتيح المشروع', body: 'anon key عام (يكون في الواجهة) وservice_role سرّي (لا يُوضع في الواجهة أبداً ولا يُرسل في محادثة). تفاصيل المفاتيح في docs/keys-and-secrets.md.' },
      ],
    },
    {
      id: 'errors',
      title: '٥ · رسائل شائعة',
      faq: [
        { q: 'Finished supabase db push. (بلا Applying)', a: 'لا ترحيلات جديدة — السحابة محدّثة. طبيعي إن كانت الجولة بلا ترحيل.' },
        { q: 'ERROR: relation … already exists', a: 'الترحيل يحاول إنشاء شيء موجود. غالباً طُبِّق جزء منه يدوياً من اللوحة. أرسل لي الناتج كاملاً — الحل ترحيل تصحيحي، وليس تعديل الملف.' },
        { q: 'ERROR: permission denied / must be owner', a: 'الاتصال بمستخدم غير المالك. db push يستخدم المالك تلقائياً؛ هذا يظهر عند تشغيل SQL يدوياً. لا تشغّله يدوياً.' },
        { q: 'Cannot find project ref. Have you run supabase link?', a: 'المجلد غير مربوط بالمشروع على هذا الجهاز: نفّذ supabase link.' },
        { q: 'هل أستطيع الرجوع عن ترحيل؟', a: 'ليس بحذفه. نكتب ترحيلاً جديداً يعكس أثره. لذلك الاختبارات قبل الإرسال مهمة (انظر دليل الاختبارات).' },
      ],
    },
  ],
}
