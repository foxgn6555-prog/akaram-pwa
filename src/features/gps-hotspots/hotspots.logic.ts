/** 00384 — منطق خريطة النفايات (بقع التوقف): الألوان، التسميات، الفلاتر المحلية، والعدّادات — بلا React */
import type { GpsHotspot, GpsHotspotsMonth, GpsHotspotsMonthStats, HotspotClass, HotspotRecurrence } from '@sdk/gps-hotspots.sdk'

export const HOTSPOT_CLASSES: readonly HotspotClass[] = ['light', 'medium', 'heavy']
export const HOTSPOT_RECURRENCES: readonly HotspotRecurrence[] = ['once', 'recurring', 'frequent']
export const CLASS_LABEL: Record<HotspotClass, string> = { light: 'خفيف', medium: 'متوسط', heavy: 'ثقيل' }
export const CLASS_COLOR: Record<HotspotClass, string> = { light: '#3b82f6', medium: '#f59e0b', heavy: '#ef4444' }
export const RECURRENCE_LABEL: Record<HotspotRecurrence, string> = { once: 'مرة واحدة', recurring: 'متكرر', frequent: 'شبه يومي' }
/** حلقة البقعة = التكرار (كلما زاد التكرار اشتدت الحلقة) */
export const RECURRENCE_RING: Record<HotspotRecurrence, { color: string; weight: number }> = { once: { color: '#ffffff', weight: 1 }, recurring: { color: '#fde68a', weight: 2 }, frequent: { color: '#fecaca', weight: 3 } }
export const MIN_VEHICLES_OPTIONS = [1, 2, 3, 5] as const

export interface WasteMapFilters { classes: HotspotClass[]; recurrence: HotspotRecurrence[]; minVehicles: number; sectorIds: number[] }
/** الافتراضي: الخفيف مخفي، كل درجات التكرار، آلية واحدة فأكثر، كل القواطع */
export const DEFAULT_FILTERS: WasteMapFilters = { classes: ['medium', 'heavy'], recurrence: [...HOTSPOT_RECURRENCES], minVehicles: 1, sectorIds: [] }

export const classLabel = (h: GpsHotspot): string => `${CLASS_LABEL[h.dominant_class]} (${h.heavy_count} ثقيل · ${h.medium_count} متوسط · ${h.light_count} خفيف)`
export const classThresholdLabel = (t: Record<string, number> | null | undefined): string =>
  t && t.class_light_max_min != null ? `خفيف ≤ ${t.class_light_max_min} د · متوسط ≤ ${t.class_medium_max_min} د · ثقيل أكثر` : 'خفيف / متوسط / ثقيل'
export const recurrenceThresholdLabel = (t: Record<string, number> | null | undefined): string =>
  t && t.recur_mid_days != null ? `مرة واحدة < ${t.recur_mid_days} أيام · متكرر ${t.recur_mid_days}–${(t.recur_high_days ?? 1) - 1} · شبه يومي ≥ ${t.recur_high_days ?? '?'} أيام` : 'حسب عدد الأيام المميزة'

/** نصف قطر دائرة البقعة بالبكسل: جذر الدقائق الكلية (مقيَّد 8..34) كي لا تبتلع الكبيرة الخريطة */
export function hotspotRadiusPx(h: GpsHotspot): number {
  return Math.max(8, Math.min(34, Math.round(4 + Math.sqrt(Math.max(0, h.total_minutes)) * 1.1)))
}
export function hotspotStyle(h: GpsHotspot, selected = false) {
  const ring = RECURRENCE_RING[h.recurrence]
  return { fill: CLASS_COLOR[h.dominant_class], ring: selected ? '#22d3ee' : ring.color, weight: selected ? 4 : ring.weight, radius: hotspotRadiusPx(h), glow: hotspotRadiusPx(h) * 2.2 }
}

export function toggleIn<T>(list: T[], v: T): T[] { return list.includes(v) ? list.filter((x) => x !== v) : [...list, v] }

/** الفلترة المحلية (نفس شروط القاعدة) — تسمح بالتبديل الفوري بلا طلب جديد */
/** 00387-ب: قواطع البقعة للفلترة: المنطقة الجغرافية إن عُرفت، وإلا قاطع الآلية احتياطاً */
export const spotSectorIds = (h: GpsHotspot): number[] => (h.geo_sector_id != null ? [h.geo_sector_id] : h.sector_ids)
/** اسم موقع البقعة للعرض: المنطقة (الزون) أو قاطع الآلية أو «خارج القواطع» */
export const spotPlace = (h: GpsHotspot): string => (h.geo_sector_name ? `${h.geo_sector_name}${h.geo_zone_name ? ` · ${h.geo_zone_name}` : ''}` : h.sector_names?.join('، ') || 'خارج القواطع')
/** ترتيب أثقل البقع (1..n) حسب إجمالي دقائق التوقف */
export function rankTop(rows: GpsHotspot[], n = 5): Map<number, number> {
  const m = new Map<number, number>()
  ;[...rows].sort((a, b) => b.total_minutes - a.total_minutes || b.stops_count - a.stops_count).slice(0, n).forEach((h, i) => m.set(h.id, i + 1))
  return m
}
export function applyFilters(rows: GpsHotspot[], f: WasteMapFilters): GpsHotspot[] {
  return rows.filter((h) =>
    (f.classes.length === 0 || f.classes.includes(h.dominant_class))
    && (f.recurrence.length === 0 || f.recurrence.includes(h.recurrence))
    && h.vehicles_count >= f.minVehicles
    && (f.sectorIds.length === 0 || spotSectorIds(h).some((s) => f.sectorIds.includes(s))))
}

export interface WasteMapSummary { spots: number; stops: number; totalMinutes: number; vehicles: number; multi: number; byClass: Record<HotspotClass, number>; byRecurrence: Record<HotspotRecurrence, number> }
export function summarize(rows: GpsHotspot[]): WasteMapSummary {
  const s: WasteMapSummary = { spots: rows.length, stops: 0, totalMinutes: 0, vehicles: 0, multi: 0, byClass: { light: 0, medium: 0, heavy: 0 }, byRecurrence: { once: 0, recurring: 0, frequent: 0 } }
  const devices = new Set<string>()
  for (const h of rows) {
    s.stops += h.stops_count; s.totalMinutes += h.total_minutes
    if (h.vehicles_count > 1) s.multi++
    s.byClass[h.dominant_class]++; s.byRecurrence[h.recurrence]++
    for (const v of h.vehicles ?? []) devices.add(v.device)
  }
  s.vehicles = devices.size
  return s
}

export const previousMonth = (now = new Date()): string => {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
/** الشهر المعروض افتراضياً: الشهر السابق إن كان منسوخاً، وإلا آخر شهر منسوخ */
export function defaultMonth(months: GpsHotspotsMonth[], now = new Date()): string | null {
  const prev = previousMonth(now)
  if (months.some((m) => m.month === prev)) return prev
  return months[0]?.month ?? null
}
export const monthLabel = (m: string): string => {
  const [y, mo] = m.split('-').map(Number)
  const names = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول']
  return `${names[(mo ?? 1) - 1] ?? m} ${y}`
}
export const fmtMinutes = (min: number): string => (min >= 60 ? `${Math.floor(min / 60)} س ${min % 60} د` : `${min} د`)
export const peakHours = (hours: number[]): string => {
  if (!hours?.length) return '—'
  const top = hours.map((n, h) => ({ n, h })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 2)
  return top.length ? top.map((x) => `${String(x.h).padStart(2, '0')}:00`).join(' · ') : '—'
}

/* ───────────── 00385: المقارنة مع الشهر السابق ───────────── */
export const prevMonthOf = (m: string): string => { const [y, mo] = m.split('-').map(Number); const d = new Date(y!, (mo ?? 1) - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
export interface MonthDelta { label: string; current: number; previous: number | null; delta: number | null; pct: number | null }
export interface MonthComparison { month: string; previous: string; available: boolean; rows: MonthDelta[] }
const delta = (label: string, cur: number, prev: number | null | undefined): MonthDelta =>
  prev == null ? { label, current: cur, previous: null, delta: null, pct: null } : { label, current: cur, previous: prev, delta: cur - prev, pct: prev === 0 ? null : Math.round(((cur - prev) / prev) * 100) }
/** يقارن إحصاء الشهر المعروض بالشهر الذي قبله (من الإحصاء الدائم، لا من الصفوف التي قد تكون حُذفت) */
export function compareMonths(stats: GpsHotspotsMonthStats[], month: string): MonthComparison {
  const cur = stats.find((s) => s.month === month), prevM = prevMonthOf(month), prev = stats.find((s) => s.month === prevM)
  const c = (k: keyof GpsHotspotsMonthStats, sub?: string) => (x: GpsHotspotsMonthStats | undefined): number | null => {
    if (!x) return null
    const v = x[k]
    if (sub && v && typeof v === 'object' && !Array.isArray(v)) return Number((v as Record<string, number>)[sub] ?? 0)
    return typeof v === 'number' ? v : 0
  }
  const rows: MonthDelta[] = [
    ['بقع', c('spots')], ['توقفات', c('stops')], ['دقائق التوقف', c('total_minutes')], ['بقع بأكثر من آلية', c('multi_vehicle')],
    ['ثقيلة', c('by_class', 'heavy')], ['متوسطة', c('by_class', 'medium')], ['خفيفة', c('by_class', 'light')],
    ['شبه يومية', c('by_recurrence', 'frequent')], ['متكررة', c('by_recurrence', 'recurring')],
  ].map(([label, f]) => delta(label as string, (f as (x: GpsHotspotsMonthStats | undefined) => number | null)(cur) ?? 0, (f as (x: GpsHotspotsMonthStats | undefined) => number | null)(prev)))
  return { month, previous: prevM, available: !!cur && !!prev, rows }
}
export const deltaLabel = (d: MonthDelta): string => (d.delta == null ? 'لا بيانات للشهر السابق' : d.delta === 0 ? 'بلا تغيير' : `${d.delta > 0 ? '▲ +' : '▼ '}${d.delta.toLocaleString('en')}${d.pct != null ? ` (${d.pct > 0 ? '+' : ''}${d.pct}%)` : ''}`)

/** الأيام مرتبة وأعدادها بحسب يوم الأسبوع (الجمعة=5) لعرض «أي الأيام» */
export const WEEKDAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
export function daysByWeekday(days: string[]): Array<{ day: string; count: number }> {
  const c = [0, 0, 0, 0, 0, 0, 0]
  for (const d of days ?? []) { const dt = new Date(`${d}T12:00:00Z`); if (!Number.isNaN(dt.getTime())) c[dt.getUTCDay()]!++ }
  return c.map((count, i) => ({ day: WEEKDAY_AR[i]!, count }))
}
export const fmtDay = (d: string): string => { const dt = new Date(`${d}T12:00:00Z`); return Number.isNaN(dt.getTime()) ? d : `${WEEKDAY_AR[dt.getUTCDay()]} ${d.slice(8)}/${d.slice(5, 7)}` }
export const googleMapsUrl = (h: Pick<GpsHotspot, 'lat' | 'lng'>): string => `https://www.google.com/maps?q=${h.lat.toFixed(6)},${h.lng.toFixed(6)}`
