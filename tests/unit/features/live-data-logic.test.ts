import { describe, expect, it } from 'vitest'
import type { LiveSessionRow } from '@sdk/live-tracking.sdk'
import { LIVE_DATA_COLUMNS, buildLiveDataWorkbook, durationText, endText, filterSessions, inZoneText, presetRange, sessionValues, summarizeSessions } from '@features/live-tracking/live-data.logic'

const row = (p: Partial<LiveSessionRow>): LiveSessionRow => ({
  session_id: 's1', user_id: 'u1', kind: 'manager', full_name: 'سعد', sectors: [1], area_names: 'الكرادة', manager_name: null, shift_name: 'صباحي',
  shift_start: '2026-10-18T05:00:00Z', shift_end: '2026-10-18T13:00:00Z', started_at: '2026-10-18T05:10:00Z', last_seen_at: '2026-10-18T07:40:00Z', ended_at: null, end_reason: null,
  first_lat: 33.31, first_lng: 44.36, first_in_zone: true, last_lat: 33.32, last_lng: 44.37, last_in_zone: true, point_count: 11, out_of_zone_count: 0, duration_minutes: 150, ...p,
})

describe('00288 · منطق بيانات البث المباشر', () => {
  it('فلاتر الأيام تُحسب من اليوم', () => {
    const t = new Date(2026, 9, 18)
    expect(presetRange('today', t)).toEqual({ from: '2026-10-18', to: '2026-10-18' })
    expect(presetRange('yesterday', t)).toEqual({ from: '2026-10-17', to: '2026-10-17' })
    expect(presetRange('week', t)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(presetRange('month', t)).toEqual({ from: '2026-09-19', to: '2026-10-18' })
  })
  it('متعهدون مقابل مسؤولون + بحث + ملخص', () => {
    const rows = [row({}), row({ session_id: 's2', user_id: 'u2', kind: 'contractor', full_name: 'كريم', manager_name: 'سعد', first_in_zone: false, out_of_zone_count: 3, ended_at: '2026-10-18T13:00:00Z', end_reason: 'shift_end' })]
    expect(filterSessions(rows, 'contractor').map((r) => r.session_id)).toEqual(['s2'])
    expect(filterSessions(rows, 'manager').map((r) => r.session_id)).toEqual(['s1'])
    expect(filterSessions(rows, 'all', 'كريم')).toHaveLength(1)
    expect(summarizeSessions(rows)).toEqual({ sessions: 2, people: 2, managers: 1, contractors: 1, firstInZone: 1, firstOutZone: 1, outOfZonePoints: 3, active: 1 })
  })
  it('صف الجدول: اسم الحساب، القسم، أول موقع ووقته، داخل/خارج الزون — بأرقام لاتينية', () => {
    const v = sessionValues(row({}))
    expect(v).toHaveLength(LIVE_DATA_COLUMNS.length)
    expect(v[1]).toBe('سعد'); expect(v[2]).toBe('مسؤول قسم'); expect(v[3]).toBe('الكرادة')
    expect(v[6]).toBe('33.310000, 44.360000'); expect(v[7]).toBe('08:10'); expect(v[8]).toBe('داخل الزون'); expect(v[15]).toBe('جارٍ')
    expect(inZoneText(false)).toBe('خارج الزون'); expect(inZoneText(null)).toBe('لا زون محدد')
    expect(durationText(150)).toBe('2 س 30 د'); expect(durationText(5)).toBe('5 د')
    expect(endText({ ended_at: 'x', end_reason: 'manual' })).toBe('أوقفه المستخدم')
  })
  it('مصنّف Excel: ورقة البيانات بعنوان الفلاتر + ملخص حسب الشخص + ورقة الفلاتر', async () => {
    const rows = [row({}), row({ session_id: 's2', started_at: '2026-10-17T05:00:00Z' }), row({ session_id: 's3', user_id: 'u2', kind: 'contractor', full_name: 'كريم', first_in_zone: false, out_of_zone_count: 2 })]
    const wb = await buildLiveDataWorkbook(rows, { from: '2026-10-17', to: '2026-10-18', filter: 'all', search: '' })
    expect(wb.worksheets.map((w) => w.name)).toEqual(['بيانات البث المباشر', 'ملخص حسب الشخص', 'الفلاتر'])
    const ws = wb.worksheets[0]!
    expect(String(ws.getCell(1, 1).value)).toContain('من 2026-10-17 إلى 2026-10-18')
    expect(ws.getRow(3).values).toEqual([undefined, ...LIVE_DATA_COLUMNS])
    expect(ws.rowCount).toBe(3 + rows.length)
    expect(ws.getCell(6, 9).value).toBe('خارج الزون')
    const sum = wb.worksheets[1]!
    expect(sum.getCell(2, 1).value).toBe('كريم'); expect(sum.getCell(2, 6).value).toBe(1)
    expect(sum.getCell(3, 1).value).toBe('سعد'); expect(sum.getCell(3, 4).value).toBe(2)
    expect(sum.getCell(4, 1).value).toBe('الإجمالي'); expect(sum.getCell(4, 4).value).toBe(3)
    expect(wb.worksheets[2]!.getCell(3, 2).value).toBe('الكل')
  })
})
