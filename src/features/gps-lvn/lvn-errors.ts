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
