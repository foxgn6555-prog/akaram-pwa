/**
 * عقد التغطية والإحصاء (المرحلة ⑥) — يُثبّت:
 *   ① الحالة الثلاثية: مؤكد / غير مؤكد / لم تُدخل — بلا «صفر كاذب»
 *   ② النسب الثلاث منفصلة لا مخلوطة
 *   ③ يوم بغداد لا يوم UTC
 *   ④ الصفحة لا تُخفي أي تصنيف، والآليات خارج الأسطول تظهر
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { placeCoverageState, VISIT_STATUS_LABEL_AR } from '@sdk/map-planning.sdk'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const SQL_DAY = read('supabase/migrations/20261122000800_map_visits_baghdad_day.sql')
const SQL_STATS = read('supabase/migrations/20261122000900_map_coverage_stats.sql')

describe('① الحالة الثلاثية للمكان', () => {
  it('غير مُزار ⇒ لم تُدخل (لا صفر تغطية)', () => {
    expect(placeCoverageState({ visited: false, confirmed: false })).toBe('not_entered')
    expect(VISIT_STATUS_LABEL_AR.not_entered).toBe('لم تُدخل')
  })

  it('زِير بلا تحقق الشرط ⇒ غير مؤكد', () => {
    expect(placeCoverageState({ visited: true, confirmed: false })).toBe('uncertain')
  })

  it('زِير بتحقق الشرط ⇒ مؤكد', () => {
    expect(placeCoverageState({ visited: true, confirmed: true })).toBe('confirmed')
  })

  it('ترتيب الأولوية صريح: غير المؤكد لا يُحصى مؤكداً', () => {
    // لو قُلب الشرط لأصبح كل زيارة «مؤكدة» — وهذا الفرق بين تقرير وتضليل
    expect(placeCoverageState({ visited: true, confirmed: false })).not.toBe('confirmed')
  })
})

describe('② النسب الثلاث منفصلة في القاعدة', () => {
  it('rollup يُرجع coverage_pct وconfirmed_pct وuncertain_pct منفصلة', () => {
    expect(SQL_STATS).toMatch(/coverage_pct numeric, confirmed_pct numeric, uncertain_pct numeric/)
  })

  it('rollup يحسب «لم تُدخل» صراحةً', () => {
    expect(SQL_STATS).toMatch(/places_not_entered integer/)
    expect(SQL_STATS).toMatch(/where not visited/)
  })

  it('by_place لا يحذف الأماكن غير المُزارة (left join من places)', () => {
    // نقطع عند تعريف الدالة نفسه (create ...) لا عند أول ذكر في التعليق
    const start = SQL_STATS.indexOf('create or replace function app.map_coverage_by_place')
    const end = SQL_STATS.indexOf('create or replace function app.map_coverage_by_vehicle')
    expect(start).toBeGreaterThan(-1)
    const fn = SQL_STATS.slice(start, end)
    expect(fn).toMatch(/left join v on v\.place_kind = p\.kind/)
  })

  it('قائمة «لم تُزر» مرتبة بالطول: الأهم أولاً', () => {
    expect(SQL_STATS).toMatch(/order by c\.length_m desc nulls last/)
  })
})

describe('③ يوم بغداد لا يوم UTC', () => {
  it('دالة اليوم البغدادي موجودة وتستعمل Asia/Baghdad', () => {
    expect(SQL_DAY).toMatch(/create or replace function app\.map_baghdad_day/)
    expect(SQL_DAY).toMatch(/at time zone 'Asia\/Baghdad'/)
  })

  it('المحرّك يستعملها في placeday وليس at time zone UTC', () => {
    expect(SQL_DAY).toMatch(/app\.map_baghdad_day\(d\.entered_at\)/)
    const engine = SQL_DAY.slice(SQL_DAY.indexOf('create or replace function app.map_build_visits'))
    expect(engine).not.toMatch(/placeday[\s\S]{0,200}at time zone 'UTC'/)
  })

  it('التغطية تقرأ اليوم البغدادي', () => {
    expect(SQL_DAY).toMatch(/app\.map_baghdad_day\(v\.entered_at\) = p_day/)
  })

  it('حدود اليوم تبدأ 21:00 UTC (00:00 بغداد)', () => {
    expect(SQL_DAY).toMatch(/p_day::timestamp at time zone 'Asia\/Baghdad'/)
  })
})

describe('④ التقارير لا تُخفي أحداً', () => {
  it('الآليات خارج الأسطول تظهر (in_fleet)', () => {
    expect(SQL_STATS).toMatch(/in_fleet boolean/)
    expect(SQL_STATS).toMatch(/archived_at is null\) as in_fleet/)
  })

  it('اتجاه الأيام لا يُسقط الأيام الفارغة', () => {
    expect(SQL_STATS).toMatch(/from generate_series\(\(select first_day from span\)/)
    expect(SQL_STATS).toMatch(/coalesce\(pd\.visited, 0\)/)
  })

  it('الصفحة تعرض التبويبات الأربعة', () => {
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapCoveragePage.tsx')
    for (const k of ["'unvisited'", "'uncertain'", "'confirmed'", "'vehicles'"]) {
      expect(src).toContain(k)
    }
  })

  it('الصفحة تُصرّح بأن الزون بلا تخطيط ليس صفر تغطية', () => {
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapCoveragePage.tsx')
    expect(src).toMatch(/لا أنها صفر|غير قابلة للحساب/)
  })

  it('شفت الأسطول يُترجم من hr_shifts الحيّ لا من قائمة ثابتة', () => {
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapCoveragePage.tsx')
    // المصدر الحيّ هو المطلوب: يشمل الشفتات المرنة التي كانت تُعرض برمزها الخام
    expect(src).toMatch(/useShiftLabel\(\)/)
    expect(src).toMatch(/shiftLabel\(v\.shift\)/)
    // ولا يعود إلى القاموس الثابت المهجور
    expect(src).not.toMatch(/SHIFT_LABEL_AR/)
  })

  it('المسار مسجَّل ويستخدم ExecPageHeader', () => {
    expect(read('src/portals/ops-room/routes.tsx')).toMatch(/'map-planning\/coverage'/)
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapCoveragePage.tsx')
    // لا نُثبّت موضع `icon` على سطر واحد — Prettier قد يكسر الوسائط على أسطر
    expect(src).toMatch(/<ExecPageHeader\b/)
    expect(src).toMatch(/icon="[a-z-]+"/)
    expect(src).not.toMatch(/<h1\b/)
  })
})
