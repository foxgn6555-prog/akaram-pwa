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
// 00371: نوافذ دقيقة من 5 دقائق حتى 7 أيام (بالساعات؛ الكسور = دقائق، وتُرسل للخادم كدقائق)
export const HOTSPOT_WINDOWS = [
  { hours: 5 / 60, label: '5 د' },
  { hours: 15 / 60, label: '15 د' },
  { hours: 1, label: 'ساعة' },
  { hours: 6, label: '6 س' },
  { hours: 24, label: '24 س' },
  { hours: 72, label: '3 أيام' },
  { hours: 168, label: '7 أيام' },
] as const
export const HOTSPOT_WINDOW_HOURS: readonly number[] = HOTSPOT_WINDOWS.map((w) => w.hours)
export const hotspotWindows = (maxDays: number) => {
  const maxHours = Math.max(1, Math.round(maxDays)) * 24
  const list: Array<{ hours: number; label: string }> = HOTSPOT_WINDOWS.filter((w) => w.hours <= maxHours).map((w) => ({ ...w }))
  if (!list.length) list.push({ hours: maxHours, label: `${maxDays} يوم` })
  return list
}
/** قيمة مخزّنة → نافذة صالحة (تطابق بتسامح كسري) */
export const normalizeHotspotHours = (v: unknown, fallback = 24) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  if (!Number.isFinite(n)) return fallback
  const hit = HOTSPOT_WINDOW_HOURS.find((h) => Math.abs(h - n) < 1e-6)
  return hit ?? fallback
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
/** 00366 — دقة عالية: «40 ث» / «4 د 20 ث» (تحت 10 دقائق بالثواني) / «12 د» / «3 س 25 د» */
export const formatStopDuration = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${ar(s)} ث`
  if (s < 600) {
    const m = Math.floor(s / 60), r = s % 60
    return r === 0 ? `${ar(m)} د` : `${ar(m)} د ${ar(r)} ث`
  }
  const h = Math.floor(s / 3600),
    m = Math.round((s % 3600) / 60)
  if (h === 0) return `${ar(m)} د`
  if (m === 60) return `${ar(h + 1)} س`
  return m === 0 ? `${ar(h)} س` : `${ar(h)} س ${ar(m)} د`
}
/** 00366 — إعدادات الحرارة المشتركة من قاعدة البيانات (نمط العرض وشدته وحجمه) */
export type HeatStyle = { map_style: 'glow' | 'heat'; heat_intensity: number; heat_size: number }
export const DEFAULT_HEAT_STYLE: HeatStyle = { map_style: 'glow', heat_intensity: 0.7, heat_size: 1 }
export const normalizeHeatStyle = (meta?: Partial<HeatStyle> | null): HeatStyle => ({
  map_style: meta?.map_style === 'heat' ? 'heat' : 'glow',
  heat_intensity: Math.min(1, Math.max(0.2, Number(meta?.heat_intensity ?? DEFAULT_HEAT_STYLE.heat_intensity) || DEFAULT_HEAT_STYLE.heat_intensity)),
  heat_size: Math.min(2.5, Math.max(0.5, Number(meta?.heat_size ?? DEFAULT_HEAT_STYLE.heat_size) || DEFAULT_HEAT_STYLE.heat_size)),
})
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
