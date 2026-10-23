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
  /** موافقة ثنائية اختيارية: حساب IT يطلب الحذف ويوافق حساب IT آخر (00271) */
  purge_approval: boolean
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
  purge_approval_required: boolean; purge_requested_at: string | null; purge_requested_by_name: string | null; purge_requested_by_me: boolean
  purge_approved_at: string | null; purge_approved_by_name: string | null
  /** 00338: السلسلة المضبوطة من التطوير المركزية (null = لا سلسلة ⇒ السلوك الثنائي القديم) */
  purge_chain_id: string | null
  purge_chain: { chain_id: string; current_step: number | null; total_steps: number; steps: Array<{ step_no: number; label: string; status: string; decided_by: string | null; decided_at: string | null; note: string | null; approvers: string | null }> } | null
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
  COLD_ARCHIVE_APPROVAL_REQUIRED: 'الحذف يحتاج موافقة أولاً (حساب IT آخر أو سلسلة الموافقات)',
  COLD_ARCHIVE_CHAIN_ACTIVE: 'هذا الطلب يمرّ بسلسلة موافقات — القرار من صفحة «طلبات الموافقة» لا من هنا',
  COLD_ARCHIVE_ALREADY_DECIDED: 'سبق البتّ في طلب الحذف هذا',
  COLD_ARCHIVE_NOT_REQUESTED: 'لم يُطلب حذف هذه الحزمة بعد',
  COLD_ARCHIVE_SAME_APPROVER: 'لا يمكن لطالب الحذف أن يوافق على طلبه — يلزم حساب IT آخر',
}
export function coldErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error ?? '')
  const code = Object.keys(COLD_ERROR_MESSAGES).find((k) => text.includes(k))
  return (code && COLD_ERROR_MESSAGES[code]) || text || 'خطأ غير معروف'
}

const rpc = <T,>(fn: string, args: Record<string, unknown> = {}) => sdkGuard(supabase.rpc(fn, args as never)) as Promise<T>

export const coldArchive = {
  settings: () => rpc<ColdSettings>('cold_archive_settings_get'),
  saveSettings: (s: { required_copies: number; grace_days: number; sources: Record<string, { enabled: boolean }>; protections: Record<string, boolean>; purge_approval: boolean }) =>
    rpc<ColdSettings>('cold_archive_settings_set', { p_required_copies: s.required_copies, p_grace_days: s.grace_days, p_sources: s.sources, p_protections: s.protections, p_purge_approval: s.purge_approval }),
  preview: (from: string, to: string) => rpc<ColdPreview>('cold_archive_preview', { p_from: from, p_to: to }),
  createPackage: (from: string, to: string, note?: string | null) => rpc<ColdPackage>('cold_archive_package_create', { p_from: from, p_to: to, p_note: note ?? null }),
  packages: async () => (await rpc<ColdPackage[] | null>('cold_archive_packages_list')) ?? [],
  package: (id: string) => rpc<ColdPackage>('cold_archive_package_get', { p_id: id }),
  cancel: (id: string, reason: string) => rpc<ColdPackage>('cold_archive_package_cancel', { p_id: id, p_reason: reason }),
  purgeRequest: (id: string) => rpc<ColdPackage>('cold_archive_purge_request', { p_package: id }),
  purgeApprove: (id: string) => rpc<ColdPackage>('cold_archive_purge_approve', { p_package: id }),
  /** الحذف الفعلي: يقفل الحزمة ثم يحذف الملفات من التخزين دفعات 100 ويؤكد كل دفعة. قابل للاستئناف. */
  purgeRun: async (id: string, onProgress?: (done: number, total: number) => void): Promise<ColdPackage> => {
    let pkg = await rpc<ColdPackage>('cold_archive_purge_begin', { p_package: id })
    const total = pkg.file_count; let done = pkg.purged_count; let after = 0
    for (;;) {
      const rows = (await rpc<ColdItem[] | null>('cold_archive_items_list', { p_package: id, p_after: after, p_limit: 500 })) ?? []
      if (rows.length === 0) break
      after = rows[rows.length - 1]?.id ?? after
      const pending = rows.filter((r) => r.status === 'downloaded')
      const byBucket = new Map<string, ColdItem[]>()
      for (const r of pending) byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), r])
      for (const [bucket, items] of byBucket) {
        for (let i = 0; i < items.length; i += 100) {
          const batch = items.slice(i, i + 100)
          const { data, error } = await supabase.storage.from(bucket).remove(batch.map((b) => b.storage_path))
          if (error) throw new Error(`فشل حذف ملفات من ${bucket}: ${error.message}`)
          const removedSet = new Set((data ?? []).map((o: { name: string }) => o.name))
          // التخزين يعيد ما حُذف فعلاً. ما لم يُعَد: يُعدّ محذوفاً فقط إن ثبت أنه غير موجود أصلاً — أي عائق آخر (صلاحية/شبكة) يبقيه معلّقاً
          const removed: ColdItem[] = []
          for (const b of batch) {
            if (removedSet.has(b.storage_path)) { removed.push(b); continue }
            const { data: ex, error: exErr } = await supabase.storage.from(bucket).exists(b.storage_path)
            if (!exErr && ex === false) removed.push(b)
          }
          pkg = await rpc<ColdPackage>('cold_archive_purge_confirm', { p_package: id, p_removed: removed.map((b) => ({ bucket: b.bucket, path: b.storage_path })) })
          done = pkg.purged_count; onProgress?.(done, total)
        }
      }
      if (rows.length < 500) break
    }
    return pkg
  },
}
/** معلومات ملف حُذف من المنصة بعد أرشفته خارجياً — متاحة لكل مستخدم مسجّل (المسار وحده لا يحمل بيانات) */
export interface ArchivedFileInfo { package_code: string; purged_at: string; period_from: string; period_to: string; disks: string[] }
/** أين هذا الملف الآن؟ يعيد فقط المسارات المحذوفة فعلاً (status = purged) */
export const coldArchiveLookup = async (bucket: string, paths: string[]): Promise<Record<string, ArchivedFileInfo>> => {
  if (paths.length === 0) return {}
  return (await rpc<Record<string, ArchivedFileInfo> | null>('cold_archive_lookup', { p_bucket: bucket, p_paths: paths })) ?? {}
}
export interface ColdItem { id: number; source_key: string; record_id: string; record_date: string; bucket: string; storage_path: string; size_bytes: number | null; sha256: string | null; status: 'listed' | 'downloaded' | 'purged' | 'missing' }

/** حجم مقروء — بالعربية مع أرقام لاتينية */
export function formatBytes(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  if (v < 1024) return `${v} بايت`
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(0)} KB`
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`
  return `${(v / 1024 ** 3).toFixed(2)} GB`
}
