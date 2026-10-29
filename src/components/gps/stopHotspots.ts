/**
 * 00362 — بقع التوقف: دوال مساعدة نقية (ألوان/أحجام/نوافذ/تنسيق) تُختبر وحدياً.
 */
import { useSyncExternalStore } from 'react'
import type { GpsStopClass, GpsStopHotspot } from '@sdk/gps-lvn.sdk'

/** 00373 — الأصناف الثلاثة بحسب مدة التوقف الغالبة زمنياً */
export const HOTSPOT_CLASS_COLORS: Readonly<Record<GpsStopClass, string>> = {
  long: '#7f1d1d',
  loiter: '#dc2626',
  light: '#f59e0b',
}
export const HOTSPOT_CLASS_RGB: Readonly<Record<GpsStopClass, [number, number, number]>> = {
  long: [127, 29, 29],
  loiter: [220, 38, 38],
  light: [245, 158, 11],
}
export const HOTSPOT_CLASS_LABELS: Readonly<Record<GpsStopClass, string>> = {
  long: 'توقف طويل',
  loiter: 'تلكؤ / موقع نفايات',
  light: 'خفيف / ازدحام',
}
export const HOTSPOT_CLASS_HINTS: Readonly<Record<GpsStopClass, string>> = {
  long: 'أغلب زمن التوقف هنا من توقفات ≥ 60 دقيقة',
  loiter: 'أغلب زمن التوقف هنا من توقفات 10–60 دقيقة',
  light: 'أغلب زمن التوقف هنا من توقفات أقل من 10 دقائق',
}
export const hotspotClass = (spot: Pick<GpsStopHotspot, 'class'>): GpsStopClass => spot.class ?? 'loiter'
/** البقع الخفيفة مخفية افتراضياً (الخريطة تركّز على التلكؤ) — مخزن مشترك بين اللوحة والطبقة */
const LIGHT_KEY = 'stop-hotspots:show-light'
let showLight = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(LIGHT_KEY) === '1'
const lightListeners = new Set<() => void>()
export const setShowLightSpots = (v: boolean) => {
  showLight = v
  try { sessionStorage.setItem(LIGHT_KEY, v ? '1' : '0') } catch { /* بيئة بلا تخزين */ }
  lightListeners.forEach((l) => l())
}
export const useShowLightSpots = () =>
  useSyncExternalStore((l) => { lightListeners.add(l); return () => lightListeners.delete(l) }, () => showLight, () => showLight)
export const visibleHotspots = (spots: GpsStopHotspot[], includeLight: boolean) =>
  includeLight ? spots : spots.filter((s) => hotspotClass(s) !== 'light')
export const countByClass = (spots: GpsStopHotspot[]) =>
  spots.reduce((acc, s) => { acc[hotspotClass(s)] += 1; return acc }, { long: 0, loiter: 0, light: 0 } as Record<GpsStopClass, number>)

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
// 00372: نافذة واحدة فقط = مدة الاحتفاظ (افتراضياً 3 أيام) — الخريطة تعرض دائماً آخر 72 ساعة كاملة
export const HOTSPOT_DEFAULT_DAYS = 3
const dayLabel = (d: number) => (d === 1 ? 'يوم' : d === 2 ? 'يومان' : d <= 10 ? `${d} أيام` : `${d} يوماً`)
export const hotspotWindows = (maxDays: number) => {
  const days = Math.max(1, Math.round(maxDays))
  return [{ hours: days * 24, label: dayLabel(days) }]
}
/** أي قيمة مخزّنة سابقاً تُهمَل — النافذة دائماً = الاحتفاظ */
export const normalizeHotspotHours = (_v: unknown, fallback = HOTSPOT_DEFAULT_DAYS * 24) => fallback
/** إن كانت النافذة المختارة أكبر من المسموح يُرجَع أكبر خيار مسموح */
export const clampHotspotWindow = (_hours: number, maxDays: number) => hotspotWindows(maxDays)[0]!.hours

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

/** 00374 — التكرار: نجوم بحسب المعيار المحقَّق لنفس الآلية في البقعة */
export const recurrenceStars = (tier: number | undefined) => '⭐'.repeat(Math.min(Math.max(tier ?? 0, 0), 3))
export const RECURRENCE_LABELS: Readonly<Record<0 | 1 | 2 | 3, string>> = {
  0: 'غير متكررة',
  1: 'متكررة: نفس الآلية 3 مرات أو أكثر',
  2: 'متكررة بقوة: نفس الآلية 5 مرات أو أكثر',
  3: 'عادة يومية: نفس الآلية في 3 أيام مختلفة',
}
export const recurrenceLabel = (tier: number | undefined) => RECURRENCE_LABELS[(Math.min(Math.max(tier ?? 0, 0), 3) as 0 | 1 | 2 | 3)]
export const SUPPORT_HINT = 'ترتيب «تحتاج دعماً» = زمن التوقف × تنوّع أنواع الآليات × عدد الآليات × الأيام المتكررة — الأعلى أولاً'
export const typesSummary = (spot: Pick<GpsStopHotspot, 'types' | 'unbound_vehicles'>) => {
  const parts = (spot.types ?? []).map((t) => `${t.label} ×${t.vehicles}`)
  if ((spot.unbound_vehicles ?? 0) > 0) parts.push(`غير مربوطة ×${spot.unbound_vehicles}`)
  return parts.join(' · ')
}
export const isMultiType = (spot: Pick<GpsStopHotspot, 'type_count'>) => (spot.type_count ?? 0) >= 2

/** ترتيب القائمة الجانبية: افتراضياً بإجمالي زمن التوقف؛ خيارات أخرى للتبصّر */
export type HotspotSort = 'total' | 'support' | 'recurrence' | 'types' | 'stops' | 'vehicles' | 'recent'
export const HOTSPOT_SORT_LABELS: Readonly<Record<HotspotSort, string>> = {
  total: 'إجمالي زمن التوقف',
  support: 'تحتاج دعماً',
  recurrence: 'الأكثر تكراراً',
  types: 'تعدّد الأنواع',
  stops: 'عدد التوقفات',
  vehicles: 'عدد الآليات',
  recent: 'الأحدث',
}
export const sortHotspots = (spots: GpsStopHotspot[], sort: HotspotSort) => {
  const list = [...spots]
  switch (sort) {
    case 'support':
      return list.sort((a, b) => (a.support_rank ?? 1e9) - (b.support_rank ?? 1e9) || b.total_seconds - a.total_seconds)
    case 'recurrence':
      return list.sort((a, b) => (b.recurrence_tier ?? 0) - (a.recurrence_tier ?? 0) || (b.recurring_vehicles ?? 0) - (a.recurring_vehicles ?? 0) || b.total_seconds - a.total_seconds)
    case 'types':
      return list.sort((a, b) => (b.type_count ?? 0) - (a.type_count ?? 0) || b.vehicles - a.vehicles || b.total_seconds - a.total_seconds)
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
