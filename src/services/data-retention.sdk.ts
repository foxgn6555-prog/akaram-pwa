/**
 * SDK سياسات الاحتفاظ بالبيانات النصية (00324/00325) — IT فقط.
 *  النظام ينشئ طلب حذف عند انقضاء المدة ويبلّغ IT؛ لا يُحذف شيء إلا بعد (تصدير مُثبَت إن طُلب) + تأكيد يدوي.
 */
import { sdkGuard, supabase } from './client'

export type RetentionRequestStatus = 'pending' | 'exported' | 'confirmed' | 'deleting' | 'done' | 'cancelled'
export const RETENTION_STATUS_LABEL: Record<RetentionRequestStatus, string> = {
  pending: 'بانتظار قراركم', exported: 'صُدِّر — بانتظار التأكيد', confirmed: 'مؤكَّد — جاهز للحذف', deleting: 'جارٍ الحذف', done: 'اكتمل', cancelled: 'ملغى',
}
export const RETENTION_OPEN: RetentionRequestStatus[] = ['pending', 'exported', 'confirmed', 'deleting']

export interface RetentionEvent { action: string; details: Record<string, unknown> | null; actor_name: string | null; at: string }
export interface RetentionRequest {
  id: string; data_key: string; label: string; cutoff: string; status: RetentionRequestStatus
  rows_total: number; rows_locked: number; rows_deletable: number; export_required: boolean
  rows_exported: number | null; export_sha256: string | null; export_label: string | null; exported_by_name: string | null; exported_at: string | null
  confirmed_by_name: string | null; confirmed_at: string | null; rows_deleted: number; finished_at: string | null; created_at: string; updated_at: string
  can_export: boolean; can_confirm: boolean; events: RetentionEvent[]
}
export interface RetentionPolicy {
  data_key: string; label: string; description: string; safety_lock: string
  enabled: boolean; retention_months: number; export_required: boolean
  updated_at: string | null; updated_by_name: string | null; open_request: RetentionRequest | null
}

export const RETENTION_ERROR_MESSAGES: Record<string, string> = {
  IT_FORBIDDEN: 'هذه الوحدة لبوابة التطوير المركزية فقط',
  RETENTION_UNKNOWN_KEY: 'نوع بيانات غير معروف',
  RETENTION_INPUT_INVALID: 'قيمة غير صالحة — المدة بين 1 و120 شهراً',
  RETENTION_NOT_FOUND: 'الطلب غير موجود',
  RETENTION_BAD_STATE: 'حالة الطلب لا تسمح بهذا الإجراء',
  RETENTION_EXPORT_REQUIRED: 'هذا النوع يتطلب تصديراً مُثبَتاً قبل التأكيد',
  RETENTION_EXPORT_COUNT_MISMATCH: 'عدد الصفوف المصدَّرة لا يساوي القابل للحذف — أعد التصدير',
  RETENTION_EXPORT_STALE: 'تغيّرت البيانات بعد التصدير (وصلت صفوف قديمة جديدة) — أعد التصدير ثم أكّد',
  RETENTION_POLICY_DISABLED: 'السياسة معطّلة — فعّلها أولاً',
}
export function retentionErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error ?? '')
  const code = Object.keys(RETENTION_ERROR_MESSAGES).find((k) => text.includes(k))
  return (code && RETENTION_ERROR_MESSAGES[code]) || text || 'خطأ غير معروف'
}

const rpc = <T,>(fn: string, args: Record<string, unknown> = {}) => sdkGuard(supabase.rpc(fn, args as never)) as Promise<T>

export const dataRetention = {
  settings: async () => (await rpc<RetentionPolicy[] | null>('data_retention_settings_get')) ?? [],
  setPolicy: (p: { data_key: string; enabled: boolean; retention_months: number; export_required: boolean }) =>
    rpc<RetentionPolicy[]>('data_retention_policy_set', { p_key: p.data_key, p_enabled: p.enabled, p_months: p.retention_months, p_export_required: p.export_required }),
  scanNow: () => rpc<{ created: number; settings: RetentionPolicy[] }>('data_retention_scan_now'),
  requests: async (limit = 50) => (await rpc<RetentionRequest[] | null>('data_retention_requests_list', { p_limit: limit })) ?? [],
  exportRecorded: (id: string, rows: number, sha256: string, label: string) =>
    rpc<RetentionRequest>('data_retention_export_recorded', { p_request: id, p_rows: rows, p_sha256: sha256, p_label: label }),
  confirm: (id: string) => rpc<RetentionRequest>('data_retention_confirm', { p_request: id }),
  deleteBatch: (id: string, limit = 5000) => rpc<RetentionRequest>('data_retention_delete_batch', { p_request: id, p_limit: limit }),
  cancel: (id: string) => rpc<RetentionRequest>('data_retention_cancel', { p_request: id }),
  /** 00327: تنفيذ الحذف بدفعات حتى الاكتمال أو الإيقاف. كل دفعة معاملة مستقلة ⇒ الإيقاف لا يفقد شيئاً ويُستأنف لاحقاً. */
  deleteRun: async (id: string, opts: { batch?: number; onProgress?: (r: RetentionRequest) => void; signal?: AbortSignal } = {}) => {
    let r = await dataRetention.deleteBatch(id, opts.batch ?? 5000)
    opts.onProgress?.(r)
    while (r.status === 'deleting' && !opts.signal?.aborted) {
      r = await dataRetention.deleteBatch(id, opts.batch ?? 5000)
      opts.onProgress?.(r)
    }
    return r
  },
}
