/** خطافات «طلب تعديل بيانات الحضور» (00397) — غرفة العمليات / الموارد البشرية / المعاون / المدير التنفيذي */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hrKeys } from '@lib/query-keys/hr.keys'
import { useUiStore } from '@stores/ui.store'
import { attendanceEdits, attendanceEditErrorMessage, type AttendanceEditDraft, type AttendanceEditFilters, type AttendanceEditMode } from '@sdk/attendance-edits.sdk'

export * from '@sdk/attendance-edits.sdk'

export const attendanceEditKeys = {
  all: ['attendance-edits'] as const,
  list: (f: AttendanceEditFilters) => [...attendanceEditKeys.all, 'list', f] as const,
  detail: (id: string) => [...attendanceEditKeys.all, 'detail', id] as const,
  stats: (m: string | null) => [...attendanceEditKeys.all, 'stats', m ?? ''] as const,
}

function useToast() {
  const addToast = useUiStore((s) => s.addToast)
  return {
    ok: (message: string) => addToast({ type: 'success', message }),
    err: (e: unknown) => addToast({ type: 'error', message: attendanceEditErrorMessage(e) }),
  }
}
function useInvalidateAll() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: attendanceEditKeys.all })
    void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'attendance'] })
    void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'audit'] })
    void qc.invalidateQueries({ queryKey: ['approvals'] })
  }
}

export function useAttendanceEditList(f: AttendanceEditFilters, enabled = true) {
  return useQuery({ queryKey: attendanceEditKeys.list(f), queryFn: () => attendanceEdits.list(f), enabled, staleTime: 10_000 })
}
export function useAttendanceEditDetail(id: string | null) {
  return useQuery({ queryKey: attendanceEditKeys.detail(id ?? ''), queryFn: () => attendanceEdits.detail(id!), enabled: !!id })
}
export function useAttendanceEditStats(month: string | null) {
  return useQuery({ queryKey: attendanceEditKeys.stats(month), queryFn: () => attendanceEdits.stats(month), staleTime: 30_000 })
}
/** المعاينة لا تكتب شيئاً — تُستدعى يدوياً */
export function useAttendanceEditPreview() {
  const t = useToast()
  return useMutation({ mutationFn: (d: AttendanceEditDraft) => attendanceEdits.preview(d), onError: t.err })
}
export function useAttendanceEditCreate() {
  const t = useToast(); const inv = useInvalidateAll()
  return useMutation({
    mutationFn: (v: { draft: AttendanceEditDraft; reason: string; mode: AttendanceEditMode }) => attendanceEdits.create(v.draft, v.reason, v.mode),
    onSuccess: (r) => {
      inv()
      t.ok(r.status === 'applied' ? `نُفّذ التعديل: ${r.items ?? 0} يوم عمل · صُحّح ${r.minutes_fixed ?? 0} دقيقة`
        : r.status === 'approved' ? 'أُرسل الطلب إلى الموارد البشرية (لا سلسلة موافقات لهذا النوع)'
        : 'أُرسل الطلب إلى سلسلة الموافقات — ثم يصل الموارد البشرية')
    },
    onError: t.err,
  })
}
export function useAttendanceEditCancel() {
  const t = useToast(); const inv = useInvalidateAll()
  return useMutation({ mutationFn: (v: { id: string; reason?: string | null }) => attendanceEdits.cancel(v.id, v.reason), onSuccess: () => { inv(); t.ok('أُلغي الطلب') }, onError: t.err })
}
export function useAttendanceEditHrUpdateItem() {
  const t = useToast(); const inv = useInvalidateAll()
  return useMutation({
    mutationFn: (v: { itemId: string; status: string; checkIn: string | null; checkOut: string | null }) => attendanceEdits.hrUpdateItem(v.itemId, v.status, v.checkIn, v.checkOut),
    onSuccess: () => { inv(); t.ok('عُدّل البند') }, onError: t.err,
  })
}
export function useAttendanceEditHrSkipItem() {
  const t = useToast(); const inv = useInvalidateAll()
  return useMutation({ mutationFn: (v: { itemId: string; reason: string }) => attendanceEdits.hrSkipItem(v.itemId, v.reason), onSuccess: () => { inv(); t.ok('استُبعد البند') }, onError: t.err })
}
export function useAttendanceEditHrApply() {
  const t = useToast(); const inv = useInvalidateAll()
  return useMutation({
    mutationFn: (v: { id: string; note?: string | null }) => attendanceEdits.hrApply(v.id, v.note),
    onSuccess: (r) => { inv(); t.ok(`اعتُمد ونُفّذ: ${r.items} يوم عمل · صُحّح ${r.minutes_fixed} دقيقة`) }, onError: t.err,
  })
}
export function useAttendanceEditRevert() {
  const t = useToast(); const inv = useInvalidateAll()
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) => attendanceEdits.revert(v.id, v.reason),
    onSuccess: (r) => { inv(); t.ok(`تم التراجع: ${r.reverted_items} يوم عمل أُعيد إلى ما كان عليه`) }, onError: t.err,
  })
}
