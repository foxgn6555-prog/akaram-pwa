import { AppError } from './AppError'
import { SDKError } from './SDKError'
import { AuthError } from './AuthError'
import { logger } from '@lib/monitoring/logger'

/**
 * خريطة الأكواد التعاقدية (RAISE EXCEPTION من الخادم) إلى رسائل عربية مفهومة.
 * تُطبق مركزياً في handleAppError فتستفيد منها كل البوابات دون خرائط مكررة،
 * والأكواد غير المدرجة تمر كما هي (سلوك سابق محفوظ).
 */
const APP_ERROR_AR: Record<string, string> = {
  // دورة رحلة الآلية (مسؤول القسم)
  GARAGE_SITE_DEPARTURE_NOT_ALLOWED:
    'لا يمكن إنهاء الوردية للكراج في الوضع الحالي — الآلية في المحطة أو الصيانة، أو غادرت الموقع مسبقاً.',
  GARAGE_ARRIVAL_NOT_ALLOWED:
    'لا يمكن تأكيد وصول هذه الآلية — وصلت مسبقاً أو ليست ضمن مسؤوليتك.',
  GARAGE_ARRIVAL_NOT_CONFIRMED:
    'أكّد وصول الآلية إلى موقع العمل أولاً قبل إنهاء الوردية.',
  TRIP_LEG_ALREADY_OPEN:
    'توجد حركة مفتوحة للآلية (في الطريق) — انتظر تأكيد وصولها قبل أي إجراء آخر.',
  TRIP_NOT_AT_MANAGER_SITE:
    'الآلية ليست في موقع العمل الآن — لا يمكن إرسالها في هذه الحالة.',
  SITE_RETURN_NOT_ALLOWED:
    'لا يمكن تأكيد عودة الآلية إلى الموقع في حالتها الحالية.',
  SECTOR_MANAGER_FORBIDDEN: 'هذه العملية متاحة لمسؤول القسم فقط.',
  GARAGE_STAGE_NOTES_TOO_LONG: 'الملاحظات طويلة جداً — الحد الأقصى 500 حرف.',
  TRIP_NOTES_TOO_LONG: 'الملاحظات طويلة جداً — الحد الأقصى 1000 حرف.',
  // المحطة التحويلية
  STATION_FORBIDDEN: 'هذه العملية متاحة لموظف المحطة التحويلية فقط.',
  STATION_ARRIVAL_NOT_ALLOWED: 'لا يمكن تأكيد وصول الآلية إلى المحطة في حالتها الحالية.',
  STATION_DESTINATION_INVALID: 'جهة الإرسال غير صالحة — اختر موقع العمل أو الكراج.',
  VEHICLE_NOT_AT_STATION: 'الآلية غير موجودة في المحطة الآن.',
  // الصيانة
  MAINTENANCE_FORBIDDEN: 'هذه العملية متاحة لموظف الصيانة فقط.',
  MAINTENANCE_INPUT_INVALID: 'بيانات العطل غير صالحة — تحقق من نوع العطل والأولوية.',
  MAINTENANCE_NOT_READY: 'الحالة غير جاهزة للإرسال — أكمل الإصلاح والموافقة أولاً.',
  MAINTENANCE_DESTINATION_INVALID: 'جهة الإرسال غير صالحة — اختر موقع العمل أو الكراج.',
  MAINTENANCE_CASE_ALREADY_OPEN: 'توجد حالة صيانة مفتوحة لهذه الرحلة بالفعل.',
  MAINTENANCE_READINESS_APPROVAL_REQUIRED: 'يلزم اعتماد جاهزية الآلية قبل إرسالها من الصيانة.',
  BREAKDOWN_ALREADY_OPEN: 'العطل مسجل على رحلة أخرى — أغلقه أولاً.',
  // الكراج المركزي والانطلاقيات
  GARAGE_VEHICLE_NOT_FOUND: 'الآلية غير موجودة أو مؤرشفة.',
  GARAGE_DEPARTURE_ALREADY_OPEN: 'توجد انطلاقية مفتوحة لهذه الآلية — أغلقها بتسجيل العودة أولاً.',
  GARAGE_SHIFT_ASSIGNMENT_NOT_FOUND: 'لا يوجد سائق ومنطقة مسندان لهذا الشفت — أكمل الإسناد أولاً.',
  GARAGE_SHIFT_INVALID: 'الشفت المحدد غير صالح.',
  GARAGE_VEHICLE_IN_MAINTENANCE: 'الآلية في الصيانة — لا يمكن إطلاقها حتى عودتها.',
  GARAGE_VEHICLE_SCOPE_FORBIDDEN: 'الآلية خارج نطاق صلاحياتك في الكراج.',
  GARAGE_RECIPIENT_NOT_ELIGIBLE:
    'المسؤول المختار غير مؤهل لهذه المنطقة. اختر مسؤولاً يغطي المنطقة أو قاطعها.',
  GARAGE_SECTOR_MANAGER_NOT_CONFIGURED:
    'لا يوجد مسؤول مهيأ لهذه المنطقة ولا لأي منطقة ضمن القاطع. حدّث ملفات مسؤولي القسم أولاً.',
  GARAGE_DEPARTURE_NOTES_TOO_LONG: 'الملاحظات طويلة جداً — الحد الأقصى 500 حرف.',
  // وحدة GBS الحاويات (00136)
  GBS_FORBIDDEN: 'هذه العملية متاحة لغرفة العمليات فقط.',
  GBS_MANAGER_FORBIDDEN: 'هذه العملية متاحة لمسؤول القسم فقط.',
  GBS_CONTAINER_NOT_FOUND: 'الحاوية غير موجودة — ربما حُذفت من غرفة العمليات.',
  GBS_LABEL_INVALID: 'اسم الحاوية يجب أن يكون بين 2 و120 حرفاً.',
  GBS_POINT_INVALID: 'الإحداثيات غير صالحة — حدد موقعاً صحيحاً على الخريطة.',
  GBS_STATUS_INVALID: 'حالة الحاوية غير صالحة — اختر واحدة من الحالات الأربع.',
  GBS_NOTES_INVALID: 'الملاحظات طويلة جداً — الحد الأقصى 500 حرف.',
  GBS_UPDATE_ALREADY_PENDING: 'لديك طلب تحديث معلق لهذه الحاوية — انتظر قرار غرفة العمليات.',
  GBS_UPDATE_NOT_PENDING: 'هذا الطلب حُسم مسبقاً (اعتماد أو رفض).',
  GBS_STATE_INVALID: 'حالة الطلب غير صالحة.',
  GBS_IMAGE_INVALID: 'ملف الصورة غير صالح — اختر صورة فقط.',
  GBS_UPLOAD_FAILED: 'تعذر رفع الصورة — حاول مرة أخرى.',
  GBS_IMAGE_URL_FAILED: 'تعذر تحميل الصورة — حاول مرة أخرى.',
}

function translateAppMessage(message: string): string | null {
  for (const code of Object.keys(APP_ERROR_AR)) {
    if (message.includes(code)) return APP_ERROR_AR[code] ?? null
  }
  return null
}

/**
 * المعالج المركزي للأخطاء — استدعِه من ErrorBoundary و onError hooks.
 * يرسل إلى Sentry ويحول الأخطاء الفنية إلى رسائل آمنة للعرض.
 */
export function handleAppError(error: unknown, context?: Record<string, unknown>): AppError {
  const appError = normalizeError(error)

  if (appError instanceof SDKError && appError.isForbidden) {
    logger.warn('RLS rejection', { code: appError.code, ...context })
  } else {
    logger.error(appError, context)
  }

  const translated = translateAppMessage(appError.message)
  if (translated) return new AppError(translated, appError.code, appError)
  return appError
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof Error) return new AppError(error.message, 'UNEXPECTED', error)
  return new AppError('خطأ غير معروف', 'UNKNOWN', error)
}

/** رسالة آمنة للعرض للمستخدم النهائي */
export function toUserMessage(error: unknown): string {
  const e = normalizeError(error)
  if (e instanceof SDKError && e.isForbidden) return 'ليس لديك صلاحية لتنفيذ هذه العملية'
  if (e instanceof SDKError && e.isNotFound) return 'العنصر المطلوب غير موجود'
  if (e instanceof SDKError && e.code === 'NETWORK') return 'تعذر الاتصال — سيُعاد الإرسال تلقائياً عند توفر الشبكة'
  if (e instanceof AuthError) return 'انتهت الجلسة — يرجى تسجيل الدخول من جديد'
  return 'حدث خطأ غير متوقع — حاول مرة أخرى'
}
