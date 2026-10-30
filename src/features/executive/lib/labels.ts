/** تسميات عربية موحّدة للرموز التي تصل من قاعدة البيانات (حالات/شفتات/قطاعات/أنواع) */
import { SHIFT_LABELS_LIVE } from '@sdk/hr-shifts.sdk'
import { PARENT_SECTOR_LABELS_LIVE } from '@sdk/sectors.sdk'

const STATIC_LABELS: Record<string, string> = {
  other: 'أخرى',
  // الشكاوى
  new: 'جديدة', under_review: 'قيد المراجعة', assigned: 'مُحالة', in_progress: 'قيد التنفيذ', processed: 'مُعالجة',
  quality_review: 'مراجعة الجودة', ready_to_send: 'جاهزة للإرسال', sent: 'مُرسلة', archived: 'مؤرشفة',
  // القطاعات الأم (00394: من السجل الحيّ) والشفتات
  // الكشوفات
  delay: 'تأخر', absence: 'غياب', collection: 'جباية', evasion: 'تهرّب', draft: 'مسودة', returned: 'مُعاد للتصحيح', cancelled: 'ملغى', submitted_to_deputy: 'مرفوع للمعاون',
  // الرواتب
  exported: 'مُصدَّر (بانتظار المالية)', approved: 'معتمد', superseded: 'مستبدل',
  // التجهيز / GBS
  pending: 'معلّق', fulfilled: 'مُنفّذ', rejected: 'مرفوض', submitted: 'مُرسل', active: 'فعّالة', damaged: 'تالفة', missing: 'مفقودة', maintenance: 'صيانة', removed: 'مرفوعة',
}
export const label = (k: string | null | undefined): string => (k ? STATUS_LABELS[k] ?? k : 'غير محدد')

export const ROLE_AR: Record<string, string> = {
  super_admin: 'المدير المفوض', executive_director: 'المدير التنفيذي', deputy_director: 'معاون المدير المفوض', finance_officer: 'الشؤون المالية',
  hr_officer: 'الموارد البشرية', it_admin: 'التطوير المركزية', ops_room: 'غرفة العمليات', department_manager: 'مسؤولو الأقسام', employee: 'الموظفون',
  field_ops: 'العمليات الميدانية', admin_ops: 'مسؤول القاطع', maintenance: 'الصيانة', transfer_station: 'المحطة التحويلية',
  complaints_officer: 'الشكاوى', media_officer: 'الإعلام', central_garage_officer: 'الكراج المركزي', follow_up: 'المتابعة',
}

export const PRIORITY_AR = { normal: 'عادي', important: 'مهم', urgent: 'عاجل' } as const
export const AUDIENCE_AR = { all: 'كل المنصة', roles: 'بوابات/أدوار محددة', departments: 'أقسام محددة', users: 'أشخاص محددون' } as const

/** 00376: الشفتات من الموارد البشرية (سجل حيّ) + 00394: القطاعات من القاعدة + التسميات الثابتة */
export const STATUS_LABELS: Record<string, string> = new Proxy(STATIC_LABELS, {
  get: (t, k) => (typeof k === 'string' ? (t[k] ?? PARENT_SECTOR_LABELS_LIVE[k] ?? SHIFT_LABELS_LIVE[k]) : undefined),
})
