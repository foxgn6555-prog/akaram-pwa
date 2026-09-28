/**
 * خطافات سير العمل بالخطوات (00130): الوزن ← الوجهة ← الاكتمال،
 * المخالفات، ناقلة الحاويات المكبسية، وجدول غرفة العمليات.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { transferStation } from '@sdk/transfer-station.sdk'
import { VEHICLE_KINDS, kindFromRow, type VehicleKind, type WeighingDestination } from '../lib/vehicleKinds'

export const workflowKeys = {
  violations: (day?: string) => ['transfer-station', 'violations', day ?? 'all'] as const,
  carrier: (month?: string) => ['transfer-station', 'carrier', month ?? 'all'] as const,
  workflow: (day?: string) => ['transfer-station', 'ops-workflow', day ?? 'all'] as const,
  workflowRange: (from: string, to: string) => ['transfer-station', 'ops-workflow-range', from, to] as const,
  kinds: (includeInactive: boolean) => ['transfer-station', 'vehicle-kinds', includeInactive] as const,
}

/**
 * أنواع الآليات وحدود الأوزان من القاعدة (تديرها غرفة العمليات).
 * قبل وصول البيانات تُستعمل القائمة الثابتة احتياطاً حتى لا تتعطل المحطة.
 */
export function useVehicleKinds(includeInactive = false) {
  const query = useQuery({
    queryKey: workflowKeys.kinds(includeInactive),
    queryFn: () => transferStation.vehicleKinds(includeInactive),
    staleTime: 60_000,
  })
  const kinds: VehicleKind[] = query.data && query.data.length ? query.data.map(kindFromRow) : VEHICLE_KINDS
  return { ...query, kinds, rows: query.data ?? [] }
}

/** حفظ نوع آلية وحدوده — غرفة العمليات */
export function useSaveVehicleKind() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: transferStation.saveVehicleKind,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transfer-station', 'vehicle-kinds'] })
    },
  })
}

/** تصحيح وزن مكتمل — غرفة العمليات */
export function useCorrectWeighing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: transferStation.correctWeighing,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehicle-operations'] })
      void qc.invalidateQueries({ queryKey: ['transfer-station'] })
    },
  })
}

/** أوزان المحطة ضمن نطاق التاريخ المختار في صفحة تقارير غرفة العمليات */
export function useOpsWorkflowRange(from: string, to: string) {
  return useQuery({
    queryKey: workflowKeys.workflowRange(from, to),
    queryFn: () => transferStation.opsWorkflowRange(from, to),
    enabled: Boolean(from && to),
  })
}

/** سجل مخالفات الوزن — الأقل من الحد الأدنى */
export function useViolations(day?: string) {
  return useQuery({
    queryKey: workflowKeys.violations(day),
    queryFn: () => transferStation.listViolations(day),
  })
}

/** خطوة الوزن: كتابة الوزن (وقت تلقائي) */
export function useRecordWeighing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { visitLegId: string; weightTons: number }) =>
      transferStation.recordWeighing(input.visitLegId, input.weightTons),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehicle-operations'] })
    },
  })
}

/** خطوة الاكتمال: الوجهة + النوع ⇒ دفتر تلقائي ومخالفة وتنبيه */
export function useCompleteWeighing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { visitLegId: string; destination: WeighingDestination; vehicleKind: string }) =>
      transferStation.completeWeighing(input.visitLegId, input.destination, input.vehicleKind),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehicle-operations'] })
      void qc.invalidateQueries({ queryKey: ['transfer-station'] })
    },
  })
}

/* ═══ ناقلة الحاويات المكبسية ═══ */

export function useCarrierList(month?: string) {
  return useQuery({
    queryKey: workflowKeys.carrier(month),
    queryFn: () => transferStation.listCarrier(month),
  })
}

export function useCreateCarrier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: transferStation.createCarrier,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transfer-station', 'carrier'] })
    },
  })
}

/** جدول غرفة العمليات لسير عمل المحطة */
export function useOpsWorkflow(day?: string) {
  return useQuery({
    queryKey: workflowKeys.workflow(day),
    queryFn: () => transferStation.opsWorkflow(day),
  })
}

/* ═══ التقارير اليومية (00131) ═══ */

export const dailyKeys = {
  report: (day: string) => ['transfer-station', 'daily-report', day] as const,
  sectors: (from: string, to: string) => ['transfer-station', 'sector-tonnage', from, to] as const,
  deputyDaily: () => ['deputy', 'daily-reports'] as const,
}

/** التقرير اليومي الكامل للمحطة */
export function useOpsDailyReport(day: string) {
  return useQuery({
    queryKey: dailyKeys.report(day),
    queryFn: () => transferStation.opsDailyReport(day),
    enabled: Boolean(day),
  })
}

/** أطنان القواطع ضمن مدى */
export function useSectorTonnage(from: string, to: string) {
  return useQuery({
    queryKey: dailyKeys.sectors(from, to),
    queryFn: () => transferStation.opsSectorTonnage(from, to),
    enabled: Boolean(from && to),
  })
}

/** إرسال اليوم إلى المعاون بعد التدقيق */
export function useSendDailyToDeputy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { day: string; note?: string }) =>
      transferStation.opsSendDailyToDeputy(input.day, input.note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deputy', 'daily-reports'] })
    },
  })
}

/** التقارير اليومية في بوابة المعاون */
export function useDeputyDailyReports() {
  return useQuery({
    queryKey: dailyKeys.deputyDaily(),
    queryFn: () => transferStation.deputyDailyReports(90),
  })
}
