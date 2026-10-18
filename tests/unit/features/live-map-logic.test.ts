import { describe, expect, it } from 'vitest'
import type { LiveMapRow, LiveZoneRow } from '@sdk/live-tracking.sdk'
import { filterLiveRows, liveMarkerStyle, minutesAgoLabel, summarizeLive, timeHM, zoneOccupancy, zoneOf, zoneStatusLabel } from '@features/live-tracking/live-map.logic'

const row = (p: Partial<LiveMapRow>): LiveMapRow => ({
  session_id: 's', user_id: 'u', kind: 'manager', full_name: 'أحمد', sectors: [1], area_names: 'الكرادة', shift_name: 'صباحي', shift_start: '08:00:00', shift_end: '16:00:00',
  started_at: '2026-10-18T05:00:00Z', last_seen_at: '2026-10-18T05:30:00Z', latitude: 33.3, longitude: 44.4, accuracy_m: 10, in_zone: true, point_count: 3, out_of_zone_count: 0, stale: false, ...p,
})
const zone = (p: Partial<LiveZoneRow>): LiveZoneRow => ({ id: 'z', name: 'زون', color: null, polygon: [], sector_id: 1, area_name: 'الكرادة', parent_sector: null, manager_ids: [], manager_names: null, contractor_id: null, contractor_name: null, ...p })

describe('00287 · منطق خريطة البث', () => {
  const rows = [row({ user_id: 'm1', kind: 'manager', full_name: 'سعد' }), row({ user_id: 'c1', kind: 'contractor', full_name: 'كريم', in_zone: false }), row({ user_id: 'm2', kind: 'manager', full_name: 'أحمد', stale: true, in_zone: null })]
  it('الفلاتر: الكل / المتعهدون / مسؤولو الأقسام + بحث بالاسم', () => {
    expect(filterLiveRows(rows, 'all')).toHaveLength(3)
    expect(filterLiveRows(rows, 'contractor').map((r) => r.user_id)).toEqual(['c1'])
    expect(filterLiveRows(rows, 'manager').map((r) => r.user_id)).toEqual(['m2', 'm1'])
    expect(filterLiveRows(rows, 'all', 'كريم').map((r) => r.user_id)).toEqual(['c1'])
  })
  it('الملخص يحسب الأنواع وداخل/خارج الزون والمنقطع', () => {
    expect(summarizeLive(rows)).toEqual({ total: 3, managers: 2, contractors: 1, inZone: 1, outZone: 1, stale: 1 })
  })
  it('لون العلامة حسب النوع وحلقة حمراء خارج الزون وباهت عند الانقطاع', () => {
    expect(liveMarkerStyle({ kind: 'manager', in_zone: true, stale: false })).toMatchObject({ fill: '#1d4ed8', ring: '#ffffff', opacity: 1, label: 'داخل الزون' })
    expect(liveMarkerStyle({ kind: 'contractor', in_zone: false, stale: false })).toMatchObject({ fill: '#047857', ring: '#dc2626', label: 'خارج الزون' })
    expect(liveMarkerStyle({ kind: 'manager', in_zone: null, stale: true })).toMatchObject({ opacity: 0.45, label: 'منقطع' })
    expect(zoneStatusLabel(null)).toBe('لا زون محدد للمنطقة')
  })
  it('شاغلو الزون: المُسنَدون مقابل من يبث فعلاً', () => {
    const zs = [zone({ id: 'a', manager_ids: ['m1'], contractor_id: 'c1' }), zone({ id: 'b', sector_id: 2, manager_ids: ['m9'] })]
    const occ = zoneOccupancy(zs, rows)
    expect(occ[0]).toMatchObject({ expected: 2 }); expect(occ[0]!.live.map((r) => r.user_id).sort()).toEqual(['c1', 'm1'])
    expect(occ[1]).toMatchObject({ expected: 1, live: [] })
    expect(zoneOf(zs, rows[1]!)?.id).toBe('a'); expect(zoneOf(zs, rows[2]!)).toBeNull()
  })
  it('الوقت بأرقام لاتينية و«منذ»', () => {
    expect(timeHM('08:05:00')).toBe('08:05'); expect(timeHM(null)).toBe('—')
    const now = new Date('2026-10-18T06:00:00Z')
    expect(minutesAgoLabel('2026-10-18T05:59:40Z', now)).toBe('الآن')
    expect(minutesAgoLabel('2026-10-18T05:30:00Z', now)).toBe('قبل 30 دقيقة')
    expect(minutesAgoLabel('2026-10-18T03:50:00Z', now)).toBe('قبل 2 ساعة و 10 دقيقة')
  })
})
