/** منطق خريطة البث المباشر (00287) — دوال نقية قابلة للاختبار: الفلاتر، الملخص، لون العلامة، شاغلو الزون. */
import type { LiveKind, LiveMapRow, LiveZoneRow } from '@sdk/live-tracking.sdk'

export type LiveFilter = 'all' | LiveKind
export const LIVE_FILTERS: { id: LiveFilter; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'contractor', label: 'المتعهدون' },
  { id: 'manager', label: 'مسؤولو الأقسام' },
]
export const LIVE_KIND_LABEL: Record<LiveKind, string> = { manager: 'مسؤول قسم', contractor: 'متعهد' }
export const LIVE_KIND_COLOR: Record<LiveKind, string> = { manager: '#1d4ed8', contractor: '#047857' }

export function filterLiveRows(rows: LiveMapRow[], filter: LiveFilter, search = ''): LiveMapRow[] {
  const q = search.trim()
  return rows
    .filter((r) => filter === 'all' || r.kind === filter)
    .filter((r) => !q || r.full_name.includes(q) || (r.area_names ?? '').includes(q))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.full_name.localeCompare(b.full_name, 'ar'))
}

export interface LiveSummary { total: number; managers: number; contractors: number; inZone: number; outZone: number; stale: number }
export function summarizeLive(rows: LiveMapRow[]): LiveSummary {
  return rows.reduce<LiveSummary>((s, r) => ({
    total: s.total + 1,
    managers: s.managers + (r.kind === 'manager' ? 1 : 0),
    contractors: s.contractors + (r.kind === 'contractor' ? 1 : 0),
    inZone: s.inZone + (r.in_zone === true ? 1 : 0),
    outZone: s.outZone + (r.in_zone === false ? 1 : 0),
    stale: s.stale + (r.stale ? 1 : 0),
  }), { total: 0, managers: 0, contractors: 0, inZone: 0, outZone: 0, stale: 0 })
}

export interface MarkerStyle { fill: string; ring: string; opacity: number; label: string }
/** لون العلامة: أزرق لمسؤول القسم، أخضر للمتعهد؛ حلقة حمراء خارج الزون؛ باهت عند انقطاع التحديث. */
export function liveMarkerStyle(row: Pick<LiveMapRow, 'kind' | 'in_zone' | 'stale'>): MarkerStyle {
  const fill = LIVE_KIND_COLOR[row.kind]
  const ring = row.in_zone === false ? '#dc2626' : '#ffffff'
  const label = row.stale ? 'منقطع' : row.in_zone === false ? 'خارج الزون' : row.in_zone === true ? 'داخل الزون' : 'بلا زون'
  return { fill, ring, opacity: row.stale ? 0.45 : 1, label }
}

export function zoneStatusLabel(inZone: boolean | null): string {
  return inZone === true ? 'داخل الزون المُسنَد' : inZone === false ? 'خارج الزون المُسنَد' : 'لا زون محدد للمنطقة'
}

/** «منذ كم دقيقة» بالأرقام اللاتينية */
export function minutesAgoLabel(iso: string, now: Date = new Date()): string {
  const m = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'الآن'
  if (m < 60) return `قبل ${m} دقيقة`
  const h = Math.floor(m / 60)
  return `قبل ${h} ساعة و ${m % 60} دقيقة`
}

export function timeHM(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = iso.length <= 8 ? new Date(`1970-01-01T${iso}`) : new Date(iso)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export interface ZoneOccupancy { zone: LiveZoneRow; live: LiveMapRow[]; expected: number }
/** لكل زون: المُسنَدون إليه (مسؤول القسم + المتعهد) ومن منهم يبث الآن. */
export function zoneOccupancy(zones: LiveZoneRow[], rows: LiveMapRow[]): ZoneOccupancy[] {
  return zones.map((zone) => ({
    zone,
    expected: zone.manager_ids.length + (zone.contractor_id ? 1 : 0),
    live: rows.filter((r) => zone.manager_ids.includes(r.user_id) || r.user_id === zone.contractor_id),
  }))
}

export function zoneOf(zones: LiveZoneRow[], row: LiveMapRow): LiveZoneRow | null {
  return zones.find((z) => z.manager_ids.includes(row.user_id) || z.contractor_id === row.user_id) ?? null
}

export const LIVE_MAP_REFRESH_MS = 60_000
