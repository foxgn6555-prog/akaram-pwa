/**
 * 00210 — قاموس أخطاء مزامنة LVN بالعربية: ما الخطأ؟ ما سببه؟ من يعالجه وكيف؟
 * الأكواد تأتي من الدالة الخادمية `lvn-gps-sync` (جسم الاستجابة { error: 'CODE' } أو عمود error_code في سجل المزامنة).
 */
export interface LvnErrorInfo {
  code: string
  /** تصنيف: credentials = حساب LVN · config = إعداد عندنا · provider = خادم LVN · db = قاعدتنا · busy = تزاحم · unknown */
  kind: 'credentials' | 'config' | 'provider' | 'db' | 'busy' | 'unknown'
  title: string
  cause: string
  action: string
  owner: string
}

const CATALOG: Record<string, Omit<LvnErrorInfo, 'code'>> = {
  LVN_LOGIN_REJECTED: {
    kind: 'credentials',
    title: 'شركة GPS رفضت بيانات الدخول',
    cause: 'خادم LVN (track.gpslvn.iq) أعاد 401 عند تسجيل الدخول بالبريد وكلمة المرور المحفوظين لدينا — غالباً تغيّرت كلمة المرور أو انتهى الاشتراك أو أوقِف الحساب.',
    action: 'جرّب الدخول يدوياً على موقع LVN بنفس البيانات. إن نجح، حدّث السرَّين LVN_API_EMAIL و LVN_API_PASSWORD في Supabase (Edge Functions ← Secrets) ثم اضغط «اختبار الاتصال».',
    owner: 'وحدة التطوير المركزية + حساب LVN',
  },
  LVN_UNAUTHORIZED: {
    kind: 'credentials',
    title: 'جلسة LVN انتهت أثناء السحب',
    cause: 'نجح الدخول لكن LVN رفض طلب البيانات (401) — انتهاء صلاحية مفتاح الجلسة أو تغيير صلاحيات الحساب.',
    action: 'أعد المزامنة؛ إن تكرر الخطأ فراجع حساب LVN وصلاحياته.',
    owner: 'وحدة التطوير المركزية',
  },
  LVN_CONFIG_MISSING: {
    kind: 'config',
    title: 'بيانات حساب LVN غير مضبوطة عندنا',
    cause: 'السرّان LVN_API_EMAIL / LVN_API_PASSWORD غير موجودين في إعدادات Edge Functions بمشروع Supabase.',
    action: 'أضفهما من لوحة Supabase (Edge Functions ← Secrets) أو بالأمر npx supabase secrets set ثم أعد الاختبار.',
    owner: 'وحدة التطوير المركزية',
  },
  LVN_PROVIDER_NOT_CONFIGURED: {
    kind: 'config',
    title: 'مزوّد GPS غير معرَّف في قاعدة البيانات',
    cause: 'لا يوجد صف مفعّل في جدول gps_providers.',
    action: 'أعد تطبيق الترحيلات (npx supabase db push) أو فعّل المزوّد من إعدادات IT.',
    owner: 'وحدة التطوير المركزية',
  },
  LVN_LOGIN_HASH_MISSING: {
    kind: 'provider',
    title: 'استجابة دخول غير مكتملة من LVN',
    cause: 'LVN قبل الدخول لكنه لم يُعد مفتاح الجلسة (user_api_hash) — تغيير في واجهة LVN أو عطل لديهم.',
    action: 'أعد المحاولة بعد دقائق؛ إن استمر فراجع شركة LVN.',
    owner: 'شركة LVN',
  },
  LVN_FULL_SYNC_REQUIRED: {
    kind: 'config',
    title: 'مطلوب مزامنة كاملة أولاً',
    cause: 'لا يوجد مؤشر تحديث جزئي محفوظ (أول تشغيل أو بعد إعادة ضبط).',
    action: 'اضغط «مزامنة الآن» لتنفيذ مزامنة كاملة مرة واحدة.',
    owner: 'غرفة العمليات',
  },
  LVN_SYNC_ALREADY_RUNNING: {
    kind: 'busy',
    title: 'مزامنة أخرى قيد التنفيذ',
    cause: 'طلبان متزامنان — الحارس يمنع التداخل.',
    action: 'انتظر انتهاء المزامنة الجارية.',
    owner: '—',
  },
  TRIP_ROUTE_NO_DEVICE: { kind: 'config', title: 'المركبة بلا جهاز GPS مربوط', cause: 'لا يوجد ربط بين مركبة الانطلاقية وجهاز تتبع.', action: 'اربط الجهاز من بيانات GPS ← الأسطول ثم اطلب السحب.', owner: 'غرفة العمليات' },
  LVN_FUNCTION_OUTDATED: { kind: 'config', title: 'دالة مزامنة GPS على الخادم قديمة', cause: 'الدالة الخادمية lvn-gps-sync المنشورة لا تعرف سحب مسارات الانطلاقيات (لم تُنشر بعد التحديث 00342).', action: 'انشر الدالة: npx supabase functions deploy lvn-gps-sync — ثم أعد السحب؛ بعدها يسحب النظام تلقائياً.', owner: 'وحدة التطوير المركزية' },
  TRIP_ROUTE_NOT_QUEUED: { kind: 'config', title: 'لا شيء يُسحب لهذه الانطلاقية', cause: 'المسار نهائي ومكتمل أو بلا جهاز.', action: 'لا حاجة لإجراء.', owner: '—' },
  TRIP_ROUTE_RANGE_TOO_LONG: { kind: 'config', title: 'فترة الانطلاقية أطول من 7 أيام', cause: 'انطلاقية مفتوحة منذ أكثر من أسبوع.', action: 'سجّل عودتها أو صحّحها ثم أعد السحب.', owner: 'غرفة العمليات' },
  // 00380: مستودع GPS التحليلي (المشروع الثاني)
  GPS_WAREHOUSE_NOT_CONFIGURED: { kind: 'config', title: 'مستودع GPS غير مربوط بعد', cause: 'السرّان GPS_WAREHOUSE_URL / GPS_WAREHOUSE_SERVICE_KEY غير موجودين في إعدادات Edge Functions بالمشروع الأول.', action: 'من لوحة Supabase للمشروع الأول: Edge Functions ← Secrets ← أضف الرابط ومفتاح الخدمة الخاصين بالمشروع الثاني، ثم اضغط «فحص الاتصال».', owner: 'وحدة التطوير المركزية' },
  GPS_WAREHOUSE_KEY_INVALID: { kind: 'credentials', title: 'مفتاح مستودع GPS مرفوض', cause: 'المشروع الثاني رفض المفتاح (ألغي أو نُسخ ناقصاً).', action: 'أنشئ مفتاح خدمة جديداً في المشروع الثاني وحدّث السرّ GPS_WAREHOUSE_SERVICE_KEY ثم أعد الفحص.', owner: 'وحدة التطوير المركزية' },
  GPS_WAREHOUSE_SCHEMA_MISSING: { kind: 'config', title: 'المشروع الثاني بلا جداول المستودع', cause: 'لم تُطبَّق هجرات gps-warehouse/supabase/migrations على المشروع الثاني.', action: 'طبّق الهجرات على المشروع الثاني (db push بـ --workdir gps-warehouse أو لصق الملف في SQL Editor) ثم أعد الفحص.', owner: 'وحدة التطوير المركزية' },
  GPS_WAREHOUSE_UNREACHABLE: { kind: 'provider', title: 'تعذّر الوصول إلى مستودع GPS', cause: 'المشروع الثاني لا يستجيب (متوقف مؤقتاً بعد خمول 7 أيام في الخطة المجانية، أو الرابط خاطئ).', action: 'افتح لوحة المشروع الثاني؛ إن كان Paused اضغط Restore ثم أعد الفحص. تحقق من GPS_WAREHOUSE_URL.', owner: 'وحدة التطوير المركزية' },
  GPS_WAREHOUSE_FORBIDDEN: { kind: 'config', title: 'لا صلاحية لإدارة مستودع GPS', cause: 'الفحص لغرفة العمليات وIT؛ المزامنة والجدولة لـ IT فقط.', action: 'ادخل بحساب IT.', owner: '—' },
  GPS_WAREHOUSE_RPC_FAILED: { kind: 'db', title: 'خطأ داخل مستودع GPS', cause: 'الدالة في المشروع الثاني فشلت.', action: 'راجع التفاصيل بعد الرمز؛ إن تكرر أعد تطبيق هجرات المستودع.', owner: 'وحدة التطوير المركزية' },
  LVN_HISTORY_ALREADY_RUNNING: {
    kind: 'busy',
    title: 'استيراد سجل سابق قيد التنفيذ',
    cause: 'طلب استيراد تاريخي آخر لم ينتهِ بعد.',
    action: 'انتظر انتهاءه ثم أعد الطلب.',
    owner: '—',
  },
  LVN_PAGE_LIMIT_EXCEEDED: {
    kind: 'provider',
    title: 'عدد صفحات البيانات تجاوز الحد',
    cause: 'LVN أعاد أكثر من 100 صفحة في طلب واحد.',
    action: 'نفّذ مزامنة كاملة ثم جزئية؛ أبلغ التطوير إن تكرر.',
    owner: 'وحدة التطوير المركزية',
  },
}

const PREFIXES: Array<[RegExp, Omit<LvnErrorInfo, 'code'>]> = [
  [/^LVN_LOGIN_HTTP_(\d+)/, { kind: 'provider', title: 'خادم LVN لا يستجيب لتسجيل الدخول', cause: 'LVN أعاد حالة HTTP غير 200 عند الدخول (الرقم في الكود) — عطل أو صيانة لديهم أو تغيّر عنوان API.', action: 'أعد المحاولة لاحقاً؛ تحقق من LVN_API_BASE_URL إن استمر.', owner: 'شركة LVN' }],
  [/^LVN_HTTP_(\d+)/, { kind: 'provider', title: 'خادم LVN أعاد خطأ أثناء سحب البيانات', cause: 'استجابة HTTP غير ناجحة من LVN (الرقم في الكود).', action: 'أعد المحاولة؛ إن استمر فراجع شركة LVN.', owner: 'شركة LVN' }],
  [/^TRIP_ROUTE_(APPLY|QUEUE|REQUEST)_FAILED/, { kind: 'db', title: 'وصلت النقاط لكن تعذّر حفظ المسار', cause: 'خطأ في قاعدة البيانات أثناء بناء مسار الانطلاقية.', action: 'أعد السحب؛ إن تكرر أبلغ التطوير.', owner: 'وحدة التطوير المركزية' }],
  [/^LVN_(APPLY|EVENTS|ALERTS|GEOFENCES|HISTORY_APPLY)_FAILED/, { kind: 'db', title: 'وصلت البيانات من LVN لكن تعذّر حفظها', cause: 'خطأ في قاعدة بياناتنا أثناء تطبيق النقاط (الكود بعد النقطتين هو رمز Postgres).', action: 'أبلغ وحدة التطوير مع رمز الخطأ.', owner: 'وحدة التطوير المركزية' }],
  [/^LVN_(SYNC|HISTORY)_RUN_CREATE_FAILED/, { kind: 'db', title: 'تعذّر فتح سجل مزامنة', cause: 'فشل إدراج صف في gps_sync_runs.', action: 'أبلغ وحدة التطوير.', owner: 'وحدة التطوير المركزية' }],
  [/^LVN_SYNC_FAILED|^LVN_HISTORY_SYNC_FAILED/, { kind: 'unknown', title: 'فشلت المزامنة دون رمز مفصّل', cause: 'الدالة أعادت ok=false بلا كود.', action: 'راجع سجل المزامنة أدناه.', owner: 'وحدة التطوير المركزية' }],
]

export function explainLvnError(rawCode: string | null | undefined): LvnErrorInfo {
  const code = String(rawCode ?? '').trim()
  const base = code.split(':')[0] ?? ''
  const exact = CATALOG[base]
  if (exact) return { code, ...exact }
  for (const [re, info] of PREFIXES) if (re.test(base)) return { code, ...info }
  if (/non-2xx|FunctionsHttpError|Failed to send|Failed to fetch/i.test(code))
    return { code, kind: 'unknown', title: 'تعذّر الوصول إلى خدمة المزامنة', cause: 'المتصفح لم يستلم رداً سليماً من الدالة الخادمية (شبكة/DNS أو خطأ غير مصنّف).', action: 'تحقق من الاتصال ثم أعد المحاولة؛ راجع سجل المزامنة لرمز الفشل.', owner: 'وحدة التطوير المركزية' }
  return { code: code || '—', kind: 'unknown', title: 'خطأ غير مصنّف', cause: code ? `الرمز: ${code}` : 'لا تفاصيل.', action: 'أبلغ وحدة التطوير مع الرمز.', owner: 'وحدة التطوير المركزية' }
}

/** رسالة سطر واحد للتنبيهات */
export function lvnErrorToast(rawCode: string | null | undefined): string {
  const e = explainLvnError(rawCode)
  return `${e.title} (${e.code}) — ${e.action}`
}
