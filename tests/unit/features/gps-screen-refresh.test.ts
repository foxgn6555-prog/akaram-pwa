/** 00379: شاشات GPS تتحدّث كل 5 ثوانٍ (كانت 30) — تحقّق من الثابت ومن استخدامه في كل الاستعلامات الدورية */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GPS_SCREEN_REFRESH_MS } from '@features/gps-lvn/hooks'

describe('gps screen refresh (00379)', () => {
  it('الثابت 5 ثوانٍ ولا refetchInterval آخر بـ 30 ثانية في hooks', () => {
    expect(GPS_SCREEN_REFRESH_MS).toBe(5_000)
    const src = readFileSync('src/features/gps-lvn/hooks.ts', 'utf8')
    expect(src).not.toMatch(/refetchInterval:\s*30_000/)
    expect((src.match(/refetchInterval: GPS_SCREEN_REFRESH_MS/g) ?? []).length).toBeGreaterThanOrEqual(6)
    const page = readFileSync('src/portals/ops-room/pages/Gps/GpsDataPage.tsx', 'utf8')
    expect(page).toContain('كل 5 ثوانٍ'); expect(page).not.toContain('كل 30 ثانية')
  })
})
