/** 00376: لا قوائم شفت ثابتة (صباحي/مسائي/ليلي) في الكراج/الآليات/مسؤولي الأقسام/المتعهدين — كلها من شفتات HR */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p })
const scope = [
  ...walk('src/portals/central-garage'), ...walk('src/features/central-garage'),
  'src/portals/it/pages/UserManagement/CreateUser.tsx', 'src/portals/it/pages/UserManagement/UserDetail.tsx',
  'src/features/contractors/format.ts', 'src/features/sector-manager/format.ts', 'src/features/sector/types/index.ts', 'src/features/sector/schemas/sector.schema.ts',
].filter((p) => /\.(ts|tsx)$/.test(p))

describe('00376 hr shifts platform-wide (part 1)', () => {
  it('لا <option value="morning"> ولا z.enum للشفت في النطاق', () => {
    const offenders = scope.filter((p) => { const s = readFileSync(p, 'utf8'); return /<option value="morning">/.test(s) || /z\.enum\(\[\s*'morning'/.test(s) || /\['morning',\s*'evening',\s*'night'\]\s*as\s+GarageShift/.test(s) })
    expect(offenders).toEqual([])
  })
  it('الدالة الطرفية admin-users تتحقق من شفت مسؤول القسم عبر hr_shifts لا قائمة ثابتة', () => {
    const s = readFileSync('supabase/functions/admin-users/index.ts', 'utf8')
    expect(s).toMatch(/from\('hr_shifts'\)\.select\('code'\)/)
    expect(s).not.toMatch(/\['morning', 'evening', 'night'\]\.includes/)
  })
  it('الميجريشن 00320: shift_options + التحقق عبر hr_shifts في دوال الكراج والاستيراد', () => {
    const s = readFileSync('supabase/migrations/00320_hr_shifts_platform.sql', 'utf8')
    for (const fn of ['garage_add_vehicle', 'garage_assign_driver', 'garage_set_vehicle_shift_assignment', 'garage_search_vehicles', 'garage_record_shift_departure', 'fleet_vehicles_import', 'shift_options']) expect(s).toContain(`function public.${fn}(`.toLowerCase())
    expect(s).toContain('app.shift_code_valid(p_shift)')
    expect(s).toContain('app.shift_resolve(t)')
    expect(s).toContain('trg_enforce_shift_code')
    expect(s).toContain('HR_SHIFT_IN_USE')
  })
})
