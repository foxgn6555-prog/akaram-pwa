/** تسميات عربية لحالات التقرير — تستخدمها صفحتا القوالب ومحرر التقرير. */
import type { ComplaintReport } from '../types'

export const REPORT_STATUS_LABELS: Record<ComplaintReport['status'], string> = {
  draft: 'مسودة',
  quality_review: 'قيد التدقيق',
  approved: 'معتمد',
  sending: 'قيد الإرسال',
  sent: 'مُرسل',
  failed: 'فشل الإرسال',
  archived: 'مؤرشف',
}

export function reportStatusLabel(status: ComplaintReport['status']): string {
  return REPORT_STATUS_LABELS[status] ?? status
}