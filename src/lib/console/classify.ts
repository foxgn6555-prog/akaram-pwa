/**
 * Console · مصنِّف الأخطاء — دوال نقية بلا DOM.
 * يحوّل أي خطأ/تنبيه خام (رسالة + stack + مصدر + كود) إلى:
 *   نوع ثابت (kind) + عنوان عربي + شرح لماذا يحدث + خطوات حل مرتبة + درجة الخطورة
 * ويستنتج البوابة من المسار (/media → بوابة الإعلام). يُستعمل في العميل (البصمة)
 * وفي صفحة Console (الشرح والإجراءات) حتى يكون التفسير واحداً في كل مكان.
 */
import { PORTAL_DEFINITIONS, type PortalId } from '@lib/constants/portals.constants'

export type ConsoleLevel = 'error' | 'warn'
export type ConsoleSource = 'logger' | 'window' | 'promise' | 'console' | 'boundary' | 'sdk' | 'network' | 'asset'
export type ConsoleSeverity = 'critical' | 'high' | 'medium' | 'low'

export type ConsoleKind =
  | 'chunk_load'
  | 'offline'
  | 'server_5xx'
  | 'auth_expired'
  | 'permission'
  | 'rpc_missing'
  | 'db_constraint'
  | 'contract_code'
  | 'validation'
  | 'react_render'
  | 'react_warning'
  | 'null_access'
  | 'asset_missing'
  | 'quota'
  | 'timeout'
  | 'realtime'
  | 'unknown'

export interface KindInfo {
  kind: ConsoleKind
  title: string
  severity: ConsoleSeverity
  /** لماذا يحدث هذا الخطأ — بلغة بسيطة */
  explanation: string
  /** خطوات الحل بالترتيب */
  actions: string[]
  /** من المعني بالحل */
  owner: 'it' | 'developer' | 'user' | 'infra'
}

export const KIND_CATALOG: Record<ConsoleKind, KindInfo> = {
  chunk_load: {
    kind: 'chunk_load',
    title: 'نسخة قديمة من التطبيق',
    severity: 'medium',
    owner: 'it',
    explanation:
      'المتصفح يطلب ملف جافاسكربت من نشرة سابقة لم تعد موجودة بعد تحديث المنصة (أو انقطع التحميل). التطبيق يعيد التحميل مرة واحدة تلقائياً.',
    actions: [
      'اطلب من المستخدم تحديث الصفحة (Ctrl+F5) إن لم تُعد تلقائياً.',
      'إن تكرر لدى كثيرين بعد نشر جديد: تأكد من أن Service Worker الجديد سيطر (وحدة التحديثات).',
      'إن استمر بعد التحديث: احتمال فشل النشر جزئياً — أعد نشر الواجهة.',
    ],
  },
  offline: {
    kind: 'offline',
    title: 'انقطاع الاتصال بالخادم',
    severity: 'low',
    owner: 'user',
    explanation: 'الجهاز بلا إنترنت أو الشبكة ضعيفة، فلم يصل الطلب إلى Supabase. غالباً مؤقت ومن طرف المستخدم.',
    actions: [
      'إن كان من مستخدم واحد: مشكلة شبكة محلية — لا إجراء.',
      'إن ظهر من مستخدمين كثر بنفس الدقيقة: تحقق من حالة مشروع Supabase ولوحة الحالة.',
      'راجع أن رابط VITE_SUPABASE_URL صحيح في النشرة الحالية.',
    ],
  },
  server_5xx: {
    kind: 'server_5xx',
    title: 'خطأ في الخادم (5xx)',
    severity: 'critical',
    owner: 'infra',
    explanation: 'الخادم (PostgREST / دالة الحافة / قاعدة البيانات) أعاد خطأ داخلياً. ليس خطأ مستخدم.',
    actions: [
      'افتح سجلات Supabase (Logs → Postgres / Edge Functions) في نفس التوقيت.',
      'إن كان الطلب RPC: نفّذ الدالة يدوياً بنفس المعاملات في SQL Editor لرؤية الخطأ الحقيقي.',
      'تحقق من آخر ترحيل (migration) طُبّق — قد تكون دالة تشير إلى عمود/جدول غير موجود.',
    ],
  },
  auth_expired: {
    kind: 'auth_expired',
    title: 'انتهاء الجلسة / رمز غير صالح',
    severity: 'medium',
    owner: 'user',
    explanation: 'رمز JWT انتهى أو أُبطل (تغيير كلمة المرور، حذف الحساب، أو ساعة الجهاز غير مضبوطة). الطلب رُفض بـ 401.',
    actions: [
      'اطلب من المستخدم تسجيل الخروج ثم الدخول.',
      'إن تكرر فور الدخول: تحقق من ساعة جهاز المستخدم (فرق التوقيت يُبطل الرمز).',
      'إن تكرر لمستخدمين كثر: راجع إعدادات JWT expiry في Supabase Auth.',
    ],
  },
  permission: {
    kind: 'permission',
    title: 'رفض صلاحية (RLS / 403)',
    severity: 'high',
    owner: 'it',
    explanation:
      'سياسة أمان الصفوف (RLS) أو فحص الدور في الدالة رفض العملية. إما أن المستخدم بلا الدور المطلوب، أو أن السياسة لا تغطي حالته.',
    actions: [
      'افتح «المستخدمون» وتحقق من أدوار هذا الحساب (الدور المطلوب للبوابة المذكورة).',
      'إن كان الدور صحيحاً: السياسة ناقصة — راجع سياسات الجدول المذكور في الرسالة.',
      'لا تمنح super_admin كحل مؤقت — أصلح السياسة أو الدور.',
    ],
  },
  rpc_missing: {
    kind: 'rpc_missing',
    title: 'دالة أو جدول غير موجود في قاعدة البيانات',
    severity: 'critical',
    owner: 'it',
    explanation:
      'الواجهة تستدعي دالة RPC أو جدولاً/عموداً غير موجود (PGRST202 / 42883 / 42P01 / 42703). السبب شبه الدائم: ترحيل لم يُطبَّق بعد نشر الواجهة.',
    actions: [
      'نفّذ npx supabase db push وتأكد من أن آخر ترحيل في المستودع مطبّق.',
      'في Supabase: Database → Functions ابحث عن اسم الدالة المذكور.',
      'إن كان الاسم مختلفاً عن المستودع: توقيع الدالة تغيّر — أعد النشر بالترتيب (قاعدة البيانات ثم الواجهة).',
    ],
  },
  db_constraint: {
    kind: 'db_constraint',
    title: 'قيد في قاعدة البيانات',
    severity: 'high',
    owner: 'developer',
    explanation:
      'قاعدة البيانات رفضت البيانات: قيمة مكررة (23505)، مرجع غير موجود (23503)، قيمة خارج القيد (23514)، أو حقل إلزامي فارغ (23502).',
    actions: [
      'اقرأ اسم القيد في الرسالة — يدل على الجدول والعمود.',
      'إن كان تكراراً: المستخدم يحاول إدخال سجل موجود — الواجهة يجب أن تمنعه برسالة واضحة.',
      'إن كان مرجعاً مفقوداً: سجل مرتبط حُذف — راجع ترتيب الحذف أو أضف on delete مناسباً.',
    ],
  },
  contract_code: {
    kind: 'contract_code',
    title: 'رفض قاعدة عمل (كود تعاقدي)',
    severity: 'low',
    owner: 'user',
    explanation:
      'الخادم رفض العملية بكود مقصود (مثل MEDIA_DESIGN_LOCKED أو SUPPLY_QTY_INVALID). هذا سلوك متعمد يحمي قواعد العمل، لكن إن وصل إلى هنا فالواجهة لم تمنعه مسبقاً أو لم تعرض رسالة مفهومة.',
    actions: [
      'ابحث عن الكود في APP_ERROR_AR (error.handler.ts) — إن لم يكن موجوداً أضف ترجمة عربية له.',
      'إن تكرر كثيراً من نفس الشاشة: الواجهة تسمح بإجراء يجب تعطيله مسبقاً.',
      'لا يحتاج تدخلاً في قاعدة البيانات.',
    ],
  },
  validation: {
    kind: 'validation',
    title: 'بيانات غير مطابقة للمخطط',
    severity: 'medium',
    owner: 'developer',
    explanation: 'مخطط التحقق (zod) رفض بيانات قادمة من الخادم أو من النموذج — شكل البيانات تغيّر عن المتوقع.',
    actions: [
      'قارن الحقول المذكورة في الرسالة مع آخر تغيير في الجدول/الدالة.',
      'إن كان الحقل جديداً في قاعدة البيانات: حدّث المخطط في الواجهة.',
      'إن كان من نموذج إدخال: أضف تحققاً وتنبيهاً قبل الإرسال.',
    ],
  },
  react_render: {
    kind: 'react_render',
    title: 'انهيار شاشة (خطأ عرض)',
    severity: 'critical',
    owner: 'developer',
    explanation: 'مكوّن React رمى استثناءً أثناء العرض فظهرت للمستخدم شاشة «حدث خطأ غير متوقع». غالباً بيانات ناقصة لم تُعالج (null) أو خطاف خارج ترتيبه.',
    actions: [
      'افتح stack: أول سطر من src/ يحدد المكوّن.',
      'أعد الإنتاج بنفس الرابط (url) والمستخدم إن أمكن.',
      'أضف حارساً للحالة الفارغة أو أصلح ترتيب الخطافات، ثم اختباراً يثبت ذلك.',
    ],
  },
  react_warning: {
    kind: 'react_warning',
    title: 'تنبيه React (مفاتيح/خصائص/خطافات)',
    severity: 'low',
    owner: 'developer',
    explanation: 'تنبيه من React في وحدة التحكم: مفاتيح مكررة في قائمة، خاصية غير معروفة، أو تحديث حالة بعد إزالة المكوّن. لا يكسر الشاشة لكنه يسبب سلوكاً غير متوقع.',
    actions: [
      'مفاتيح مكررة: استخدم معرّف السجل بدل الفهرس.',
      'تحديث بعد الإزالة: ألغِ الاشتراك/المؤقت في cleanup.',
      'خاصية غير معروفة: راجع اسم الخاصية (camelCase).',
    ],
  },
  null_access: {
    kind: 'null_access',
    title: 'وصول إلى قيمة فارغة (undefined/null)',
    severity: 'high',
    owner: 'developer',
    explanation: 'الكود قرأ خاصية من قيمة غير معرّفة (Cannot read properties of undefined). السبب المعتاد: بيانات من الخادم بشكل مختلف عن المتوقع أو حالة تحميل لم تُعالج.',
    actions: [
      'حدد السطر من stack وتحقق من مصدر القيمة.',
      'أضف ?. أو قيمة افتراضية، وعالج حالة التحميل/الفراغ.',
      'إن كان مصدرها RPC: تحقق من أن الدالة ترجع الأعمدة المتوقعة.',
    ],
  },
  asset_missing: {
    kind: 'asset_missing',
    title: 'ملف أو صورة غير موجودة',
    severity: 'low',
    owner: 'it',
    explanation: 'صورة/أيقونة/ملف لم يُحمَّل (404 أو رابط موقّع منتهٍ). لا يكسر الوظيفة لكنه يظهر كصورة مكسورة.',
    actions: [
      'إن كان الرابط موقّعاً من التخزين: انتهت صلاحيته أو حُذف الملف — راجع سياسة التخزين.',
      'إن كان مساراً ثابتاً (/icons/…): الملف غير موجود في public/ — أعد إضافته.',
    ],
  },
  quota: {
    kind: 'quota',
    title: 'امتلاء التخزين المحلي',
    severity: 'medium',
    owner: 'user',
    explanation: 'localStorage/IndexedDB ممتلئ على جهاز المستخدم (QuotaExceeded) فلم تُحفظ البيانات محلياً.',
    actions: ['اطلب من المستخدم مسح بيانات الموقع من المتصفح.', 'إن تكرر: راجع ما تخزنه الواجهة محلياً وقلّصه.'],
  },
  timeout: {
    kind: 'timeout',
    title: 'انتهاء مهلة الطلب',
    severity: 'medium',
    owner: 'infra',
    explanation: 'الطلب استغرق أكثر من المهلة (استعلام ثقيل أو دالة بطيئة أو شبكة بطيئة).',
    actions: [
      'حدد الدالة/الاستعلام من الرابط أو السياق.',
      'شغّل explain analyze للاستعلام — أضف فهرساً إن لزم.',
      'إن كانت دالة حافة: راجع زمن التنفيذ في سجلاتها.',
    ],
  },
  realtime: {
    kind: 'realtime',
    title: 'انقطاع قناة البث الحي',
    severity: 'low',
    owner: 'infra',
    explanation: 'قناة Realtime (الإشعارات/GPS) انقطعت أو رُفض الاشتراك. التطبيق يعيد الاتصال تلقائياً.',
    actions: [
      'إن تكرر باستمرار: تحقق من أن الجدول مضاف إلى publication supabase_realtime.',
      'تحقق من سياسات RLS للجدول — Realtime يحترمها.',
    ],
  },
  unknown: {
    kind: 'unknown',
    title: 'خطأ غير مصنّف',
    severity: 'medium',
    owner: 'developer',
    explanation: 'لم تطابق الرسالة أي نمط معروف. اقرأ الرسالة والـ stack وصنّفه يدوياً، ثم أضف نمطاً جديداً للمصنّف إن كان متكرراً.',
    actions: ['افتح التفاصيل (stack + url + السياق).', 'أعد الإنتاج على نفس الشاشة.', 'إن تكرر: أضف قاعدة تصنيف جديدة في classify.ts مع اختبار.'],
  },
}

export interface RawEvent {
  message: string
  stack?: string | null
  source?: ConsoleSource
  level?: ConsoleLevel
  /** كود PostgREST/Postgres إن وُجد (PGRST202, 42501, 23505, …) */
  code?: string | null
  /** HTTP status إن وُجد */
  status?: number | null
  url?: string | null
}

export interface ClassifiedEvent {
  kind: ConsoleKind
  level: ConsoleLevel
  info: KindInfo
  /** الكود التعاقدي المستخرج (SUPPLY_QTY_INVALID) إن وُجد */
  contractCode: string | null
  fingerprint: string
  portal: string
}

const CONTRACT_CODE_RE = /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+){1,6})\b/

/** يستخرج كوداً تعاقدياً (أحرف كبيرة وشرطات سفلية) إن كان في الرسالة */
export function extractContractCode(message: string): string | null {
  const m = CONTRACT_CODE_RE.exec(message)
  if (!m) return null
  const code = m[1] as string
  // استبعاد أكواد Postgres/PostgREST الشكلية
  if (/^PGRST\d+$/.test(code) || /^[0-9A-Z]{5}$/.test(code)) return null
  return code
}

export function classifyKind(e: RawEvent): ConsoleKind {
  const msg = (e.message || '').toLowerCase()
  const code = (e.code || '').toUpperCase()
  const status = e.status ?? null

  if (e.source === 'asset') return 'asset_missing'
  if (/failed to fetch dynamically imported module|importing a module script failed|loading chunk|loading css chunk|preloaderror|error loading dynamically imported/.test(msg)) return 'chunk_load'
  if (/quotaexceeded|quota exceeded|exceeded the quota/.test(msg)) return 'quota'
  if (status === 401 || code === 'PGRST301' || /jwt expired|invalid jwt|invalid token|refresh_token_not_found|session_not_found|not authenticated/.test(msg)) return 'auth_expired'
  if (status === 403 || code === '42501' || /row-level security|permission denied|_forbidden\b|forbidden/.test(msg)) return 'permission'
  if (code === 'PGRST202' || code === '42883' || code === '42P01' || code === '42703' || code === 'PGRST204' || /could not find the function|does not exist|schema cache|relation .* does not exist|column .* does not exist/.test(msg)) return 'rpc_missing'
  if (/^23\d{3}$/.test(code) || /duplicate key|violates (foreign key|check|not-null|unique) constraint/.test(msg)) return 'db_constraint'
  if (status === 408 || code === '57014' || /timed? ?out|statement timeout|canceling statement/.test(msg)) return 'timeout'
  if ((status !== null && status >= 500) || /^(5\d{2})\b/.test(msg) || /internal server error|bad gateway|service unavailable|gateway timeout/.test(msg)) return 'server_5xx'
  if (/failed to fetch|networkerror|network request failed|load failed|err_internet_disconnected|err_network|net::err|offline/.test(msg)) return 'offline'
  if (/realtime|channel error|websocket|subscribe/.test(msg)) return 'realtime'
  if (extractContractCode(e.message)) return 'contract_code'
  if (/zoderror|invalid_type|invalid input|expected .* received|validation failed|غير صالح/.test(msg) && !/constraint/.test(msg)) return 'validation'
  if (e.source === 'boundary' || /componentstack|the above error occurred in|minified react error #(?!(418|423|425))/.test(msg + ' ' + (e.stack ?? '').toLowerCase())) return 'react_render'
  if (/each child in a list should have a unique "key"|encountered two children with the same key|warning: |react does not recognize|cannot update a component|can't perform a react state update|rendered more hooks|invalid hook call|act\(/.test(msg)) return 'react_warning'
  if (/cannot read propert|is not a function|is undefined|is null|undefined is not an object|null is not an object|cannot destructure|cannot access .* before initialization/.test(msg)) return 'null_access'
  return 'unknown'
}

/** اسم البوابة بالعربية من المسار — /media/designs/3 → بوابة الإعلام */
const PORTAL_AR: Record<PortalId, string> = {
  public: 'البوابة العامة',
  employee: 'بوابة المتعهد',
  hr: 'الموارد البشرية',
  manager: 'مسؤول قسم',
  finance: 'الشؤون المالية',
  it: 'التطوير المركزية',
  admin: 'المدير المفوض',
  'field-ops': 'العمليات الميدانية',
  'admin-ops': 'مسؤول القاطع',
  maintenance: 'الصيانة',
  'transfer-station': 'المحطة التحويلية',
  executive: 'المدير التنفيذي',
  deputy: 'معاون المدير المفوض',
  'ops-room': 'غرفة العمليات',
  disclosures: 'وحدة الكشوفات',
  complaints: 'بوابة الشكاوى',
  media: 'بوابة الإعلام',
  'central-garage': 'الكراج المركزي',
}

export function portalFromPath(pathOrUrl: string | null | undefined): PortalId | 'unknown' {
  if (!pathOrUrl) return 'unknown'
  let path = pathOrUrl
  try {
    if (/^https?:\/\//i.test(pathOrUrl)) path = new URL(pathOrUrl).pathname
  } catch {
    /* مسار خام */
  }
  const seg = (path.split('?')[0] ?? '').split('/').filter(Boolean)[0]
  const first = '/' + (seg ?? '')
  if (first === '/login' || first === '/') return 'public'
  const def = PORTAL_DEFINITIONS.find((p) => p.path === first)
  return def ? def.id : 'unknown'
}

export function portalLabel(id: string): string {
  return (PORTAL_AR as Record<string, string>)[id] ?? (id === 'unknown' ? 'غير محدد' : id)
}

/** بصمة ثابتة: نفس النوع + نفس البوابة + الرسالة بعد إزالة الأرقام/المعرّفات المتغيرة */
export function fingerprintOf(kind: ConsoleKind, portal: string, message: string): string {
  const norm = message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>')
    .replace(/\d+/g, '<n>')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
  return hash32(`${kind}|${portal}|${norm}`)
}

function hash32(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function classify(e: RawEvent): ClassifiedEvent {
  const kind = classifyKind(e)
  const portal = portalFromPath(e.url ?? null)
  const level: ConsoleLevel = e.level ?? (kind === 'react_warning' ? 'warn' : 'error')
  return {
    kind,
    level,
    info: KIND_CATALOG[kind],
    contractCode: kind === 'contract_code' ? extractContractCode(e.message) : null,
    fingerprint: fingerprintOf(kind, portal, e.message),
    portal,
  }
}

export const SEVERITY_LABEL: Record<ConsoleSeverity, string> = {
  critical: 'حرج',
  high: 'مرتفع',
  medium: 'متوسط',
  low: 'منخفض',
}

export const OWNER_LABEL: Record<KindInfo['owner'], string> = {
  it: 'التطوير المركزية',
  developer: 'المطوّر',
  user: 'المستخدم / الشبكة',
  infra: 'البنية (Supabase)',
}

export const SOURCE_LABEL: Record<ConsoleSource, string> = {
  logger: 'المسجّل',
  window: 'استثناء عام',
  promise: 'وعد مرفوض',
  console: 'console',
  boundary: 'حاجز الشاشة',
  sdk: 'طبقة البيانات',
  network: 'الشبكة',
  asset: 'ملف/صورة',
}
