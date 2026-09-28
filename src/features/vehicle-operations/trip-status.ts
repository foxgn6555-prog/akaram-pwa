/**
 * مرحلة الرحلة — مصدر واحد للحقيقة (app.trip_status في 00152) لكل بوابات الآليات.
 * إن غاب العمود (بيانات قديمة/اختبارات) نشتقّه من الأعمدة التقليدية بالمنطق نفسه قدر الإمكان.
 */
export type TripStatus =
  | 'to_site'
  | 'at_site'
  | 'breakdown'
  | 'to_station'
  | 'at_station'
  | 'to_maintenance'
  | 'at_maintenance'
  | 'to_garage'
  | 'returned'

const known = new Set<TripStatus>([
  'to_site', 'at_site', 'breakdown', 'to_station', 'at_station', 'to_maintenance', 'at_maintenance', 'to_garage', 'returned',
])

export interface TripStatusSource {
  trip_status?: string | null
  arrived_at: string | null
  site_departed_at: string | null
  returned_at: string | null
}

export function resolveTripStatus(row: TripStatusSource): TripStatus {
  if (row.trip_status && known.has(row.trip_status as TripStatus)) return row.trip_status as TripStatus
  if (row.returned_at) return 'returned'
  if (!row.arrived_at) return 'to_site'
  if (row.site_departed_at) return 'to_garage'
  return 'at_site'
}

export const tripStatusMeta: Record<TripStatus, { label: string; tone: string }> = {
  to_site: { label: 'في الطريق إلى موقع العمل', tone: 'bg-amber-50 text-amber-700' },
  at_site: { label: 'وصلت وتعمل في الموقع', tone: 'bg-emerald-50 text-emerald-700' },
  breakdown: { label: 'عطل مفتوح في الموقع', tone: 'bg-rose-50 text-rose-700' },
  to_station: { label: 'في الطريق إلى المحطة التحويلية', tone: 'bg-orange-50 text-orange-700' },
  at_station: { label: 'داخل المحطة التحويلية', tone: 'bg-orange-50 text-orange-800' },
  to_maintenance: { label: 'في الطريق إلى الصيانة', tone: 'bg-violet-50 text-violet-700' },
  at_maintenance: { label: 'داخل الصيانة', tone: 'bg-violet-50 text-violet-800' },
  to_garage: { label: 'في الطريق إلى الكراج', tone: 'bg-blue-50 text-blue-700' },
  returned: { label: 'عادت إلى الكراج', tone: 'bg-slate-100 text-slate-600' },
}

/** الكراج يستطيع تأكيد الوصول فقط عندما تكون الآلية في طريقها إليه (نفس قاعدة garage_record_return). */
export const canGarageReceive = (status: TripStatus) => status === 'to_garage'

/** نص التوضيح للكراج عندما لا يمكنه الاستلام بعد. */
export const garageWaitingHint: Record<Exclude<TripStatus, 'to_garage' | 'returned'>, string> = {
  to_site: 'بانتظار تأكيد مسؤول القسم وصول الآلية',
  at_site: 'الآلية تعمل في الموقع — بانتظار إرسالها عائدة من مسؤول القسم',
  breakdown: 'عطل مفتوح في الموقع — بانتظار الحسم أو الإحالة إلى الصيانة',
  to_station: 'الآلية في طريقها إلى المحطة التحويلية',
  at_station: 'الآلية داخل المحطة التحويلية — بانتظار قرار المغادرة',
  to_maintenance: 'الآلية في طريقها إلى الصيانة',
  at_maintenance: 'الآلية داخل الصيانة — بانتظار تسريحها من الورشة',
}
