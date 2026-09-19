/** عقد الحمولات القياسية: ثوابت TS تطابق بذل SQL في ts_unit_capacities (00131) */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { UNIT_CAPACITIES } from '@features/transfer-station/lib/unitCapacities'

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/00131_station_daily_reports.sql'), 'utf8')

describe('عقد الحمولات القياسية للصادرات', () => {
  it('كل وحدة في TS موجودة في البذل بنفس الحمولة', () => {
    for (const [unit, meta] of Object.entries(UNIT_CAPACITIES)) {
      expect(migration, unit).toMatch(new RegExp(`\\('${unit}',\\s*'[^']+',\\s*${meta.tons}\\)`))
    }
  })
  it('القيم المعتمدة: سكسات 10 · نسافات 25 · ناقلة 16', () => {
    expect(UNIT_CAPACITIES.saksat.tons).toBe(10)
    expect(UNIT_CAPACITIES.trips.tons).toBe(25)
    expect(UNIT_CAPACITIES.carrier.tons).toBe(16)
  })
})
