/** خطافات «الحضور اليدوي البديل عند تعطل البصمة» — التطوير (تفعيل/إيقاف/تفويض) · الحسابات المخوّلة (الكشف) · غرفة العمليات/الموارد البشرية (الملخصات) */
import { useCallback, useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hrKeys } from '@lib/query-keys/hr.keys'
import { useUiStore } from '@stores/ui.store'
import {
  attendanceManual, attendanceManualErrorMessage,
  type ManualActivateArgs, type ManualMonthCount, type ManualPendingSummary, type ManualScopeArgs, type ManualSheetSaveEntry,
} from '@sdk/attendance-manual.sdk'
import { loadMyManualActivations } from './store'

export * from '@sdk/attendance-manual.sdk'
export * from './org-options'
export { MANUAL_SENIOR_PORTALS, filterManualAttendanceUnit, loadMyManualActivations, manualAttendanceVisible, useManualActivationsStore } from './store'

export const attendanceManualKeys = {
  all: ['attendance-manual'] as const,
  portalOptions: () => [...attendanceManualKeys.all, 'portal-options'] as const,
  recorders: (id: string) => [...attendanceManualKeys.all, 'recorders', id] as const,
  preview: (s: ManualScopeArgs) => [...attendanceManualKeys.all, 'preview', s.branchId ?? '', s.departmentId ?? '', s.includeSub] as const,
  list: (onlyActive: boolean) => [...attendanceManualKeys.all, 'list', onlyActive] as const,
  sheet: (id: string, date: string | null) => [...attendanceManualKeys.all, 'sheet', id, date ?? 'latest'] as const,
}

function useToast() {
  const addToast = useUiStore((s) => s.addToast)
  return {
    ok: (message: string) => addToast({ type: 'success', message }),
    err: (e: unknown) => addToast({ type: 'error', message: attendanceManualErrorMessage(e) }),
  }
}
/** بعد أي كتابة: تُحدَّث صفحات الوحدة وقائمة تفعيلاتي (الشريط الجانبي) وسجلات الحضور */
function useInvalidateAll() {
  const qc = useQueryClient()
  // يُرجع وعداً يكتمل بعد إعادة جلب الصفحات النشطة: تبقى حالة «جارٍ الحفظ» حتى تصل البيانات الجديدة فلا يومض المحفوظ القديم
  return (): Promise<unknown> => Promise.all([
    qc.invalidateQueries({ queryKey: attendanceManualKeys.all }),
    qc.invalidateQueries({ queryKey: [...hrKeys.all, 'attendance'] }),
    qc.invalidateQueries({ queryKey: [...hrKeys.all, 'audit'] }),
    loadMyManualActivations(true),
  ])
}

export function useManualPortalOptions(enabled = true) {
  return useQuery({ queryKey: attendanceManualKeys.portalOptions(), queryFn: () => attendanceManual.portalOptions(), enabled, staleTime: 60_000 })
}
/** حسابات التسجيل الإضافية لتفعيل معيّن — تُدار من التطوير المركزية فقط */
export function useManualRecorders(activationId: string | null, enabled = true) {
  return useQuery({
    queryKey: attendanceManualKeys.recorders(activationId ?? ''),
    queryFn: () => attendanceManual.recorders(activationId!),
    enabled: enabled && !!activationId,
    staleTime: 10_000,
  })
}
export function useSetManualRecorders() {
  const t = useToast(); const inv = useInvalidateAll()
  return useMutation({
    mutationFn: (v: { activation: string; userIds: string[] }) => attendanceManual.setRecorders(v.activation, v.userIds),
    onSuccess: async (r) => { await inv(); t.ok(`حُفظت قائمة الحسابات المخوّلة (${r.recorders}) — غرفة العمليات مخوّلة افتراضياً`) },
    onError: t.err,
  })
}
/** المعاينة لا تكتب شيئاً — تعمل تلقائياً متى اكتمل اختيار النطاق (فرع أو قسم) */
export function useManualScopePreview(scope: ManualScopeArgs, enabled = true) {
  const ready = enabled && (!!scope.branchId || !!scope.departmentId)
  return useQuery({ queryKey: attendanceManualKeys.preview(scope), queryFn: () => attendanceManual.scopePreview(scope), enabled: ready, staleTime: 15_000 })
}
export function useManualActivations(onlyActive = false, enabled = true) {
  return useQuery({ queryKey: attendanceManualKeys.list(onlyActive), queryFn: () => attendanceManual.list(onlyActive), enabled, staleTime: 10_000, refetchInterval: 30_000 })
}
export function useManualActivate() {
  const t = useToast(); const inv = useInvalidateAll()
  return useMutation({
    mutationFn: (a: ManualActivateArgs) => attendanceManual.activate(a),
    onSuccess: async (r) => { await inv(); t.ok(`فُعّل الحضور اليدوي لـ ${r.employees} موظفاً — البصمة موقوفة منطقياً لهذا النطاق حتى الإيقاف`) },
    onError: t.err,
  })
}
export function useManualDeactivate() {
  const t = useToast(); const inv = useInvalidateAll()
  return useMutation({
    mutationFn: (v: { id: string; lastDay: string | null; note: string | null }) => attendanceManual.deactivate(v.id, v.lastDay, v.note),
    onSuccess: async (r) => {
      await inv()
      t.ok(`أُوقف التفعيل — عادت البصمة بعد ${r.ends_on}${r.pending_days > 0 ? ` · بقي ${r.pending_days} يوم-موظف بانتظار الكشف` : ''}`)
    },
    onError: t.err,
  })
}

/** كشف يوم لتفعيل — يُبقي الشاشة السابقة ظاهرة أثناء الانتقال بين الأيام (بلا وميض) */
export function useManualSheet(activationId: string | null, date: string | null) {
  return useQuery({
    queryKey: attendanceManualKeys.sheet(activationId ?? '', date), queryFn: () => attendanceManual.sheet(activationId!, date),
    enabled: !!activationId, staleTime: 5_000, placeholderData: keepPreviousData, retry: false,
  })
}
export function useManualSheetSave() {
  const t = useToast(); const inv = useInvalidateAll()
  return useMutation({
    mutationFn: (v: { activation: string; date: string; entries: ManualSheetSaveEntry[]; note: string | null }) => attendanceManual.saveSheet(v.activation, v.date, v.entries, v.note),
    onSuccess: async (r) => {
      await inv()
      const done = r.saved + r.changed
      t.ok(done > 0
        ? `حُفظ الكشف: ${done} موظف (حاضر ${r.present} · غائب ${r.absent})${r.pending_left > 0 ? ` — بقي ${r.pending_left} بلا تسجيل` : ' — اكتمل كشف هذا اليوم'}`
        : 'لا تغيير — الكشف محفوظ كما هو')
    },
    onError: t.err,
  })
}

/**
 * الأيام المعلّقة لشهر / عدّادات الشهر اليدوية — لغرفة العمليات والموارد البشرية.
 * بلا React Query عمداً (كمخازن portal-visibility وmy-permissions): تُستعمل داخل صفحات الحضور القائمة التي تُختبر بلا QueryClientProvider،
 * والفشل (صلاحية/شبكة) = «لا شريط» لا خطأ ظاهراً. يُحدَّث دورياً (دقيقة) وعند طلب reload().
 */
function useMonthLoaded<T>(month: string, enabled: boolean, load: (m: string) => Promise<T>): { data: T | null; isLoading: boolean; isError: boolean; reload: () => void } {
  const [state, setState] = useState<{ month: string; data: T | null; loading: boolean; error: boolean }>({ month: '', data: null, loading: false, error: false })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled || !month) return
    let alive = true
    const run = (): void => {
      setState((prev) => prev.month === month ? { ...prev, loading: true, error: false } : { month, data: null, loading: true, error: false })
      load(month).then((data) => { if (alive) setState({ month, data, loading: false, error: false }) }).catch(() => { if (alive) setState({ month, data: null, loading: false, error: true }) })
    }
    run()
    const timer = window.setInterval(run, 60_000)
    return () => { alive = false; window.clearInterval(timer) }
    // load ثابت المرجع لكل نوع (دالة SDK على مستوى الوحدة)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, enabled, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return {
    data: state.month === month ? state.data : null,
    isLoading: !!enabled && !!month && (state.month !== month || state.loading),
    isError: state.month === month && state.error,
    reload,
  }
}
export function useManualPendingSummary(month: string, enabled = true) {
  return useMonthLoaded<ManualPendingSummary>(month, enabled, attendanceManual.pendingSummary)
}
export function useManualMonthCounts(month: string, enabled = true) {
  return useMonthLoaded<ManualMonthCount[]>(month, enabled, attendanceManual.monthCounts)
}
