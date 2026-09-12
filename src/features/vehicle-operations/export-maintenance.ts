import type { MaintenanceEvent } from '@sdk/vehicle-operations.sdk'
import { buildExcelReport } from '@lib/export/excel-report'

const dt = (value: string) =>
  new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Asia/Baghdad',
  }).format(new Date(value))
const statusLabels: Record<string, string> = {
  to_maintenance: 'في الطريق إلى الصيانة',
  at_maintenance: 'داخل الصيانة',
  diagnosing: 'قيد التشخيص',
  waiting_parts: 'بانتظار القطع',
  in_repair: 'قيد الإصلاح',
  paused: 'متوقفة مؤقتاً',
  ready: 'جاهزة',
  to_work: 'في الطريق إلى العمل',
  to_garage: 'في الطريق إلى الكراج',
  returned_to_work: 'عادت إلى العمل',
  closed_at_garage: 'أغلقت في الكراج',
  in_transit: 'في الطريق',
  arrived: 'تم الوصول',
  installed: 'تم التركيب',
  returned: 'أعيدت للمخزون',
  issued: 'تم الصرف',
  approved: 'تمت الموافقة',
  acknowledged: 'تم تأكيد الاستلام',
  rejected: 'مرفوض',
  awaiting_ack: 'بانتظار التأكيد',
  awaiting_approval: 'بانتظار الموافقة',
}
const eventLabels: Record<MaintenanceEvent['event_type'], string> = {
  case: 'بلاغ الصيانة',
  decision: 'قرار الكراج',
  movement: 'حركة الآلية',
  maintenance_update: 'تحديث الصيانة',
  part: 'قطع الغيار',
  readiness: 'الجاهزية',
  completion: 'إكمال الدورة',
}
export async function exportMaintenanceTimeline(title: string, events: MaintenanceEvent[]) {
  const rows = events.map((event, index) => {
    const next = events[index + 1],
      minutes = next
        ? Math.max(
            0,
            Math.round(
              (new Date(next.happened_at).getTime() - new Date(event.happened_at).getTime()) /
                60000,
            ),
          )
        : 0
    return {
      sequence: index + 1,
      type: eventLabels[event.event_type],
      title: event.title,
      details: event.details ?? 'لا توجد تفاصيل إضافية',
      happened_at: dt(event.happened_at),
      duration_minutes: minutes,
      status: event.status ? (statusLabels[event.status] ?? 'حالة تشغيلية أخرى') : 'غير محدد',
      progress: event.progress === null ? 'غير متوفر' : `${event.progress}%`,
    }
  })
  await buildExcelReport({
    sheetName: 'التسلسل الزمني للصيانة',
    companySub: 'غرفة العمليات والصيانة المركزية',
    title: `تسلسل صيانة ${title}`,
    meta: `توقيت بغداد · ${events.length} حدثاً · المدة محسوبة حتى الحدث التالي`,
    fileName: `تسلسل-صيانة-${title.replace(/[^\p{L}\p{N}-]+/gu, '-')}.xlsx`,
    orientation: 'landscape',
    columns: [
      { key: 'sequence', header: 'التسلسل', width: 10 },
      { key: 'type', header: 'نوع الحدث', width: 20 },
      { key: 'title', header: 'الحدث', width: 32 },
      { key: 'details', header: 'التفاصيل', width: 42, wrap: true },
      { key: 'happened_at', header: 'التوقيت', width: 24 },
      { key: 'duration_minutes', header: 'المدة حتى الحدث التالي بالدقائق', width: 28 },
      { key: 'status', header: 'الحالة', width: 18 },
      { key: 'progress', header: 'نسبة الإنجاز', width: 16 },
    ],
    rows,
  })
}
