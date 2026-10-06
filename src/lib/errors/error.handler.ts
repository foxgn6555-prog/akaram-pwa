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
  // طلبات الدعم بين المسؤولين (00154)
  SUPPORT_TARGET_INVALID: 'اختر مسؤول قسم آخر لطلب الدعم منه.',
  SUPPORT_SECTOR_NOT_MINE: 'المنطقة المحتاجة للدعم يجب أن تكون من مناطقك.',
  SUPPORT_COUNT_INVALID: 'عدد الآليات المطلوبة يجب أن يكون بين 1 و20.',
  SUPPORT_REASON_INVALID: 'اكتب سبباً واضحاً (3 إلى 500 حرف).',
  SUPPORT_REQUEST_DUPLICATE: 'لديك طلب معلّق لنفس المسؤول ونفس المنطقة — انتظر رده أو ألغِ الطلب السابق.',
  SUPPORT_REQUEST_FORBIDDEN: 'هذا الطلب ليس موجهاً إليك أو ليس من إنشائك.',
  SUPPORT_REQUEST_NOT_PENDING: 'تم البتّ في هذا الطلب مسبقاً.',
  SUPPORT_REQUEST_NOT_OPEN: 'هذا الطلب مغلق ولا يمكن إلغاؤه.',
  SUPPORT_VEHICLES_REQUIRED: 'حدّد آلية واحدة على الأقل لإرسالها.',
  SUPPORT_TOO_MANY_VEHICLES: 'عدد الآليات المحددة أكبر من المطلوب.',
  SUPPORT_VEHICLE_NOT_MINE: 'هذه الآلية ليست تحت استلامك الآن.',
  SUPPORT_VEHICLE_NOT_AT_SITE: 'لا يمكن إرسال آلية إلا وهي تعمل في موقعك (ليست في الطريق أو المحطة أو الصيانة).',
  SUPPORT_VEHICLE_ALREADY_LENT: 'هذه الآلية مُرسلة دعماً بالفعل.',
  SUPPORT_ASSIGNMENT_NOT_FOUND: 'إسناد الدعم غير موجود.',
  SUPPORT_ASSIGNMENT_ENDED: 'انتهى هذا الدعم مسبقاً.',
  GPS_ROUTE_GRACE_INVALID: 'مهلة التسامح يجب أن تكون بين 0 و120 دقيقة.',
  GPS_ZONE_SECTOR_INVALID: 'المنطقة المختارة للزون غير صحيحة.',
  GARAGE_STAGE_NOTES_TOO_LONG: 'الملاحظات طويلة جداً — الحد الأقصى 500 حرف.',
  TRIP_NOTES_TOO_LONG: 'الملاحظات طويلة جداً — الحد الأقصى 1000 حرف.',
  // المتعهدون (00158)
  CONTRACTOR_FORBIDDEN: 'هذه العملية غير متاحة لحسابك.',
  CONTRACTOR_NOT_ASSIGNED: 'حسابك لم يُسنَد بعد إلى مسؤول قسم ومنطقة — راجع التطوير المركزية.',
  // مسؤول القاطع وسلاسل الموافقات (00160)
  PARENT_SECTOR_MANAGER_FORBIDDEN: 'هذه الصفحة لمسؤول القاطع فقط.',
  OPS_ROOM_FORBIDDEN: 'هذه العملية لغرفة العمليات فقط.',
  STORE_ITEM_NAME_REQUIRED: 'أدخل اسم المادة (حرفان على الأقل).',
  STORE_ITEM_DUPLICATE: 'توجد مادة بهذا الاسم في المخزن.',
  STORE_ITEM_NOT_FOUND: 'المادة غير موجودة.',
  STORE_QTY_INVALID: 'الكمية غير صالحة.',
  STORE_REASON_REQUIRED: 'السبب إلزامي (3 أحرف على الأقل).',
  FLEET_IMPORT_EMPTY: 'ملف الاستيراد بلا صفوف.',
  FLEET_IMPORT_TOO_LARGE: 'ملف الاستيراد أكبر من 3000 صف — قسّمه.',
  SUPPLY_MANAGER_ONLY: 'طلب المستلزمات لمسؤول القسم فقط.',
  SUPPLY_ITEMS_REQUIRED: 'أضف مادة واحدة على الأقل.',
  SUPPLY_QTY_INVALID: 'كمية إحدى المواد غير صالحة.',
  SUPPLY_ITEM_INVALID: 'إحدى المواد غير متاحة في المخزن.',
  SUPPLY_ITEM_DUPLICATE: 'المادة مكررة في الطلب.',
  SUPPLY_NOT_FOUND: 'طلب المستلزمات غير موجود.',
  SUPPLY_NOT_PENDING: 'الطلب ليس قيد الموافقة.',
  SUPPLY_NOT_READY: 'الطلب غير جاهز للتسليم — أعلِن جاهزيته أولاً بعد اكتمال موافقاته.',
  SUPPLY_APPROVAL_PENDING: 'لا يمكن إعلان الجاهزية — في الطلب موافقات معلّقة لم تكتمل بعد.',
  SUPPLY_NOT_APPROVED: 'الطلب ليس بحالة «موافَق عليه» (ربما جُهّز أو سُلّم أو أُلغي).',
  SUPPLY_RECEIVER_REQUIRED: 'اسم المستلم إلزامي.',
  SUPPLY_DELIVERED_QTY_INVALID: 'الكمية المسلَّمة يجب أن تكون بين صفر والمطلوب.',
  SUPPLY_STOCK_INSUFFICIENT: 'المخزون لا يكفي لإحدى المواد — أدخل كمية أو سلّم جزئياً.',
  APPROVAL_REASON_REQUIRED: 'سبب الرفض إلزامي.',
  PROCEDURE_FORBIDDEN: 'وحدة الإجراءات لمسؤول القاطع والعمليات الميدانية والمعاون والمدير المفوض فقط.',
  PROCEDURE_TARGET_FORBIDDEN: 'هذا الشخص خارج نطاق صلاحيتك أو لم يعد على الملاك.',
  PROCEDURE_REASON_REQUIRED: 'سبب إنهاء الخدمة إلزامي (5 أحرف على الأقل).',
  PROCEDURE_ALREADY_PENDING: 'يوجد طلب إنهاء خدمة معلّق لهذا الشخص.',
  PROCEDURE_NOT_FOUND: 'طلب إنهاء الخدمة غير موجود.',
  PROCEDURE_NOT_PENDING: 'الطلب لم يعد قيد الموافقة.',
  HR_TERMINATION_TYPE_INVALID: 'نوع إنهاء الخدمة غير صالح.',
  FIELD_OPS_FORBIDDEN: 'هذه الصفحة للعمليات الميدانية فقط.',
  SECTOR_MANAGER_NOT_ASSIGNED: 'لم تُسنَد لك قواطع بعد — راجع التطوير المركزية.',
  SECTOR_MANAGER_ROLE_REQUIRED: 'الحساب ليس بدور «مسؤول القاطع».',
  SECTOR_MANAGER_SECTORS_REQUIRED: 'اختر قاطعاً واحداً على الأقل.',
  IT_FORBIDDEN: 'هذه العملية للتطوير المركزية فقط.',
  APPROVAL_STEPS_REQUIRED: 'أضف خطوة واحدة على الأقل إلى السلسلة.',
  APPROVAL_STEP_ROLE_INVALID: 'دور الخطوة غير مسموح به كخطوة «حسب التسلسل».',
  APPROVAL_STEP_ACCOUNT_INVALID: 'الحساب المحدد في إحدى الخطوات غير موجود.',
  APPROVAL_STEP_KIND_INVALID: 'نوع الخطوة غير معروف.',
  APPROVAL_TYPE_INVALID: 'نوع الطلب غير مدعوم.',
  APPROVAL_ROLE_REQUIRED: 'اختر دور الطالب.',
  APPROVAL_NO_APPROVER: 'لا يوجد أي مُعتمِد في سلسلة الموافقات لهذا الطلب (ربما كلّهم أنت) — راجع التطوير المركزية.',
  APPROVAL_NO_PENDING_STEP: 'لا توجد خطوة معلّقة لهذا الطلب.',
  NOTICE_TITLE_REQUIRED: 'عنوان التبليغ مطلوب (3 أحرف فأكثر).',
  NOTICE_BODY_REQUIRED: 'نص التبليغ مطلوب (3 أحرف فأكثر).',
  NOTICE_NO_RECIPIENTS: 'لا يوجد مستلمون — لا مسؤولي أقسام في قواطعك بعد.',
  NOTICE_TARGET_FORBIDDEN: 'أحد المستلمين ليس من مسؤولي أقسام قواطعك.',
  CONTRACTOR_ROLE_REQUIRED: 'هذا الحساب ليس حساب متعهد (دور بوابة المتعهد).',
  CONTRACTOR_MANAGER_INVALID: 'المستخدم المختار ليس مسؤول قسم له ملف مناطق.',
  CONTRACTOR_SECTOR_REQUIRED: 'لمسؤول القسم أكثر من منطقة — اختر منطقة المتعهد.',
  CONTRACTOR_SECTOR_NOT_MANAGERS: 'المنطقة المختارة ليست من مناطق مسؤول القسم.',
  CONTRACTOR_SECTOR_TAKEN: 'لهذه المنطقة متعهد نشط بالفعل — ألغِ إسناده أولاً.',
  CONTRACTOR_REASON_REQUIRED: 'اكتب سبباً (3 أحرف على الأقل).',
  CONTRACTOR_NOT_FOUND: 'لا يوجد تعيين نشط لهذا المتعهد.',
  CONTRACTOR_WORKER_NAME_INVALID: 'اسم العامل يجب أن يكون حرفين على الأقل.',
  CONTRACTOR_WORKER_DUPLICATE: 'يوجد عامل بهذا الاسم في فريقك بالفعل.',
  CONTRACTOR_WORKER_NOT_FOUND: 'العامل غير موجود في فريقك.',
  CONTRACTOR_LOCATION_REQUIRED: 'تعذّر تحديد موقعك — فعّل خدمة الموقع وأعد المحاولة.',
  CONTRACTOR_SELFIE_REQUIRED: 'صورتك الشخصية (سلفي) مطلوبة لتسجيل الحضور.',
  CONTRACTOR_TEAM_PHOTO_REQUIRED: 'صورة العمال مطلوبة لتسجيل الحضور.',
  CONTRACTOR_ALREADY_CHECKED_IN: 'سجّلت حضورك اليوم مسبقاً.',
  CONTRACTOR_CHECKIN_REQUIRED: 'سجّل حضورك أنت أولاً (الموقع والصور) قبل تسجيل حضور العمال.',
  CONTRACTOR_STATUS_INVALID: 'الحالة يجب أن تكون حاضر أو غائب.',
  CONTRACTOR_DATE_FUTURE: 'لا يمكن تسجيل حضور ليوم لم يأتِ بعد.',
  CONTRACTOR_DATE_LOCKED: 'يمكنك تسجيل اليوم أو أمس فقط — الأيام الأقدم تُعدَّل من غرفة العمليات.',
  MANAGER_FORBIDDEN: 'هذه العملية متاحة لمسؤول القسم فقط.',
  // المحطة التحويلية
  STATION_FORBIDDEN: 'هذه العملية متاحة لموظف المحطة التحويلية فقط.',
  STATION_ARRIVAL_NOT_ALLOWED: 'لا يمكن تأكيد وصول الآلية إلى المحطة في حالتها الحالية.',
  STATION_DESTINATION_INVALID: 'جهة الإرسال غير صالحة — اختر موقع العمل أو الكراج.',
  VEHICLE_NOT_AT_STATION: 'الآلية غير موجودة في المحطة الآن.',
  STATION_WEIGHING_REQUIRED: 'لا خروج من المحطة قبل تسجيل الوزن وإكماله من موظف المحطة.',
  // الصيانة
  MAINTENANCE_FORBIDDEN: 'هذه العملية متاحة لموظف الصيانة فقط.',
  MAINTENANCE_INPUT_INVALID: 'بيانات العطل غير صالحة — تحقق من نوع العطل والأولوية.',
  MAINTENANCE_NOT_READY: 'الحالة غير جاهزة للإرسال — أكمل الإصلاح والموافقة أولاً.',
  MAINTENANCE_DESTINATION_INVALID: 'جهة الإرسال غير صالحة — اختر موقع العمل أو الكراج.',
  MAINTENANCE_CASE_ALREADY_OPEN: 'توجد حالة صيانة مفتوحة لهذه الرحلة بالفعل.',
  MAINTENANCE_READINESS_NOT_APPROVABLE: 'تعذر اعتماد الجاهزية — تأكد أن الحالة «جاهزة» بإنجاز 100% مع تشخيص وملاحظات عمل.',
  MAINTENANCE_READINESS_NOT_READY: 'الصيانة لم تُنهَ بعد — استخدم «إنهاء الصيانة وإدخال البيانات».',
  MAINTENANCE_READINESS_ALREADY_APPROVED: 'الجاهزية معتمدة مسبقاً — حدّث الصفحة.',
  MAINTENANCE_READY_REQUIRES_DIAGNOSIS: 'اكتب التشخيص (وصف العطل) في نموذج إنهاء الصيانة.',
  MAINTENANCE_READY_REQUIRES_WORK_NOTES: 'اكتب ملاحظات العمل المنجز في نموذج إنهاء الصيانة.',
  MAINTENANCE_READY_REQUIRES_TECHNICIAN: 'عيّن فنياً واحداً على الأقل على الحالة في نموذج إنهاء الصيانة.',
  MAINTENANCE_TECHNICIAN_NOT_TECHNICIAN_TITLE: 'هذا الموظف ليس على مسمى وظيفي بتخصص صيانة — يُضبط التخصص من الهيكل التنظيمي في بوابة الموارد البشرية.',
  MAINTENANCE_TECHNICIAN_ALREADY_ASSIGNED: 'هذا الفني معيَّن على الحالة بالفعل.',
  MAINTENANCE_TECHNICIAN_NOT_ASSIGNED: 'هذا الفني غير معيَّن حالياً على الحالة.',
  MAINTENANCE_ITEM_NOT_FOUND: 'المادة غير موجودة في المخزن أو غير فعّالة.',
  MAINTENANCE_INVENTORY_INSUFFICIENT: 'الكمية المطلوبة أكبر من الرصيد المتاح في المخزن.',
  MAINTENANCE_ISSUE_INVALID: 'كمية الصرف يجب أن تكون أكبر من صفر.',
  MAINTENANCE_PART_NOT_ISSUED: 'القطعة ليست بحالة «مصروفة» — لا يمكن تأكيد تركيبها.',
  MAINTENANCE_PART_NOT_RETURNABLE: 'القطعة لا يمكن إعادتها (مركّبة أو أُعيدت مسبقاً).',
  HR_MAINTENANCE_SPECIALTY_INVALID: 'تخصص الصيانة غير صالح.',
  MAINTENANCE_READY_REQUIRES_INSTALLED_PARTS: 'توجد قطع مصروفة لم تُسجَّل كمركَّبة — أكمل تركيبها أو أعدها للمخزن قبل الجاهزية.',
  MAINTENANCE_CASE_NOT_OPEN: 'حالة الصيانة غير مفتوحة (لم تصل بعد أو أُغلقت) — حدّث الصفحة.',
  MAINTENANCE_UPDATE_INVALID: 'بيانات التحديث غير صالحة — تحقق من الحالة ونسبة الإنجاز (0–100).',
  MAINTENANCE_COST_INVALID: 'الكلفة لا يمكن أن تكون سالبة.',
  MAINTENANCE_TECHNICIAN_INVALID: 'الفني المختار غير صالح — اختر فنياً من قائمة الصيانة.',
  MAINTENANCE_DIAGNOSIS_REQUIRED: 'اكتب تشخيصاً واضحاً (3 أحرف على الأقل) لإكمال مرحلة التشخيص.',
  MAINTENANCE_READINESS_APPROVAL_REQUIRED: 'يلزم اعتماد جاهزية الآلية قبل إرسالها من الصيانة.',
  BREAKDOWN_ALREADY_OPEN: 'العطل مسجل على رحلة أخرى — أغلقه أولاً.',
  // الكراج المركزي والانطلاقيات
  GARAGE_VEHICLE_NOT_FOUND: 'الآلية غير موجودة أو مؤرشفة.',
  GARAGE_VEHICLE_IN_FIELD: 'الآلية في الميدان الآن — لا يمكن تغيير سائقها حتى تعود إلى الكراج.',
  GARAGE_SHIFT_IN_FIELD: 'الآلية منطلقة في هذا الشفت الآن — انتظر عودتها قبل تغيير الإسناد.',
  OPS_FLEET_MASTER_FORBIDDEN: 'إدارة قاعدة الآليات والسائقين من صلاحية غرفة العمليات فقط.',
  FLEET_DRIVER_REQUIRED: 'اختر السائق من قائمة الموظفين.',
  FLEET_DRIVER_NOT_FOUND: 'السائق المختار غير موجود في سجل الموظفين.',
  FLEET_DRIVER_TERMINATED: 'هذا الموظف مُنهى الخدمة — لا يمكن إسناده سائقاً.',
  OPS_DRIVER_CHANGE_REASON_REQUIRED: 'سبب تغيير السائق إلزامي (3 أحرف على الأقل).',
  OPS_DRIVER_CHANGE_TOO_OLD: 'لا يمكن تغيير سائق انطلاقة مضى على إغلاقها أكثر من 3 أيام.',
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
  GBS_SECTOR_INVALID: 'المنطقة غير صالحة — اختر منطقة من القاطعين.',
  GBS_PARENT_INVALID: 'القاطع غير صالح — الكرادة أو الزعفرانية فقط.',
  GBS_NOTES_INVALID: 'الملاحظات طويلة جداً — الحد الأقصى 500 حرف.',
  GBS_UPDATE_ALREADY_PENDING: 'لديك طلب تحديث معلق لهذه الحاوية — انتظر قرار غرفة العمليات.',
  GBS_UPDATE_NOT_PENDING: 'هذا الطلب حُسم مسبقاً (اعتماد أو رفض).',
  GBS_STATE_INVALID: 'حالة الطلب غير صالحة.',
  GBS_IMAGE_INVALID: 'ملف الصورة غير صالح — اختر صورة فقط.',
  GBS_UPLOAD_FAILED: 'تعذر رفع الصورة — حاول مرة أخرى.',
  GBS_IMAGE_URL_FAILED: 'تعذر تحميل الصورة — حاول مرة أخرى.',
  // اختصاص مسؤول القسم (00138)
  GBS_OUT_OF_SECTOR:
    'هذه الحاوية خارج مناطقك المسندة إليك — يمكنك رؤية حاويات منطقتك وتحديثها فقط.',
  GBS_JURISDICTION_FAILED: 'تعذر تحميل مناطق اختصاصك — حاول مرة أخرى.',
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
