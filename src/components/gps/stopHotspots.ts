/**
 * 00362 — بقع التوقف: دوال مساعدة نقية (ألوان/أحجام/نوافذ/تنسيق) تُختبر وحدياً.
 */
import type { GpsStopHotspot } from '@sdk/gps-lvn.sdk'

export const HOTSPOT_COLORS: Readonly<Record<GpsStopHotspot['level'], string>> = {
  high: '#dc2626',
  medium: '#f59e0b',
  low: '#16a34a',
}
/** 00365: لون متصل بحسب المئين: أخضر → أصفر → برتقالي → أحمر */
const STOPS: Array<[number, [number, number, number]]> = [
  [0, [22, 163, 74]],
  [0.5, [234, 179, 8]],
  [0.8, [249, 115, 22]],
  [1, [220, 38, 38]],
]
export const hotspotRgb = (percentile: number): [number, number, number] => {
  const p = Math.min(Math.max(Number.isFinite(percentile) ? percentile : 0, 0), 1)
  for (let i = 1; i < STOPS.length; i++) {
    const [p0, c0] = STOPS[i - 1]!, [p1, c1] = STOPS[i]!
    if (p <= p1) {
      const t = (p - p0) / (p1 - p0)
      return [0, 1, 2].map((k) => Math.round(c0[k]! + (c1[k]! - c0[k]!) * t)) as [number, number, number]
    }
  }
  return STOPS[STOPS.length - 1]![1]
}
export const hotspotColor = (percentile: number) => {
  const [r, g, b] = hotspotRgb(percentile)
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}
export const formatShare = (share: number) => `${(Math.max(0, share) * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`
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
