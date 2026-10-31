/**
 * SDK «التصفير» (00398): تصفير بيانات المنصة بالفئات — معاينة الأعداد، إغلاق الاعتماديات، الطلب بكلمة سر «تصفير»،
 * سلسلة «تصفير المنصة»، الاعتماد من صفحة التفاصيل بكلمة سر «اعتماد تصفير»، الرفض/الإلغاء، حذف ملفات التخزين من المتصفح، السجل.
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import { gpsWarehouse } from './gps-warehouse.sdk'

export type PlatformResetStatus = 'pending_approval' | 'approved' | 'executing' | 'done' | 'rejected' | 'cancelled' | 'failed'

export interface PlatformResetCategory {
  key: string; label: string; grp: string; sort: number; tables: string[]; buckets: string[]
  rows: number | null; files: number | null; protected_users: number | null
}
export interface PlatformResetCounts {
  categories: PlatformResetCategory[]
  pending: { id: string; status: PlatformResetStatus; created_at: string } | null
  generated_at: string
}
export interface PlatformResetClosure { categories: string[]; added: string[] }
export interface PlatformResetResult {
  tables: number; rows_deleted: number; users_deleted: number; protected_users: number; passes: number
  per_table: Record<string, number>; duration_ms: number; buckets: string[]; warehouse_wipe: boolean
}
export interface PlatformResetDetailCategory { key: string; label: string; grp: string; tables: string[]; buckets: string[]; rows: number | null; files: number | null; auto_added: boolean }
export interface PlatformResetTimelineStep { step_no: number; label: string; status: string; decided_by: string | null; decided_at: string | null; note: string | null }
export interface PlatformResetDetail {
  id: string; status: PlatformResetStatus; status_label: string; categories: PlatformResetDetailCategory[]
  total_rows: number; total_files: number; requested_by: string; requested_by_name: string | null
  created_at: string; approved_at: string | null; executed_at: string | null; result: PlatformResetResult | null
  rejected_note: string | null; storage_buckets: string[]; storage_done_at: string | null; storage_deleted: number
  via_chain: boolean; timeline: PlatformResetTimelineStep[]; can_approve: boolean; includes_accounts: boolean; warehouse_done_at?: string | null; can_cleanup?: boolean
}
export interface PlatformResetListRow {
  id: string; status: PlatformResetStatus; status_label: string; categories: string[]; categories_count: number
  requested_by_name: string | null; created_at: string; executed_at: string | null; rows_deleted: number | null; users_deleted: number | null
  rejected_note: string | null; via_chain: boolean; storage_pending: boolean; current_step: string | null
}
export interface PlatformResetRequestResult { id: string; status: PlatformResetStatus; via_chain: boolean; categories: string[]; added: string[]; result?: PlatformResetResult }
export interface PlatformResetApproveResult { id: string; status: PlatformResetStatus; final: boolean; result?: PlatformResetResult }

export const PLATFORM_RESET_ENTRY_PASSWORD = 'تصفير'
export const PLATFORM_RESET_APPROVE_PASSWORD = 'اعتماد تصفير'

export const PLATFORM_RESET_ERROR_MESSAGES: Record<string, string> = {
  RESET_PASSWORD_WRONG: 'كلمة السر غير صحيحة — اكتب «تصفير»',
  RESET_APPROVE_PASSWORD_WRONG: 'كلمة السر غير صحيحة — اكتب «اعتماد تصفير»',
  RESET_APPROVE_PASSWORD_REQUIRED: 'اعتماد التصفير لا يتم من زر المهمة — افتح «إظهار تفاصيل التصفير» واعتمد بكلمة السر',
  RESET_NOTHING_SELECTED: 'اختر فئة واحدة على الأقل',
  RESET_CATEGORY_INVALID: 'فئة غير معروفة',
  RESET_ALREADY_PENDING: 'يوجد طلب تصفير معلّق — انتظر اكتماله أو ألغِه أولاً',
  RESET_NOT_FOUND: 'طلب التصفير غير موجود',
  RESET_NOT_PENDING: 'الطلب لم يعد معلّقاً',
  RESET_NOT_APPROVED: 'الطلب غير معتمد',
  RESET_NOT_EXECUTED: 'لا يمكن حذف الملفات قبل تنفيذ التصفير',
  RESET_WAREHOUSE_PENDING: 'يوجد طلب تصفير سابق للمستودع لم يكتمل — افتح تفاصيله وأكمل المسح أولاً',
  RESET_WAREHOUSE_COUNTS_UNAVAILABLE: 'تعذر الحصول على أعداد مستودع GPS — تحقق من اتصال المشروع الثاني ثم أعد المحاولة',
  GPS_WAREHOUSE_RESET_WAITING_FOR_PULL: 'السحب السابق لم ينته بعد — أعد محاولة المسح بعد قليل',
  GPS_WAREHOUSE_RESET_RETRY_REQUIRED: 'ما زالت ملفات المستودع قيد الحذف — أعد المحاولة لمتابعة الدفعات',
  GPS_WAREHOUSE_RESET_STORAGE_INCOMPLETE: 'لم تُحذف كل الملفات — أعد محاولة المسح',
  GPS_WAREHOUSE_RESET_NOT_AUTHORIZED: 'الطلب غير معتمد للمستودع أو أن مسحه قيد التنفيذ',
  RESET_FORBIDDEN: 'لا صلاحية لعرض هذا الطلب',
  RESET_DEPENDENCY: 'جداول خارج الاختيار تعتمد على المختارة — أضف الفئات المطلوبة',
  RESET_TABLE_UNMAPPED: 'جدول غير مصنَّف في كتالوج التصفير — راجع التطوير',
  RESET_ACCOUNTS_IN_USE: 'بيانات باقية مرتبطة بالحسابات — اختر فئاتها',
  RESET_CYCLE: 'تعذر الحذف بسبب اعتماديات دائرية — راجع التطوير',
  IT_FORBIDDEN: 'هذه الوحدة لحسابات التطوير المركزية فقط',
  HR_FORBIDDEN: 'لست المعتمِد الحالي لهذا الطلب',
  HR_REASON_REQUIRED: 'سبب الرفض إلزامي (3 أحرف على الأقل)',
  APPROVAL_NO_PENDING_STEP: 'لا خطوة معلّقة في هذا الطلب',
  PERMISSION_DENIED: 'لا تملك صلاحية «تنفيذ» على وحدة التصفير',
}

export const platformReset = {
  counts: async () => {
    // تحديث العدد عبر الجسر؛ عند تعذر الاتصال تُعرض الأعداد كغير متاحة، ولا يُسمح بطلب تصفير المستودع.
    try { await gpsWarehouse.run('ping') } catch { /* لا نمنع معاينة الفئات المحلية */ }
    return (await sdkGuard(supabase.rpc('platform_reset_counts'))) as PlatformResetCounts
  },
  closure: async (categories: string[]) => (await sdkGuard(supabase.rpc('platform_reset_closure', { p_categories: categories }))) as PlatformResetClosure,
  request: async (categories: string[], password: string) =>
    (await sdkGuard(supabase.rpc('platform_reset_request', { p_categories: categories, p_password: password }))) as PlatformResetRequestResult,
  cancel: async (id: string) => sdkVoid(supabase.rpc('platform_reset_cancel', { p_id: id })),
  approve: async (id: string, password: string) =>
    (await sdkGuard(supabase.rpc('platform_reset_approve', { p_id: id, p_password: password }))) as PlatformResetApproveResult,
  reject: async (id: string, note: string) => sdkVoid(supabase.rpc('approval_decide_request', { p_kind: 'platform_reset', p_request: id, p_approve: false, p_note: note })),
  detail: async (id: string) => (await sdkGuard(supabase.rpc('platform_reset_detail', { p_id: id }))) as PlatformResetDetail,
  list: async (limit = 50) => (await sdkGuard(supabase.rpc('platform_reset_list', { p_limit: limit }))) as PlatformResetListRow[],
  storageObjects: async (id: string, limit = 500) =>
    (await sdkGuard(supabase.rpc('platform_reset_storage_objects', { p_id: id, p_limit: limit }))) as Array<{ bucket_id: string; name: string }>,
  storageFinish: async (id: string, deleted: number) =>
    (await sdkGuard(supabase.rpc('platform_reset_storage_finish', { p_id: id, p_deleted: deleted }))) as { id: string; remaining: number; done: boolean },
  /** حذف ملفات الحاويات المرتبطة بالطلب من المتصفح على دفعات (السياسة المؤقتة تسمح لحساب IT أثناء تصفير جارٍ) */
  wipeStorage: async (id: string, onProgress?: (deleted: number) => void): Promise<{ deleted: number; remaining: number }> => {
    let deleted = 0
    for (let guard = 0; guard < 400; guard++) {
      const objs = await platformReset.storageObjects(id, 500)
      if (objs.length === 0) {
        const fin = await platformReset.storageFinish(id, 0)
        return { deleted, remaining: fin.remaining }
      }
      const byBucket = new Map<string, string[]>()
      for (const o of objs) byBucket.set(o.bucket_id, [...(byBucket.get(o.bucket_id) ?? []), o.name])
      for (const [bucket, names] of byBucket) {
        const { data, error } = await supabase.storage.from(bucket).remove(names)
        if (error) throw new Error(`STORAGE_REMOVE_FAILED: ${bucket} — ${error.message}`)
        const actual = data?.length ?? 0
        deleted += actual
        const fin = await platformReset.storageFinish(id, actual)
        onProgress?.(deleted)
        if (actual < names.length && !fin.done) throw new Error(`STORAGE_REMOVE_INCOMPLETE: ${bucket}`)
        if (fin.done) return { deleted, remaining: 0 }
      }
    }
    const fin = await platformReset.storageFinish(id, 0)
    return { deleted, remaining: fin.remaining }
  },
  /** مسح مستودع GPS (المشروع الثاني) عبر دالة الحافة — يُستدعى عندما تشمل النتيجة بؤر التوقف */
  wipeWarehouse: async (id: string): Promise<{ ok: boolean; error?: string; result?: Record<string, unknown> }> => {
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; result?: Record<string, unknown> }>('gps-warehouse', { body: { action: 'wipe', reset_id: id } })
    if (error) {
      const context = (error as { context?: Response }).context
      if (context && typeof context.json === 'function') {
        try { const body = (await context.json()) as { error?: string }; if (body.error) return { ok: false, error: body.error } } catch { /* استخدم رسالة الشبكة */ }
      }
      return { ok: false, error: error.message }
    }
    return data ?? { ok: false, error: 'EMPTY' }
  },
}
