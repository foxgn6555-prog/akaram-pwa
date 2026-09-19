/**
 * عقد تطابق مرجع أنواع الآليات: ثوابت TS (vehicleKinds.ts) يجب أن تطابق
 * بذل SQL في ts_vehicle_kinds (ميجريشن 00130) — الوزن المسموح لا يختلف بين الطبقتين.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VEHICLE_KINDS, weighingViolation } from '@features/transfer-station/lib/vehicleKinds'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/00130_station_weighing_workflow.sql'),
  'utf8',
)

describe('عقد أنواع الآليات والأوزان المسموحة', () => {
  it('كل نوع في TS موجود في بذل SQL بنفس الحدود', () => {
    for (const meta of VEHICLE_KINDS) {
      const pattern = new RegExp(
        `\\('${meta.kind}',\\s*'[^']+',\\s*${meta.minTons},\\s*${meta.maxTons === null ? 'null' : meta.maxTons},`,
      )
      expect(migration, meta.kind).toMatch(pattern)
    }
  })

  it('البذل يضم سبعة أنواع والثوابت تطابقها عدداً وترتيباً', () => {
    const seeded = migration.match(/\('(compactor_small|compactor_medium|compactor_large|kia|canter|tak|six)',/g) ?? []
    expect(seeded).toHaveLength(7)
    expect(VEHICLE_KINDS).toHaveLength(7)
    expect(VEHICLE_KINDS.map(k => k.sort)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('قاعدة المخالفة: الأقل غير مسموح والأكثر مسموح', () => {
    expect(weighingViolation('compactor_large', 5.9).violates).toBe(true)
    expect(weighingViolation('compactor_large', 6).violates).toBe(false)
    expect(weighingViolation('compactor_large', 9).violates).toBe(false)
    expect(weighingViolation('six', 12).violates).toBe(false)
    expect(weighingViolation('six', 9.5).violates).toBe(true)
    expect(weighingViolation('six', 9.5).deficit).toBe(0.5)
  })
})
