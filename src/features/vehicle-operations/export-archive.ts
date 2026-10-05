import type { MaintenanceArchiveEntry } from '@sdk/vehicle-operations.sdk'
import { buildExcelReport, type ReportColumn } from '@lib/export/excel-report'

const dt = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(value))
    : '—'
const minutes = (m: number | null | undefined) =>
  m === null || m === undefined ? '—' : m < 60 ? `${m} د` : `${Math.floor(m / 60)} س ${m % 60} د`
export const finalLabels: Record<string, string> = {
  returned_to_work: 'عادت إلى العمل',
  closed_at_garage: 'أُغلقت في الكراج',
}
export const priorityLabels: Record<string, string> = { low: 'منخفضة', normal: 'عادية', high: 'عالية', urgent: 'عاجلة', critical: 'حرجة' }
const shiftLabels: Record<string, string> = { morning: 'صباحي', evening: 'مسائي', night: 'ليلي' }

/** الصف الرئيسي لأرشيف الصيانة (ورقة «السجل») */
export function archiveMainRow(r: MaintenanceArchiveEntry, index: number) {
  return {
    '#': index + 1,
    db_number: r.db_number,
    vehicle_name: r.vehicle_name,
    driver_name: r.driver_name,
    shift: shiftLabels[r.shift] ?? r.shift,
    area_name: r.area_name,
    manager_name: r.manager_name ?? '—',
    fault_type: r.fault_type,
    priority: priorityLabels[r.priority] ?? r.priority,
    technicians: r.technicians ?? '—',
    reported_at: dt(r.reported_at),
    arrived_at: dt(r.arrived_at),
    wait_minutes: minutes(r.wait_minutes),
    ready_at: dt(r.ready_at),
    readiness_approved_at: dt(r.readiness_approved_at),
    departed_maintenance_at: dt(r.departed_maintenance_at),
    completed_at: dt(r.completed_at),
    maintenance_minutes: minutes(r.maintenance_minutes),
    duration_days: r.duration_days ?? '—',
    parts_count: r.parts_count,
    estimated_cost: Number(r.estimated_cost ?? 0),
    parts_actual_cost: Number(r.parts_actual_cost ?? 0),
    service_cost: Number(r.service_cost ?? 0),
    actual_cost: Number(r.actual_cost ?? 0),
    final_status: finalLabels[r.final_status] ?? r.final_status,
    corrected: r.corrected_at ? `${dt(r.corrected_at)} — ${r.correction_reason ?? ''}` : '—',
  }
}

export const ARCHIVE_MAIN_COLUMNS: ReportColumn[] = [
  { key: '#', header: 'ت', width: 6 },
  { key: 'db_number', header: 'رقم DB', width: 12 },
  { key: 'vehicle_name', header: 'الآلية', width: 20 },
  { key: 'driver_name', header: 'السائق', width: 20 },
  { key: 'shift', header: 'الشفت', width: 10 },
  { key: 'area_name', header: 'المنطقة', width: 16 },
  { key: 'manager_name', header: 'مسؤول القسم', width: 18 },
  { key: 'fault_type', header: 'العطل', width: 20, wrap: true },
  { key: 'priority', header: 'الأولوية', width: 10 },
  { key: 'technicians', header: 'الفنيون (التخصص)', width: 28, wrap: true },
  { key: 'reported_at', header: 'وقت البلاغ', width: 18 },
  { key: 'arrived_at', header: 'وصول الصيانة', width: 18 },
  { key: 'wait_minutes', header: 'انتظار الوصول', width: 12 },
  { key: 'ready_at', header: 'إعلان الجاهزية', width: 18 },
  { key: 'readiness_approved_at', header: 'اعتماد الجاهزية', width: 18 },
  { key: 'departed_maintenance_at', header: 'مغادرة الصيانة', width: 18 },
  { key: 'completed_at', header: 'إغلاق الحالة', width: 18 },
  { key: 'maintenance_minutes', header: 'وقت الصيانة', width: 12 },
  { key: 'duration_days', header: 'المدة (أيام)', width: 10 },
  { key: 'parts_count', header: 'عدد القطع', width: 9 },
  { key: 'estimated_cost', header: 'الكلفة التقديرية', width: 14, numFmt: '#,##0' },
  { key: 'parts_actual_cost', header: 'كلفة القطع', width: 14, numFmt: '#,##0' },
  { key: 'service_cost', header: 'كلفة الخدمة', width: 14, numFmt: '#,##0' },
  { key: 'actual_cost', header: 'الكلفة الفعلية', width: 14, numFmt: '#,##0' },
  { key: 'final_status', header: 'النهاية', width: 16 },
  { key: 'corrected', header: 'تصحيح غرفة العمليات', width: 26, wrap: true },
]

export const ARCHIVE_DETAIL_COLUMNS: ReportColumn[] = [
  { key: '#', header: 'ت', width: 6 },
  { key: 'db_number', header: 'رقم DB', width: 12 },
  { key: 'vehicle_name', header: 'الآلية', width: 20 },
  { key: 'fault_type', header: 'العطل', width: 20, wrap: true },
  { key: 'diagnosis', header: 'التشخيص', width: 40, wrap: true },
  { key: 'work_notes', header: 'الأعمال المنفذة', width: 40, wrap: true },
  { key: 'parts_summary', header: 'القطع المستخدمة', width: 40, wrap: true },
  { key: 'delay_reason', header: 'سبب التأخير', width: 28, wrap: true },
  { key: 'technicians', header: 'الفنيون', width: 28, wrap: true },
]

export const ARCHIVE_SUMMARY_COLUMNS: ReportColumn[] = [
  { key: 'metric', header: 'المؤشر', width: 34, align: 'right' },
  { key: 'value', header: 'القيمة', width: 20 },
]

/** ملخص إجمالي للأرشيف المصدَّر (يُستخدم في ورقة الملخص وفي الاختبارات) */
export function archiveSummary(rows: MaintenanceArchiveEntry[]) {
  const n = rows.length
  const sum = (k: keyof MaintenanceArchiveEntry) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0)
  const avg = (k: keyof MaintenanceArchiveEntry) => {
    const vals = rows.map((r) => r[k]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
  }
  const byFault = new Map<string, number>()
  for (const r of rows) byFault.set(r.fault_type, (byFault.get(r.fault_type) ?? 0) + 1)
  const topFault = [...byFault.entries()].sort((a, b) => b[1] - a[1])[0]
  return {
    count: n,
    totalCost: sum('actual_cost'),
    partsCost: sum('parts_actual_cost'),
    serviceCost: sum('service_cost'),
    partsCount: sum('parts_count'),
    avgMaintenanceMinutes: avg('maintenance_minutes'),
    avgWaitMinutes: avg('wait_minutes'),
    returnedToWork: rows.filter((r) => r.final_status === 'returned_to_work').length,
    closedAtGarage: rows.filter((r) => r.final_status === 'closed_at_garage').length,
    withTechnicians: rows.filter((r) => (r.technician_count ?? 0) > 0).length,
    topFault: topFault ? `${topFault[0]} (${topFault[1]})` : '—',
  }
}

export async function exportMaintenanceArchive(
  rows: MaintenanceArchiveEntry[],
  filters: { search?: string; from?: string; to?: string },
) {
  const s = archiveSummary(rows)
  const money = (v: number) => new Intl.NumberFormat('ar-IQ-u-nu-latn').format(v)
  const summaryRows = [
    { metric: 'عدد الحالات المكتملة', value: s.count },
    { metric: 'إجمالي الكلفة الفعلية (د.ع)', value: money(s.totalCost) },
    { metric: 'إجمالي كلفة القطع (د.ع)', value: money(s.partsCost) },
    { metric: 'إجمالي كلفة الخدمة/الأجور (د.ع)', value: money(s.serviceCost) },
    { metric: 'إجمالي القطع المستخدمة', value: s.partsCount },
    { metric: 'متوسط وقت الصيانة', value: minutes(s.avgMaintenanceMinutes) },
    { metric: 'متوسط انتظار الوصول', value: minutes(s.avgWaitMinutes) },
    { metric: 'عادت إلى العمل', value: s.returnedToWork },
    { metric: 'أُغلقت في الكراج', value: s.closedAtGarage },
    { metric: 'حالات بفنيين معيَّنين', value: `${s.withTechnicians} من ${s.count}` },
    { metric: 'أكثر الأعطال تكراراً', value: s.topFault },
  ]
  const period = filters.from || filters.to ? `الفترة ${filters.from || '…'} إلى ${filters.to || '…'}` : 'كل الفترات'
  const meta = `${period} · البحث ${filters.search || 'الكل'} · ${rows.length} حالة · توقيت بغداد`
  const faultData = [...rows.reduce((m, r) => m.set(r.fault_type, (m.get(r.fault_type) ?? 0) + 1), new Map<string, number>()).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }))
  return await buildExcelReport({
    sheetName: 'أرشيف الصيانة',
    companySub: 'الصيانة المركزية — أرشيف الحالات المكتملة',
    title: 'أرشيف صيانة الآليات',
    meta,
    fileName: `أرشيف-الصيانة-${filters.from || 'الكل'}-${filters.to || new Date().toISOString().slice(0, 10)}.xlsx`,
    orientation: 'landscape',
    columns: ARCHIVE_MAIN_COLUMNS,
    rows: rows.map(archiveMainRow),
    totalRow: {
      '#': 'الإجمالي',
      db_number: `${rows.length} حالة`,
      parts_count: s.partsCount,
      estimated_cost: rows.reduce((a, r) => a + Number(r.estimated_cost ?? 0), 0),
      parts_actual_cost: s.partsCost,
      service_cost: s.serviceCost,
      actual_cost: s.totalCost,
    },
    extraSheets: [
      { sheetName: 'الملخص', title: 'ملخص أرشيف الصيانة', meta, columns: ARCHIVE_SUMMARY_COLUMNS, rows: summaryRows, orientation: 'portrait' },
      {
        sheetName: 'التفاصيل الفنية',
        title: 'التشخيص والأعمال والقطع لكل حالة',
        meta,
        orientation: 'landscape',
        columns: ARCHIVE_DETAIL_COLUMNS,
        rows: rows.map((r, i) => ({
          '#': i + 1,
          db_number: r.db_number,
          vehicle_name: r.vehicle_name,
          fault_type: r.fault_type,
          diagnosis: r.diagnosis ?? '—',
          work_notes: r.work_notes ?? '—',
          parts_summary: r.parts_summary ?? '—',
          delay_reason: r.delay_reason ?? '—',
          technicians: r.technicians ?? '—',
        })),
      },
    ],
    charts: faultData.length ? [{ title: 'توزيع الأعطال', kind: 'bar', data: faultData, valueLabel: 'عدد الحالات' }] : undefined,
  })
}
