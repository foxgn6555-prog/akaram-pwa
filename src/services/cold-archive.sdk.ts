/**
 * SDK الأرشيف البارد (00314/00315) — IT فقط.
 *  البيانات النصية تبقى؛ الملفات القديمة تُسحب إلى قرص خارجي وتُتحقَّق بالبصمات ثم تُحذف من السحابة.
 */
import { sdkGuard, supabase } from './client'

export type ColdPackageStatus = 'ready' | 'verified' | 'purging' | 'purged' | 'cancelled'
export const COLD_STATUS_LABEL: Record<ColdPackageStatus, string> = {
  ready: 'جاهزة للتنزيل', verified: 'متحقَّق منها', purging: 'جارٍ الحذف', purged: 'حُذفت من المنصة', cancelled: 'ملغاة',
}

export interface ColdSourceSetting { label: string; bucket: string; sensitive: boolean; description: string; enabled: boolean }
export interface ColdProtectionSetting { label: string; on: boolean }
export interface ColdSettings {
  required_copies: number; grace_days: number
  sources: Record<string, ColdSourceSetting>
  protections: Record<string, ColdProtectionSetting>
  updated_at: string | null
}
export interface ColdPreviewSource { source_key: string; files: number; bytes: number; protected: number; already_archived: number; reasons: string[] }
export interface ColdPreview {
  period_from: string; period_to: string; sources: ColdPreviewSource[]
  totals: { files: number; bytes: number; protected: number; already_archived: number }
}
export interface ColdCopy { disk_label: string; ok_count: number; verified_at: string; verified_by_name: string | null }
export interface ColdPackage {
  id: string; code: string; period_from: string; period_to: string; status: ColdPackageStatus; note: string | null
  file_count: number; total_bytes: number; downloaded_count: number; verified_copies: number; required_copies: number; grace_days: number
  purge_available_at: string | null; purged_count: number; created_by: string | null; created_by_name: string | null; created_at: string
  verified_at: string | null; purge_started_at: string | null; purged_at: string | null; cancelled_at: string | null
  copies: ColdCopy[]; by_source: Array<{ source_key: string; files: number; bytes: number }>; can_purge: boolean
  events?: Array<{ action: string; details: Record<string, unknown> | null; actor_name: string | null; at: string }>
}

export const COLD_ERROR_MESSAGES: Record<string, string> = {
  IT_FORBIDDEN: 'هذه الوحدة لبوابة التطوير المركزية فقط',
  COLD_ARCHIVE_INPUT_INVALID: 'قيمة غير صالحة في الإدخال',
  COLD_ARCHIVE_PERIOD_NOT_CLOSED: 'لا يمكن أرشفة فترة لم تنتهِ بعد — اختر تاريخ نهاية قبل اليوم',
  COLD_ARCHIVE_EMPTY: 'لا توجد ملفات قابلة للأرشفة في هذه الفترة (كلها محمية أو مؤرشفة سابقاً)',
  COLD_ARCHIVE_NOT_FOUND: 'الحزمة غير موجودة',
  COLD_ARCHIVE_STATE_INVALID: 'حالة الحزمة لا تسمح بهذا الإجراء',
  COLD_ARCHIVE_REASON_REQUIRED: 'سبب الإلغاء مطلوب',
  COLD_ARCHIVE_NOT_FULLY_DOWNLOADED: 'لم يكتمل تنزيل كل ملفات الحزمة بعد',
  COLD_ARCHIVE_VERIFY_MISMATCH: 'بصمات القرص لا تطابق كل الملفات — أعد التنزيل ثم التحقق',
  COLD_ARCHIVE_NOT_VERIFIED: 'الحزمة غير متحقَّق منها بعد',
  COLD_ARCHIVE_COPIES_INSUFFICIENT: 'عدد النسخ المتحقَّق منها أقل من المطلوب',
  COLD_ARCHIVE_GRACE_ACTIVE: 'مهلة الأمان لم تنتهِ بعد',
}
export function coldErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error ?? '')
  const code = Object.keys(COLD_ERROR_MESSAGES).find((k) => text.includes(k))
  return (code && COLD_ERROR_MESSAGES[code]) || text || 'خطأ غير معروف'
}

const rpc = <T,>(fn: string, args: Record<string, unknown> = {}) => sdkGuard(supabase.rpc(fn, args as never)) as Promise<T>

export const coldArchive = {
  settings: () => rpc<ColdSettings>('cold_archive_settings_get'),
  saveSettings: (s: { required_copies: number; grace_days: number; sources: Record<string, { enabled: boolean }>; protections: Record<string, boolean> }) =>
    rpc<ColdSettings>('cold_archive_settings_set', { p_required_copies: s.required_copies, p_grace_days: s.grace_days, p_sources: s.sources, p_protections: s.protections }),
  preview: (from: string, to: string) => rpc<ColdPreview>('cold_archive_preview', { p_from: from, p_to: to }),
  createPackage: (from: string, to: string, note?: string | null) => rpc<ColdPackage>('cold_archive_package_create', { p_from: from, p_to: to, p_note: note ?? null }),
  packages: async () => (await rpc<ColdPackage[] | null>('cold_archive_packages_list')) ?? [],
  package: (id: string) => rpc<ColdPackage>('cold_archive_package_get', { p_id: id }),
  cancel: (id: string, reason: string) => rpc<ColdPackage>('cold_archive_package_cancel', { p_id: id, p_reason: reason }),
}

/** حجم مقروء — بالعربية مع أرقام لاتينية */
export function formatBytes(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  if (v < 1024) return `${v} بايت`
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(0)} KB`
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`
  return `${(v / 1024 ** 3).toFixed(2)} GB`
}
