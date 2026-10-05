/** خطافات الموارد البشرية (00142) — HR + غرفة العمليات + المالية */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hrKeys } from '@lib/query-keys/hr.keys'
import { departmentsKeys } from '@lib/query-keys/departments.keys'
import { hr, hrErrorMessage } from '@sdk/hr.sdk'
import { useUiStore } from '@stores/ui.store'
import type { AttendanceFilters, CreateEmployeeInput, DocType, HrPolicy, HrShift, ImportEmployeeRow, LeaveRequestInput, LeaveType, TerminationType } from '../types'

function useToast() {
  const addToast = useUiStore((s) => s.addToast)
  return {
    ok: (message: string) => addToast({ type: 'success', message }),
    err: (e: unknown) => addToast({ type: 'error', message: hrErrorMessage(e) }),
  }
}

// ── الشفتات ──
export function useHrShifts(includeInactive = false) {
  return useQuery({ queryKey: [...hrKeys.shifts(), includeInactive], queryFn: () => hr.listShifts(includeInactive), staleTime: 60_000 })
}
export function useSaveShift() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: Partial<HrShift> & Pick<HrShift, 'name' | 'start_time' | 'end_time'>) => hr.saveShift(v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: hrKeys.shifts() }); t.ok('حُفظ الشفت') },
    onError: t.err,
  })
}
export function useShiftAssignments(employeeId: string) {
  return useQuery({ queryKey: hrKeys.assignments(employeeId), queryFn: () => hr.listAssignments(employeeId), enabled: !!employeeId })
}
export function useAssignShift() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: hr.assignShift,
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: hrKeys.assignments(v.employeeId) })
      void qc.invalidateQueries({ queryKey: hrKeys.employee(v.employeeId) })
      void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'employees'] })
      t.ok('حُدّث شفت الموظف')
    },
    onError: t.err,
  })
}

// ── الموظفون ──
export function useHrEmployees(f: Parameters<typeof hr.listEmployees>[0] = {}) {
  return useQuery({ queryKey: hrKeys.employees(f), queryFn: () => hr.listEmployees(f), staleTime: 15_000 })
}
export function useHrEmployee(id: string | undefined) {
  return useQuery({ queryKey: hrKeys.employee(id ?? ''), queryFn: () => hr.getEmployee(id!), enabled: !!id })
}
export function useCreateEmployee() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: CreateEmployeeInput) => hr.createEmployee(v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: hrKeys.all }); t.ok('سُجّل الموظف وأُرسل ملف راتبه إلى المالية') },
    onError: t.err,
  })
}
export function useUpdateEmployee() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: { id: string; patch: Record<string, unknown> }) => hr.updateEmployee(v.id, v.patch),
    onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: hrKeys.employee(v.id) }); void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'employees'] }); t.ok('حُفظت بيانات الموظف') },
    onError: t.err,
  })
}
export function useTerminateEmployee() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: { id: string; type: TerminationType; lastDay: string; reason: string; attachmentPath?: string | null }) => hr.terminateEmployee(v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: hrKeys.all }); t.ok('أُنهيت الخدمة وأُبلغت المالية للتسوية') },
    onError: t.err,
  })
}

// ── المستمسكات ──
export function useEmployeeDocuments(employeeId: string) {
  return useQuery({ queryKey: hrKeys.documents(employeeId), queryFn: () => hr.listDocuments(employeeId), enabled: !!employeeId })
}
export function useUploadDocument() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: { employeeId: string; docType: DocType; file: File; title?: string }) => hr.uploadDocument(v.employeeId, v.docType, v.file, v.title),
    onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: hrKeys.documents(v.employeeId) }); void qc.invalidateQueries({ queryKey: hrKeys.employee(v.employeeId) }); t.ok('رُفع المستمسك') },
    onError: t.err,
  })
}
export function useDeleteDocument() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: hr.deleteDocument,
    onSuccess: (_d, doc) => { void qc.invalidateQueries({ queryKey: hrKeys.documents(doc.employee_id) }); t.ok('حُذف المستمسك') },
    onError: t.err,
  })
}

// ── الإجازات ──
export function useHrLeaves(f: Parameters<typeof hr.listLeaves>[0]) {
  return useQuery({ queryKey: hrKeys.leaves(f), queryFn: () => hr.listLeaves(f) })
}

// ── الحضور ──
export function useAttendance(f: AttendanceFilters, enabled = true) {
  return useQuery({ queryKey: hrKeys.attendance(f), queryFn: () => hr.listAttendance(f), enabled, staleTime: 10_000 })
}
export function useEvaluateAttendance() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: { from: string; to: string; employeeId?: string | null }) => hr.evaluateAttendance(v.from, v.to, v.employeeId),
    onSuccess: (n) => { void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'attendance'] }); void qc.invalidateQueries({ queryKey: hrKeys.dashboard() }); t.ok(`أُعيد احتساب ${n} يوم/موظف من البصمات`) },
    onError: t.err,
  })
}
export function useHrDashboard() {
  return useQuery({ queryKey: hrKeys.dashboard(), queryFn: hr.dashboard, staleTime: 30_000 })
}

// ── غرفة العمليات ──
export function useEditAttendance() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: hr.editAttendance,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'attendance'] }); void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'audit'] }); t.ok('حُفظ التعديل وسُجّل في سجل التدقيق') },
    onError: t.err,
  })
}
export function useResetAttendance() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: { employeeId: string; date: string; reason: string }) => hr.resetAttendance(v.employeeId, v.date, v.reason),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'attendance'] }); void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'audit'] }); t.ok('أُعيد الصف إلى الاحتساب التلقائي') },
    onError: t.err,
  })
}
export function useDeductions(month: string, employeeId?: string | null) {
  return useQuery({ queryKey: hrKeys.deductions(month, employeeId), queryFn: () => hr.listDeductions(month, employeeId), enabled: !!month })
}
export function useAddDeduction() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: hr.addDeduction,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'deductions'] }); void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'audit'] }); t.ok('سُجّل الخصم') },
    onError: t.err,
  })
}
export function useDeleteDeduction() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) => hr.deleteDeduction(v.id, v.reason),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'deductions'] }); void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'audit'] }); t.ok('حُذف الخصم') },
    onError: t.err,
  })
}
export function useEmployeeMonthDays(employeeId: string | null, month: string) {
  return useQuery({ queryKey: ['hr', 'month-days', employeeId, month], queryFn: () => hr.employeeMonthDays(employeeId as string, month), enabled: !!employeeId })
}
export function useAttendanceAuditNamed(f: Parameters<typeof hr.listAuditNamed>[0] = {}) {
  return useQuery({ queryKey: [...hrKeys.audit(f), 'named'], queryFn: () => hr.listAuditNamed(f) })
}
export function useAttendanceAudit(f: Parameters<typeof hr.listAudit>[0] = {}) {
  return useQuery({ queryKey: hrKeys.audit(f), queryFn: () => hr.listAudit(f) })
}
export function useMonthExports(month?: string) {
  return useQuery({ queryKey: hrKeys.exports(month), queryFn: () => hr.listExports(month) })
}
export function useExportRows(exportId: string | null | undefined) {
  return useQuery({ queryKey: hrKeys.exportRows(exportId ?? ''), queryFn: () => hr.exportRows(exportId!), enabled: !!exportId })
}
export function useExportMonth() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (month: string) => hr.exportMonth(month),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'exports'] }); void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'audit'] }); t.ok('صُدّرت بيانات الشهر إلى بوابة المالية') },
    onError: t.err,
  })
}

// ── المالية ──
export function usePayrollSheet(month: string) {
  return useQuery({ queryKey: hrKeys.payrollSheet(month), queryFn: () => hr.payrollSheet(month), enabled: !!month })
}
export function useAdjustPayroll() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: { rowId: string; finalNet: number; note: string }) => hr.adjustPayroll(v.rowId, v.finalNet, v.note),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'payroll-sheet'] }); t.ok('حُفظ التعديل') },
    onError: t.err,
  })
}
export function useApprovePayroll() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (exportId: string) => hr.approvePayroll(exportId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: hrKeys.all }); t.ok('اعتُمدت رواتب الشهر وأُقفل') },
    onError: t.err,
  })
}
export function useSalaryProfile(employeeId: string | null | undefined) {
  return useQuery({ queryKey: hrKeys.salaryProfile(employeeId ?? ''), queryFn: () => hr.getSalaryProfile(employeeId!), enabled: !!employeeId })
}
export function useSetSalary() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: hr.setSalary,
    onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: hrKeys.salaryProfile(v.employeeId) }); void qc.invalidateQueries({ queryKey: hrKeys.notices() }); void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'employees'] }); t.ok('حُفظ ملف الراتب') },
    onError: t.err,
  })
}
export function useFinanceNotices() {
  return useQuery({ queryKey: hrKeys.notices(), queryFn: hr.listNotices, staleTime: 15_000 })
}
export function useMarkNoticeDone() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (id: string) => hr.markNoticeDone(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: hrKeys.notices() }); t.ok('أُغلق الإشعار') },
    onError: t.err,
  })
}

// ─── 00143 ───
export function useImportEmployees() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: { rows: ImportEmployeeRow[]; dryRun: boolean }) => hr.importEmployees(v.rows, v.dryRun),
    onSuccess: (res) => { if (!res.dry_run) { void qc.invalidateQueries({ queryKey: hrKeys.all }); t.ok(`استُورد ${res.ok} موظفاً${res.failed ? ` · رُفض ${res.failed}` : ''}`) } },
    onError: t.err,
  })
}
export function useHrDepartments() {
  return useQuery({ queryKey: hrKeys.departments(), queryFn: hr.listDepartments })
}
/** 00153: المسميات الوظيفية من الهيكل */
export function useHrJobTitles(includeInactive = false) {
  return useQuery({ queryKey: [...hrKeys.departments(), 'job-titles', includeInactive], queryFn: () => hr.listJobTitles(includeInactive) })
}
export function useSaveDepartment() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: hr.saveDepartment,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: hrKeys.departments() }); void qc.invalidateQueries({ queryKey: departmentsKeys.all }); t.ok('حُفظ القسم') },
    onError: t.err,
  })
}

// ─── 00144: السياسة · الإجازات · الأرصدة · التنبيهات ───
const invalidateLeaves = (qc: ReturnType<typeof useQueryClient>) => {
  for (const k of ['leave-requests', 'balance', 'ledger', 'leaves', 'attendance', 'alerts', 'leaves-dashboard']) void qc.invalidateQueries({ queryKey: [...hrKeys.all, k] })
}
export function useHrPolicy() {
  return useQuery({ queryKey: hrKeys.policy(), queryFn: hr.policy, staleTime: 60_000 })
}
export function useSetHrPolicy() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (patch: Partial<HrPolicy>) => hr.setPolicy(patch),
    onSuccess: (p) => { qc.setQueryData(hrKeys.policy(), p); t.ok('حُفظت السياسة') },
    onError: t.err,
  })
}
export function useLeaveTypes(includeInactive = false) {
  return useQuery({ queryKey: hrKeys.leaveTypes(includeInactive), queryFn: () => hr.listLeaveTypes(includeInactive), staleTime: 60_000 })
}
export function useSaveLeaveType() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: Partial<LeaveType>) => hr.saveLeaveType(v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'leave-types'] }); t.ok('حُفظ نوع الإجازة') },
    onError: t.err,
  })
}
export function useLeaveBalance(employeeId: string | null | undefined, year?: number | null) {
  return useQuery({ queryKey: hrKeys.balance(employeeId ?? '', year), queryFn: () => hr.balance(employeeId!, year), enabled: !!employeeId, staleTime: 15_000 })
}
export function useLeaveLedger(employeeId: string | null | undefined, year?: number | null) {
  return useQuery({ queryKey: hrKeys.ledger(employeeId ?? '', year), queryFn: () => hr.ledger(employeeId!, year), enabled: !!employeeId })
}
export function useSetGrant() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: { employeeId: string; year: number; days: number; note?: string | null }) => hr.setGrant(v.employeeId, v.year, v.days, v.note),
    onSuccess: () => { invalidateLeaves(qc); t.ok('حُدّث الرصيد السنوي') },
    onError: t.err,
  })
}
export function useAdjustBalance() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: { employeeId: string; year: number; days: number; reason: string }) => hr.adjustBalance(v.employeeId, v.year, v.days, v.reason),
    onSuccess: () => { invalidateLeaves(qc); t.ok('سُجّل التعديل على الرصيد') },
    onError: t.err,
  })
}
export function useLeaveRequests(f: Parameters<typeof hr.listLeaveRequests>[0], enabled = true) {
  return useQuery({ queryKey: hrKeys.leaveRequests(f), queryFn: () => hr.listLeaveRequests(f), enabled, staleTime: 10_000 })
}
export function useRequestLeave() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: LeaveRequestInput) => hr.requestLeave(v),
    onSuccess: () => { invalidateLeaves(qc); t.ok('أُرسل الطلب إلى المدير المباشر') },
    onError: t.err,
  })
}
export function useDecideLeave() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: { id: string; approve: boolean; note?: string | null }) => hr.decideLeave(v.id, v.approve, v.note),
    onSuccess: (_d, v) => { invalidateLeaves(qc); t.ok(v.approve ? 'تمت الموافقة على الطلب' : 'رُفض الطلب') },
    onError: t.err,
  })
}
export function useCancelLeave() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: { id: string; reason?: string | null }) => hr.cancelLeave(v.id, v.reason),
    onSuccess: () => { invalidateLeaves(qc); t.ok('أُلغي الطلب') },
    onError: t.err,
  })
}
export function useWaiveDeduction() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: { employeeId: string; date: string; waive: boolean; reason: string }) => hr.waiveDeduction(v.employeeId, v.date, v.waive, v.reason),
    onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'attendance'] }); void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'audit'] }); void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'alerts'] }); t.ok(v.waive ? 'أُلغي الاستقطاع المقترح وسُجّل السبب' : 'أُعيد الاستقطاع المقترح') },
    onError: t.err,
  })
}
export function useHrAlerts(month?: string | null, onlyOpen = true) {
  return useQuery({ queryKey: hrKeys.alerts(month, onlyOpen), queryFn: () => hr.listAlerts(month, onlyOpen), staleTime: 15_000 })
}
export function useAckAlert() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (id: string) => hr.ackAlert(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: [...hrKeys.all, 'alerts'] }); void qc.invalidateQueries({ queryKey: hrKeys.leavesDashboard() }); t.ok('تم الإقرار بالتنبيه') },
    onError: t.err,
  })
}
export function useLeavesDashboard() {
  return useQuery({ queryKey: hrKeys.leavesDashboard(), queryFn: hr.leavesDashboard, staleTime: 30_000 })
}
export function useMyEmployee() {
  return useQuery({ queryKey: hrKeys.me(), queryFn: hr.myEmployee, staleTime: 5 * 60_000 })
}
