/**
 * 00362 — بقع التوقف: دوال مساعدة نقية (ألوان/أحجام/نوافذ/تنسيق) تُختبر وحدياً.
 */
import type { GpsStopHotspot } from '@sdk/gps-lvn.sdk'

export const HOTSPOT_COLORS: Readonly<Record<GpsStopHotspot['level'], string>> = {
  high: '#dc2626',
  medium: '#f59e0b',
  low: '#16a34a',
}
export const HOTSPOT_LEVEL_LABELS: Readonly<Record<GpsStopHotspot['level'], string>> = {
  high: 'كثيفة',
  medium: 'متوسطة',
  low: 'خفيفة',
}

/** خيارات النافذة الزمنية — تُقصّ حسب الحد الأقصى المضبوط في الإعدادات (أيام) */
export const HOTSPOT_WINDOWS = [
  { hours: 24, label: '24 ساعة' },
  { hours: 72, label: '3 أيام' },
  { hours: 168, label: '7 أيام' },
] as const
export const hotspotWindows = (maxDays: number) => {
  const maxHours = Math.max(1, Math.round(maxDays)) * 24
  const list: Array<{ hours: number; label: string }> = HOTSPOT_WINDOWS.filter((w) => w.hours <= maxHours).map((w) => ({ ...w }))
  if (!list.length) list.push({ hours: maxHours, label: `${maxDays} يوم` })
  return list
}
/** إن كانت النافذة المختارة أكبر من المسموح يُرجَع أكبر خيار مسموح */
export const clampHotspotWindow = (hours: number, maxDays: number) => {
  const list = hotspotWindows(maxDays)
  const last = list[list.length - 1]!
  return hours > last.hours ? last.hours : hours
}

/** نصف قطر الدائرة على الخريطة (بكسل) بحسب الوزن النسبي 0..1 */
export const hotspotRadiusPx = (score: number) => Math.round(10 + 22 * Math.sqrt(Math.min(Math.max(score, 0), 1)))

const ar = (n: number) => n.toLocaleString('en-US')
/** «3 س 25 د» / «12 د» / «40 ث» */
export const formatStopDuration = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${ar(s)} ث`
  const h = Math.floor(s / 3600),
    m = Math.round((s % 3600) / 60)
  if (h === 0) return `${ar(m)} د`
  return m === 0 ? `${ar(h)} س` : `${ar(h)} س ${ar(m)} د`
}
export const formatPeakHour = (hour: number | null) =>
  hour === null || hour === undefined ? '—' : `${ar(hour).padStart(2, '0')}:00–${ar((hour + 1) % 24).padStart(2, '0')}:00`

/** «قبل 5 د» / «قبل 3 س» / «قبل يومين» */
export const formatAgo = (iso: string | null | undefined, now = Date.now()) => {
  if (!iso) return '—'
  const diff = Math.max(0, now - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'الآن'
  if (diff < 3600) return `قبل ${ar(Math.round(diff / 60))} د`
  if (diff < 86400) return `قبل ${ar(Math.round(diff / 3600))} س`
  return `قبل ${ar(Math.round(diff / 86400))} يوم`
}

/** ترتيب القائمة الجانبية: افتراضياً بإجمالي زمن التوقف؛ خيارات أخرى للتبصّر */
export type HotspotSort = 'total' | 'stops' | 'vehicles' | 'recent'
export const HOTSPOT_SORT_LABELS: Readonly<Record<HotspotSort, string>> = {
  total: 'إجمالي زمن التوقف',
  stops: 'عدد التوقفات',
  vehicles: 'عدد الآليات',
  recent: 'الأحدث',
}
export const sortHotspots = (spots: GpsStopHotspot[], sort: HotspotSort) => {
  const list = [...spots]
  switch (sort) {
    case 'stops':
      return list.sort((a, b) => b.stops - a.stops || b.total_seconds - a.total_seconds)
    case 'vehicles':
      return list.sort((a, b) => b.vehicles - a.vehicles || b.total_seconds - a.total_seconds)
    case 'recent':
      return list.sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime())
    default:
      return list.sort((a, b) => a.rank - b.rank)
  }
}
