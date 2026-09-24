/**
 * SDK البصمة (00139): مصادر قابلة للتوصيل + دفتر بصمات موحّد.
 *   · التقني (بوابة التطوير المركزية): تحديث المصدر، اختبار الاتصال، السحب اليدوي، معالجة دفعات ADMS، سجل العمليات.
 *   · البيانات (بوابة الموارد البشرية): دفتر البصمات، ربط PIN، اشتقاق الحضور.
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import { SDKError } from '@lib/errors/SDKError'
import type {
  BiometricDeviceConfig, BiometricDeviceUser, BiometricMode, BiometricPullLog, BiometricPullResult,
  BiometricPunch, BiometricPunchFilters, BiometricTestResult,
} from '@features/integrations/types'

const DEVICE_COLUMNS = 'id, serial_number, name, branch_id, location_hint, is_active, last_seen_at, firmware, mode, config, timezone_offset, bridge_key_prefix, bridge_last_seen_at, bridge_last_error'

/** رسائل عربية ثابتة لرموز الخطأ المرمّزة (قاعدة البيانات + Edge Function + المزوّدون) */
export const BIOMETRIC_ERROR_MESSAGES: Record<string, string> = {
  BIO_FORBIDDEN: 'ليست لديك صلاحية هذا الإجراء',
  BIO_DEVICE_NOT_FOUND: 'المصدر غير موجود',
  BIO_DEVICE_INACTIVE: 'المصدر معطّل — فعّله أولاً',
  BIO_DEVICE_REQUIRED: 'اختر المصدر أولاً',
  BIO_MODE_NOT_PULLABLE: 'هذا المصدر بنمط الدفع (ADMS) — الجهاز يرسل بياناته بنفسه ولا يُسحب منه',
  BIO_CONFIG_BASE_URL: 'رابط المصدر غير صالح (يجب أن يبدأ بـ http أو https)',
  BIO_CONFIG_MAPPING: 'خريطة الحقول ناقصة: يلزم حقل PIN وحقل الوقت (أو التاريخ + الوقت)',
  BIO_WINDOW_INVALID: 'نافذة السحب غير صالحة (البداية يجب أن تسبق النهاية)',
  BIO_WINDOW_TOO_LARGE: 'نافذة السحب أكبر من 92 يوماً — قسّمها',
  BIO_SOURCE_UNREACHABLE: 'تعذر الوصول إلى المصدر (الشبكة/الرابط/المهلة)',
  BIO_SOURCE_UNAUTHORIZED: 'المصدر رفض الاعتماد (مفتاح API/كلمة المرور)',
  BIO_SOURCE_HTTP: 'المصدر أعاد خطأ HTTP',
  BIO_RESPONSE_SHAPE: 'شكل استجابة المصدر غير معروف — راجع خريطة الحقول أو المسار',
  BIO_RECORD_PIN: 'سجل بلا رقم بصمة (PIN)',
  BIO_RECORD_TIME: 'سجل بوقت غير صالح',
  BIO_RECORD_INVALID: 'سجل غير صالح في استجابة المصدر',
  BIO_IMPORT_INVALID: 'دفعة الاستيراد غير صالحة',
  BIO_IMPORT_FAILED: 'فشل إدراج البصمات في الدفتر',
  BIO_PULL_FAILED: 'فشل السحب لسبب غير متوقع',
  BIO_PIN_INVALID: 'رقم البصمة فارغ',
  BIO_PIN_TAKEN: 'رقم البصمة مرتبط بموظف آخر',
  BIO_EMPLOYEE_NOT_FOUND: 'الموظف غير موجود',
  BIO_DATE_INVALID: 'التاريخ مطلوب',
  biometric_devices_tz_check: 'منطقة الوقت يجب أن تكون بصيغة ±HH:MM مثل +03:00',
  BIO_MODE_NOT_BRIDGE: 'توليد مفتاح الجسر متاح فقط لمصدر بنمط «وكيل الشبكة الداخلية»',
  BRIDGE_UNAUTHORIZED: 'المنصة رفضت مفتاح الجسر — ولّد مفتاحاً جديداً وحدّث config.json',
  UNAUTHORIZED: 'انتهت الجلسة — سجّل الدخول مجدداً',
}

export function biometricErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error ?? '')
  const code = Object.keys(BIOMETRIC_ERROR_MESSAGES).find((k) => text.includes(k))
  const label = code ? BIOMETRIC_ERROR_MESSAGES[code] : undefined
  if (!code || !label) return text || 'خطأ غير معروف'
  const detail = /BIO_[A-Z_]+:\s*(.+)$/.exec(text)?.[1]
  return detail && code.startsWith('BIO_SOURCE') ? `${label} (${detail})` : label
}

interface PullResponse extends Partial<BiometricPullResult> { error?: string; detail?: string }

async function invokePull<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<PullResponse & T>('biometric-pull', { body })
  if (error) {
    // Edge Function ترد بجسم JSON فيه رمز الخطأ حتى مع حالات 4xx/5xx
    const ctx = (error as { context?: Response }).context
    let code = error.message
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = (await ctx.json()) as PullResponse
        code = parsed.detail ? `${parsed.error}: ${parsed.detail}` : (parsed.error ?? code)
      } catch { /* الجسم ليس JSON */ }
    }
    throw new SDKError(biometricErrorMessage(code), 'BIOMETRIC_PULL', error)
  }
  if (!data) throw new SDKError('لا استجابة من خدمة السحب', 'BIOMETRIC_PULL')
  if (data.error) throw new SDKError(biometricErrorMessage(data.detail ? `${data.error}: ${data.detail}` : data.error), 'BIOMETRIC_PULL')
  return data
}

export const biometric = {
  // ─────────── تقني (IT) ───────────
  /** تحديث نمط/تهيئة/اسم المصدر */
  async updateDevice(id: string, patch: { name?: string; mode?: BiometricMode; config?: BiometricDeviceConfig; location_hint?: string | null; timezone_offset?: string }) {
    return sdkGuard(
      supabase.from('biometric_devices').update(patch as never).eq('id', id).select(DEVICE_COLUMNS).single(),
    )
  },

  /** 00141 · توليد/تدوير مفتاح وكيل الجسر — يُعاد المفتاح الصريح مرة واحدة فقط */
  async rotateBridgeKey(deviceId: string): Promise<string> {
    return (await sdkGuard(supabase.rpc('biometric_bridge_rotate_key', { p_device_id: deviceId } as never))) as string
  },

  /** اختبار الاتصال بالمصدر دون إدراج */
  testSource(deviceId: string, from?: string, to?: string): Promise<BiometricTestResult> {
    return invokePull<BiometricTestResult>({ action: 'test', device_id: deviceId, from, to })
  },

  /** السحب اليدوي «اسحب الآن» */
  pull(deviceId: string, from?: string, to?: string): Promise<BiometricPullResult> {
    return invokePull<BiometricPullResult>({ action: 'pull', device_id: deviceId, from, to })
  },

  /** استيراد مباشر لدفعة موحّدة (لصق/ملف) — يمر بنفس RPC */
  async importPunches(deviceId: string, logs: Array<{ pin: string; at: string; direction?: string; name?: string }>, method?: string): Promise<BiometricPullResult> {
    const rows = (await sdkGuard(
      supabase.rpc('biometric_import_punches', { p_device_id: deviceId, p_logs: logs, p_method: method ?? null } as never),
    )) as Array<Omit<BiometricPullResult, 'ok'>>
    const r = rows[0] ?? { received: 0, inserted: 0, duplicates: 0, unmatched: 0 }
    return { ok: true, ...r }
  },

  /** معالجة دفعات ADMS الخام المتراكمة إلى الدفتر */
  async processPushes(limit = 500): Promise<number> {
    return (await sdkGuard(supabase.rpc('biometric_process_pushes', { p_limit: limit } as never))) as number
  },

  /** سجل عمليات السحب */
  async listPulls(deviceId?: string | null, limit = 50): Promise<BiometricPullLog[]> {
    return (await sdkGuard(
      supabase.rpc('biometric_pulls_list', { p_device_id: deviceId ?? null, p_limit: limit } as never),
    )) as BiometricPullLog[]
  },

  // ─────────── بيانات (HR) ───────────
  async listPunches(f: BiometricPunchFilters = {}): Promise<BiometricPunch[]> {
    return (await sdkGuard(
      supabase.rpc('biometric_punches_list', {
        p_from: f.from ?? null, p_to: f.to ?? null, p_pin: f.pin?.trim() || null,
        p_device_id: f.deviceId ?? null, p_unmatched_only: f.unmatchedOnly ?? false, p_limit: f.limit ?? 300,
      } as never),
    )) as BiometricPunch[]
  },

  /** مستخدمو الأجهزة (PIN ↔ الاسم كما سجّله الجهاز) مع اقتراح الموظف المطابق */
  async listDeviceUsers(search?: string, limit = 100): Promise<BiometricDeviceUser[]> {
    return (await sdkGuard(
      supabase.rpc('biometric_device_users_list', { p_search: search?.trim() || null, p_limit: limit } as never),
    )) as BiometricDeviceUser[]
  },

  async linkPin(pin: string, employeeId: string): Promise<void> {
    await sdkVoid(supabase.rpc('biometric_link_pin', { p_pin: pin.trim(), p_employee_id: employeeId } as never))
  },

  /** اشتقاق الحضور اليومي من الدفتر — يعيد عدد الموظفين المحدَّثين */
  async deriveAttendance(date: string): Promise<number> {
    return (await sdkGuard(supabase.rpc('biometric_attendance_derive', { p_date: date } as never))) as number
  },
}
