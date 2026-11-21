/**
 * عقد محرّر التخطيط الجغرافي — يُثبّت ما لا يجوز أن ينكسر:
 *   ① ترقيم الأكواد التسلسلي ببادئة التصنيف
 *   ② تطابق الثوابت مع قيود القاعدة (status, kind, prefixes)
 *   ③ وجود المسارين في بوابة العمليات
 *   ④ انتهاء المصادر عند RLS (لا استيراد supabase خارج SDK)
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  KIND_LABEL_AR,
  nextCode,
  STATUS_LABEL_AR,
  STREET_PREFIX,
  type StreetKind,
} from '@sdk/map-planning.sdk'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('① الترقيم التسلسلي', () => {
  it('يبدأ من 0001 في زون فارغ', () => {
    expect(nextCode([], 'STR')).toBe('STR-0001')
  })

  it('يتجاوز أعلى رقم مستخدم', () => {
    expect(nextCode(['STR-0001', 'STR-0007', 'STR-0003'], 'STR')).toBe('STR-0008')
  })

  it('لا يتأثر بأكواد بادئة أخرى', () => {
    expect(nextCode(['SEC-0099', 'LOC-0200'], 'STR')).toBe('STR-0001')
  })

  it('يتجاهل الأكواد غير المطابقة للنمط', () => {
    expect(nextCode(['STR-0005', 'STR-XYZ', 'STR-'], 'STR')).toBe('STR-0006')
  })

  it('يحافظ على صيغة أربع خانات', () => {
    expect(nextCode(['TRC-0099'], 'TRC')).toBe('TRC-0100')
    expect(nextCode(['TRC-9999'], 'TRC')).toBe('TRC-10000')
  })
})

describe('② تطابق الثوابت مع قيود القاعدة', () => {
  const migration = read('supabase/migrations/20261122000000_map_planning_core.sql')

  it('الحالات الثلاث مطابقة لشرط check في القاعدة', () => {
    const keys = Object.keys(STATUS_LABEL_AR).sort()
    expect(keys).toEqual(['archived', 'draft', 'verified'])
    expect(migration).toContain("check (status in ('draft','verified','archived'))")
  })

  it('التصنيفات الأربعة مطابقة', () => {
    expect(Object.keys(KIND_LABEL_AR).sort()).toEqual(['local', 'primary', 'secondary', 'tertiary'])
  })

  it('بادئات الأكواد مطابقة لما تفرضه القاعدة', () => {
    expect(STREET_PREFIX).toEqual({
      primary: 'STR',
      secondary: 'SEC',
      tertiary: 'TRC',
      local: 'LOC',
    })
    // القاعدة تفرض تطابق البادئة مع kind
    expect(migration).toContain('STR')
    expect(migration).toContain('SEC')
    expect(migration).toContain('TRC')
    expect(migration).toContain('LOC')
  })

  it('كل تصنيف له بادئة وتسمية عربية', () => {
    for (const k of Object.keys(KIND_LABEL_AR) as StreetKind[]) {
      expect(STREET_PREFIX[k]).toBeTruthy()
      expect(KIND_LABEL_AR[k].length).toBeGreaterThan(1)
    }
  })
})

describe('③ المسارات موصولة ببوابة العمليات', () => {
  const routes = read('src/portals/ops-room/routes.tsx')

  it('مسار المحرّر موجود', () => {
    expect(routes).toContain("path: 'map-planning'")
  })

  it('مسار الجدول موجود', () => {
    expect(routes).toContain("path: 'map-planning/table'")
  })

  it('الصفحتان تُحمَّلان بتحميل كسول (لا استيراد ثابت)', () => {
    expect(routes).toMatch(/const MapPlanningEditor = lazy\(/)
    expect(routes).toMatch(/const MapPlanningTable = lazy\(/)
  })
})

describe('④ SDK هو النقطة الوحيدة لـ Supabase (ADR 002)', () => {
  it('صفحة المحرّر لا تستورد supabase مباشرة', () => {
    const page = read('src/portals/ops-room/pages/MapPlanning/OpsMapPlanningEditorPage.tsx')
    expect(page).not.toContain("from '@supabase/")
    expect(page).not.toMatch(/supabase\.from\(/)
  })

  it('صفحة الجدول لا تستورد supabase مباشرة', () => {
    const page = read('src/portals/ops-room/pages/MapPlanning/OpsMapPlanningTablePage.tsx')
    expect(page).not.toContain("from '@supabase/")
    expect(page).not.toMatch(/supabase\.from\(/)
  })

  it('الـSDK يستورد من client الموحّد فقط', () => {
    const sdk = read('src/services/map-planning.sdk.ts')
    expect(sdk).toContain("from './client'")
    expect(sdk).not.toContain("from '@supabase/")
  })
})

describe('⑤ ما يُرسل للقاعدة يطابق أعمدة الجداول', () => {
  it('saveStreet يُرسل الحقول التي تقبلها map_streets', () => {
    const sdk = read('src/services/map-planning.sdk.ts')
    for (const col of ['zone_id', 'code', 'name', 'kind', 'path', 'width_m', 'is_bridge']) {
      expect(sdk).toContain(col)
    }
  })

  it('saveAlley يُرسل mahalla_id (إلزامي للأزقة)', () => {
    const sdk = read('src/services/map-planning.sdk.ts')
    expect(sdk).toContain('mahalla_id')
    expect(sdk).toMatch(/linkAlleyMahalla/)
  })
})
