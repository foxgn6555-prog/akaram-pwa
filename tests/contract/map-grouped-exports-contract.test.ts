/**
 * عقد المرحلة ⑤: الفلاتر الموسّعة وأنواع التصدير الثمانية.
 *
 * المبدأ الحاكم: **كل نوع تصدير يُبنى من نفس الصفوف المعروضة.** لا استعلام
 * ثانٍ ولا مسار حساب موازٍ — وإلا اختلف الملف عمّا على الشاشة.
 * والثاني: **النوع بلا بيانات يُعطَّل**، لا ورقة فارغة تُوهم القارئ.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EXPORT_KINDS,
  ALLEYS_ONLY_COLUMNS,
  STREETS_ONLY_COLUMNS,
  UNCERTAIN_COLUMNS,
  alleysOnlyRows,
  buildSummarySheet,
  exportKind,
  extraSheetsFor,
  streetsOnlyRows,
  uncertainRows,
  visitsChart,
} from '@features/map-planning/export-kinds'
import type { GroupedVisitRow } from '@sdk/map-planning.sdk'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const MIG = 'supabase/migrations/20261127000400_map_grouped_filters_exports.sql'

const row = (over: Partial<GroupedVisitRow> = {}): GroupedVisitRow => ({
  zone_id: 'z1', zone_name: 'أرخيته', placeday: '2026-11-23',
  vehicle_id: 'v1', db_number: 'DB4', plate_number: 'TEST-001',
  vehicle_name: 'كابسة', driver_name: 'حسين كاظم راجح', shift: 'morning',
  mahalla_code: 'MHL-0001', mahalla_number: '929', mahalla_name: 'محلة 929',
  street_names: null, street_mahalla_source: 'actual',
  alley_names: '929-41 · 929-42', alley_week_or_num: '41,42',
  alleys_count: 2, streets_count: 0, visits_count: 5,
  confirmed_count: 5, uncertain_count: 0, total_dwell_seconds: 5400,
  first_entered_at: '2026-11-23T06:00:00Z', last_exited_at: '2026-11-23T14:00:00Z',
  avg_dwell_seconds: 1080, max_depth_m: 3.0, ...over,
})

const ctx = { zoneName: 'أرخيته', day: '2026-11-23', filterCount: 0 }

describe('① الأنواع الثمانية موجودة ومسمّاة', () => {
  it('ثمانية أنواع بالضبط', () => {
    expect(EXPORT_KINDS).toHaveLength(8)
  })

  it('المعرّفات المطلوبة كلها موجودة', () => {
    expect(EXPORT_KINDS.map((k) => k.id)).toEqual([
      'sheet', 'alley', 'street', 'driver', 'vehicle', 'mahalla', 'uncertain', 'full',
    ])
  })

  it('كل نوع له تسمية وتلميح عربيان', () => {
    for (const k of EXPORT_KINDS) {
      expect(k.label.length, k.id).toBeGreaterThan(0)
      expect(k.hint.length, k.id).toBeGreaterThan(10)
      expect(k.label).not.toMatch(/^[a-z]/)
    }
  })

  it('معرّف مجهول يعود للنوع المعتمد — لا انفجار', () => {
    expect(exportKind('ghost' as never).id).toBe('sheet')
  })
})

describe('② العدّاد يحمي من الأوراق الفارغة', () => {
  it('كل نوع يعطي صفراً على مصفوفة فارغة', () => {
    for (const k of EXPORT_KINDS) expect(k.count([]), k.id).toBe(0)
  })

  it('نوع الشوارع يعطي صفراً حين لا شوارع', () => {
    expect(exportKind('street').count([row()])).toBe(0)
  })

  it('نوع الأزقة يعطي صفراً حين لا أزقة', () => {
    expect(exportKind('alley').count([row({ alleys_count: 0 })])).toBe(0)
  })

  it('نوع غير المؤكد يعطي صفراً حين الكل مؤكد', () => {
    expect(exportKind('uncertain').count([row()])).toBe(0)
  })

  it('ويعدّ الصفوف حين توجد — لا صفر كاذب', () => {
    expect(exportKind('uncertain').count([row({ uncertain_count: 2 })])).toBe(1)
    expect(exportKind('street').count([row({ streets_count: 3 })])).toBe(1)
  })
})

describe('③ الملخّصات: الأرقام تتطابق أيّاً كان التجميع', () => {
  const r1 = row({ vehicle_id: 'v1', db_number: 'DB1', driver_name: 'أحمد', visits_count: 5, alleys_count: 2, confirmed_count: 5 })
  const r2 = row({ vehicle_id: 'v1', db_number: 'DB1', driver_name: 'أحمد', visits_count: 3, alleys_count: 1, confirmed_count: 2, uncertain_count: 1, mahalla_number: '931' })
  const r3 = row({ vehicle_id: 'v2', db_number: 'DB2', driver_name: 'عمر', visits_count: 4, alleys_count: 3, confirmed_count: 4 })

  it('ملخص السائق يجمع زيارات سائقه عبر الآليات', () => {
    const s = buildSummarySheet('driver', [r1, r2, r3], ctx)
    const ahmed = s.rows.find((x) => x.label === 'أحمد')
    expect(ahmed?.visits).toBe(8)
    expect(ahmed?.vehicles).toBe(1)
  })

  it('ملخص الآلية يجمع أيام عملها', () => {
    const s = buildSummarySheet('vehicle', [r1, r2, r3], ctx)
    const db1 = s.rows.find((x) => x.label === 'DB1')
    expect(db1?.visits).toBe(8)
    expect(db1?.rows).toBe(2)
  })

  it('ملخص المحلة يستبعد صفوف الشوارع (بلا محلة)', () => {
    const streetRow = row({ mahalla_number: null, street_mahalla_source: 'street', streets_count: 2 })
    const s = buildSummarySheet('mahalla', [r1, streetRow], ctx)
    expect(s.rows.every((x) => x.label !== '—')).toBe(true)
    expect(s.rows).toHaveLength(1)
  })

  it('الإجمالي = مجموع الصفوف في كل الأعمدة الرقمية', () => {
    const s = buildSummarySheet('driver', [r1, r2, r3], ctx)
    expect(s.totalRow.visits).toBe(12)
    expect(s.totalRow.alleys).toBe(6)
    expect(s.totalRow.confirmed).toBe(11)
    expect(s.totalRow.uncertain).toBe(1)
  })

  it('الزيارات: مجموع الملخّص = مجموع الصفوف الأصلية (لا فقد ولا تكرار)', () => {
    const input = [r1, r2, r3]
    const expected = input.reduce((a, r) => a + r.visits_count, 0)
    expect(buildSummarySheet('vehicle', input, ctx).totalRow.visits).toBe(expected)
    expect(buildSummarySheet('driver', input, ctx).totalRow.visits).toBe(expected)
  })
})

describe('④ الأوراق الثابتة: الأزقة والشوارع وغير المؤكد', () => {
  it('أرقام الأزقة تبقى نصّاً — «5,7,9» ليست 579', () => {
    const [r] = alleysOnlyRows([row({ alley_week_or_num: '5,7,9' })])
    expect(r?.alleys).toBe('5,7,9')
    expect(typeof r?.alleys).toBe('string')
  })

  it('ورقة الأزقة تستثني صفوف الشوارع', () => {
    expect(alleysOnlyRows([row({ alleys_count: 0, alley_week_or_num: null })])).toHaveLength(0)
  })

  it('ورقة الشوارع تستثني صفوف الأزقة', () => {
    expect(streetsOnlyRows([row()])).toHaveLength(0)
  })

  it('ورقة الشوارع تعرض الأسماء بلا محلة', () => {
    const [r] = streetsOnlyRows([row({ streets_count: 2, street_names: 'شارع كرادة · شارع 60', street_mahalla_source: 'street' })])
    expect(r?.streets).toBe('شارع كرادة · شارع 60')
    expect(Object.keys(r ?? {})).not.toContain('mahalla_number')
  })

  it('ورقة غير المؤكد تحمل نوع المكان صراحةً', () => {
    const rows = uncertainRows([
      row({ uncertain_count: 1 }),
      row({ uncertain_count: 1, street_mahalla_source: 'street', mahalla_number: null, alley_week_or_num: null, street_names: 'شارع 60', streets_count: 1 }),
    ])
    expect(rows[0]?.kind).toBe('زقاق')
    expect(rows[1]?.kind).toBe('شارع')
  })

  it('ترويسات الأعمدة الثابتة عربية', () => {
    for (const c of [...ALLEYS_ONLY_COLUMNS, ...STREETS_ONLY_COLUMNS, ...UNCERTAIN_COLUMNS]) {
      expect(c.header, c.key).not.toMatch(/^[a-z_]+$/)
    }
  })
})

describe('⑤ الرسم البياني', () => {
  it('لا رسم بلا بيانات', () => {
    expect(visitsChart([])).toBeNull()
  })

  it('الرسم مرتّب تنازلياً بزيارات', () => {
    const c = visitsChart([
      row({ db_number: 'DB1', visits_count: 3 }),
      row({ db_number: 'DB2', visits_count: 9 }),
    ])
    expect(c?.data[0]?.value).toBe(9)
    expect(c?.kind).toBe('bar')
  })

  it('الحد الأقصى عشر أعمدة', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      row({ db_number: `DB${i}`, vehicle_id: `v${i}`, visits_count: 15 - i }))
    expect(visitsChart(many)!.data.length).toBeLessThanOrEqual(10)
  })
})

describe('⑥ الأوراق الإضافية لا تُكرّر الورقة الرئيسية', () => {
  it('الأنواع البسيطة بلا أوراق إضافية', () => {
    expect(extraSheetsFor('sheet', [row()], ctx).extraSheets).toHaveLength(0)
    expect(extraSheetsFor('full', [row()], ctx).extraSheets).toHaveLength(0)
  })

  it('غير المؤكد يُلحق ورقة مستقلة', () => {
    const p = extraSheetsFor('uncertain', [row({ uncertain_count: 1 })], ctx)
    expect(p.extraSheets).toHaveLength(1)
    expect(p.extraSheets[0]?.sheetName).toBe('غير المؤكد')
  })

  it('ملخّص الآليات يُلحق الرسم', () => {
    const p = extraSheetsFor('vehicle', [row()], ctx)
    expect(p.charts.length).toBe(1)
  })
})

describe('⑦ الترحيل: الفلاتر الجديدة على الخادم', () => {
  it('فلتر السائق يقارن driver_employee_id', () => {
    expect(read(MIG)).toMatch(/p_driver is null or vg\.driver_employee_id = p_driver/)
  })

  it('فلتر نوع المكان يصفّي place_kind', () => {
    expect(read(MIG)).toMatch(/p_kind is null or place_kind = p_kind/)
  })

  it('استبعاد غير المؤكد = المؤكد فقط — لا عكس للمعنى', () => {
    const sql = read(MIG)
    expect(sql).toMatch(/not coalesce\(p_confirmed, false\) or v\.status = 'confirmed'/)
    // الثغرة التي أُصلحت: كانت تعيد غير المؤكد فقط حين p_confirmed=false
    expect(sql).not.toMatch(/not p_confirmed and v\.status <> 'confirmed'/)
  })

  it('قائمة السائقين تطبّق نفس قيد الزون — لا سائق بلا صف', () => {
    expect(read(MIG)).toMatch(/and \(g\.map_zone_id is null or g\.map_zone_id = p_zone\)/)
  })

  it('قائمة السائقين محمية بـmap_require_reader', () => {
    const sql = read(MIG)
    const driversBlock = sql.slice(sql.indexOf('function public.map_grouped_drivers'))
    expect(driversBlock).toMatch(/perform public\.map_require_reader\(\)/)
  })

  it('نسخة app للسائقين مسحوبة من anon', () => {
    expect(read(MIG)).toMatch(
      /revoke all on function app\.map_grouped_drivers\(uuid,date,date\) from public, anon, authenticated/,
    )
  })
})

describe('⑧ الصفحة: الفلاتر تُمرَّر ولا تُطبَّق محلياً', () => {
  const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapGroupedReportPage.tsx')

  it('خيار «استبعاد الزيارات غير المؤكدة» ظاهر بنصّه', () => {
    expect(src).toContain('استبعاد الزيارات غير المؤكدة')
  })

  it('فلتر السائق يقرأ من useGroupedDrivers لا من الأسطول كاملاً', () => {
    expect(src).toMatch(/useGroupedDrivers\(activeZoneId, from, to\)/)
  })

  it('فلتر نوع المكان موجود بخيارَي الأزقة والشوارع', () => {
    expect(src).toContain('الأزقة فقط')
    expect(src).toContain('الشوارع فقط')
  })

  it('لوحة الأنواع مربوطة بقائمة EXPORT_KINDS', () => {
    expect(src).toMatch(/EXPORT_KINDS\.map/)
  })

  it('التصدير نوع واحد لكل زر — لا خيارات مخفية', () => {
    expect(src).toMatch(/exportExcel\(k\.id\)/)
  })

  it('الزر معطّل حين لا بيانات للنوع', () => {
    expect(src).toMatch(/const disabled = busy \|\| n === 0/)
  })
})
