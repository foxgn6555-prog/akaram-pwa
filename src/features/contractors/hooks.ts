import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { contractors, type AttendanceStatus, type CheckinInput, type Shift } from '@sdk/contractors.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

const ROOT = ['contractors']
const useAction = <T>(fn: (x: T) => Promise<unknown>, message: string) => {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ROOT }); toast({ type: 'success', message }) },
    onError: (e) => toast({ type: 'error', message: handleAppError(e, { scope: 'contractors' }).message }),
  })
}
export const useContractorMe = () => useQuery({ queryKey: [...ROOT, 'me'], queryFn: () => contractors.me(), refetchInterval: 60_000 })
export const useContractorWorkers = (date?: string) => useQuery({ queryKey: [...ROOT, 'workers', date ?? 'today'], queryFn: () => contractors.myWorkers(date) })
export const useContractorMonthGrid = (month?: string) => useQuery({ queryKey: [...ROOT, 'month', month ?? 'current'], queryFn: () => contractors.monthGrid(month) })
export const useContractorPhotoUrl = (path: string | null | undefined) =>
  useQuery({ queryKey: [...ROOT, 'photo', path], queryFn: () => contractors.signedUrl(path as string), enabled: Boolean(path), staleTime: 25 * 60_000 })
export const useAddWorker = () => useAction((x: { fullName: string; phone?: string | null }) => contractors.addWorker(x.fullName, x.phone), 'أُضيف العامل إلى فريقك')
export const useRemoveWorker = () => useAction((x: { workerId: string; reason?: string }) => contractors.removeWorker(x.workerId, x.reason), 'أُزيل العامل من الفريق')
export const useContractorCheckin = () => useAction((x: CheckinInput) => contractors.checkin(x), 'سُجّل حضورك — يمكنك الآن تسجيل حضور العمال')
export const useMarkAttendance = () => useAction((x: { workerId: string; status: AttendanceStatus; date?: string }) => contractors.markAttendance(x.workerId, x.status, x.date), 'تم الحفظ')
export const useMarkAll = () => useAction((x: { status: AttendanceStatus; date?: string }) => contractors.markAll(x.status, x.date), 'تم تعليم جميع العمال')
// غرفة العمليات
export const useContractorCandidates = (search?: string) => useQuery({ queryKey: [...ROOT, 'candidates', search ?? ''], queryFn: () => contractors.candidates(search) })
export const useAssignContractor = () => useAction((x: { employeeId: string; sectorId: number; shift?: Shift; notes?: string }) => contractors.assign(x.employeeId, x.sectorId, x.shift, x.notes), 'عُيّن المتعهد على المنطقة')
export const useUnassignContractor = () => useAction((x: { employeeId: string; reason: string }) => contractors.unassign(x.employeeId, x.reason), 'أُلغي تعيين المتعهد')
// مسؤول القسم
export const useManagerTeamSummary = () => useQuery({ queryKey: [...ROOT, 'manager-team'], queryFn: () => contractors.managerTeamSummary(), refetchInterval: 60_000 })
