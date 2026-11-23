/**
 * عقد التقرير المُجمَّع (20261127000200) — «ورقة الشركة».
 *
 * المبدأ: صفٌّ واحد لكل (آلية × يوم × محلة)، والأزقة أرقام مفصولة بفاصلة،
 * والملاحظات تحمل الشوارع. و**لا يُخفى مصدر رقم المحلة**: الشوارع لا تحمل
 * محلة في القاعدة، فالمشتقّ يُوسَم «مشتقّة» بدل تمريره كأنه مؤكد.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  GROUPED_COLUMNS,
  groupedReportColumns,
  groupedTitle,
  groupedTotalRow,
  notesOf,
  sourceBadge,
  toGroupedRows,
} from '@features/map-planning/grouped-export'
import type { GroupedVisitRow } from '@sdk/map-planning.sdk'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const MIG = 'supabase/migrations/20261127000200_map_vehicle_zone_report.sql'

const row = (over: Partial<GroupedVisitRow> = {}): GroupedVisitRow => ({
  zone_id: 'z1', zone_name: 'أرخيته', placeday: '2026-11-23',
  vehicle_id: 'v1', db_number: 'DB4', plate_number: 'TEST-001',
  vehicle_name: 'كابسة', driver_name: 'حسين كاظم راجح', shift: 'morning',
  mahalla_code: 'MHL-0001', mahalla_number: '903', mahalla_name: 'محلة 903',
  street_names: 'شارع كرادة داخل', street_mahalla_source: 'derived',
  alley_names: '903-41 · 903-42', alley_week_or_num: '41,42',
  alleys_count: 2, streets_count: 1, visits_count: 5,
  confirmed_count: 5, uncertain_count: 0, total_dwell_seconds: 5400,
  first_entered_at: '2026-11-23T06:00:00Z', last_exited_at: '2026-11-23T14:00:00Z',
  avg_dwell_seconds: 1080, max_depth_m: 3.0, ...over,
})

const ctx = { zoneName: 'أرخيته', shiftLabel: (s: string | null | undefined) => s ?? '—', day: '2026-11-23' }

describe('① شكل الورقة المعتمدة', () => {
  it('أعمدة الورقة موجودة بالترتيب المنطقي', () => {
    const ids = GROUPED_COLUMNS.map((c) => c.id)
    // الترتيب كما في الورقة: ت · رقم الآلية · السائق · المركز البلدي · المحلة · الأزقة
    expect(ids.indexOf('seq')).toBeLessThan(ids.indexOf('db_number'))
    expect(ids.indexOf('db_number')).toBeLessThan(ids.indexOf('driver_name'))
    expect(ids.indexOf('driver_name')).toBeLessThan(ids.indexOf('zone_name'))
    expect(ids.indexOf('zone_name')).toBeLessThan(ids.indexOf('mahalla_number'))
    expect(ids.indexOf('mahalla_number')).toBeLessThan(ids.indexOf('alleys'))
  })

  it('الترويسات عربية مطابقة للورقة', () => {
    const h = Object.fromEntries(GROUPED_COLUMNS.map((c) => [c.id, c.header]))
    expect(h.db_number).toBe('رقم الآلية')
    expect(h.driver_name).toBe('اسم السائق')
    expect(h.zone_name).toBe('المركز البلدي')
    expect(h.mahalla_number).toBe('رقم المحلة')
    expect(h.alleys).toBe('الازقة')
    expect(h.notes).toBe('الملاحظات')
  })

  it('العنوان يحمل اليوم والزون', () => {
    const t = groupedTitle('2026-11-19', 'أرخيته')
    expect(t).toContain('2026-11-19')
    expect(t).toContain('أرخيته')
    expect(t).toContain('جزيرة الاكرام')
  })
})

describe('② لا يُخفى مصدر المحلة', () => {
  it('المشتقّة تُوسَم — لا تُمرَّر كأنها مؤكدة', () => {
    expect(sourceBadge(row({ street_mahalla_source: 'derived' }))).toBe('مشتقّة')
  })

  it('المؤكدة بلا وسم (لا ضجيج بصري)', () => {
    expect(sourceBadge(row({ street_mahalla_source: 'actual' }))).toBeNull()
  })

  it('المجهولة تُوسَم «غير معروفة» — لا اختراع رقم', () => {
    expect(sourceBadge(row({ street_mahalla_source: 'unknown' }))).toBe('غير معروفة')
  })

  it('الملاحظات تنصّ على أن محلة الشارع مشتقّة', () => {
    expect(notesOf(row({ street_mahalla_source: 'derived' }))).toContain('مشتقّة')
  })

  it('الملاحظات لا تزعم اشتقاقاً حين المحلة مؤكدة', () => {
    expect(notesOf(row({ street_mahalla_source: 'actual' }))).not.toContain('مشتقّة')
  })

  it('أعمدة «مصدر المحلة» موجود — الشفافية عمود لا تعليق', () => {
    expect(GROUPED_COLUMNS.some((c) => c.id === 'mahalla_source')).toBe(true)
  })
})

describe('③ الأزقة: أرقام للورقة وأسماء للتدقيق', () => {
  it('الورقة تعرض أرقام الأزقة وحدها', () => {
    const [r] = toGroupedRows([row()], ctx)
    expect(r?.alleys).toBe('41,42')
  })

  it('الأسماء الكاملة متاحة في العمود الإضافي', () => {
    const [r] = toGroupedRows([row()], ctx)
    expect(r?.alley_names).toBe('903-41 · 903-42')
  })

  it('الارقام تبقى نصّاً — «5,7,9» ليست 579', () => {
    const [r] = toGroupedRows([row({ alley_week_or_num: '5,7,9' })], ctx)
    expect(typeof r?.alleys).toBe('string')
    expect(r?.alleys).toBe('5,7,9')
  })
})

describe('④ الرقم المتسلسل والصفوف', () => {
  it('`seq` يُحسب عند التصدير لا يُخزَّن', () => {
    const rows = toGroupedRows([row(), row({ place_id: undefined } as never), row()], ctx)
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3])
  })

  it('عدد الصفوف ثابت — لا صف يُسقَط بصمت', () => {
    const input = [row(), row({ mahalla_number: null, street_mahalla_source: 'unknown' })]
    expect(toGroupedRows(input, ctx)).toHaveLength(2)
  })

  it('صف الإجمالي يجمع الزيارات لا المكوث النصّي', () => {
    const t = groupedTotalRow([row({ visits_count: 3 }), row({ visits_count: 4 })])
    expect(t?.visits).toBe(7)
  })

  it('مصفوفة فارغة ⇒ لا صف إجمالي (لا «0» كاذب)', () => {
    expect(groupedTotalRow([])).toBeUndefined()
  })
})

describe('⑤ تعريف الأعمدة لـ Excel', () => {
  it('كل أعمدة الورقة تُترجم إلى ReportColumn', () => {
    const cols = groupedReportColumns()
    expect(cols.length).toBe(GROUPED_COLUMNS.length)
    for (const c of cols) {
      expect(c.header.length).toBeGreaterThan(0)
      expect(c.key.length).toBeGreaterThan(0)
    }
  })

  it('ترويسة العمود تُطابق ترويسة الشاشة — مصدر واحد', () => {
    const cols = groupedReportColumns()
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c.header]))
    expect(byKey.alleys).toBe('الازقة')
    expect(byKey.mahalla_number).toBe('رقم المحلة')
  })

  it('مجموعة أعمدة مختارة تعمل — التصدير المختصر', () => {
    const cols = groupedReportColumns(['db_number', 'driver_name'])
    expect(cols.map((c) => c.key)).toEqual(['db_number', 'driver_name'])
  })

  it('معرّف عمود مجهول يُتجاهل بلا انفجار', () => {
    const cols = groupedReportColumns(['db_number', 'ghost'])
    expect(cols.map((c) => c.key)).toEqual(['db_number'])
  })
})

describe('⑥ الترحيل: الزون والمفتاح', () => {
  it('عمود map_zone_id مضاف بمفتاح أجنبي', () => {
    const sql = read(MIG)
    expect(sql).toMatch(/add column if not exists map_zone_id uuid references public\.map_zones\(id\)/)
  })

  it('الربط اختياري — NULL لا يكسر شيئاً', () => {
    expect(read(MIG)).toMatch(/on delete set null/)
  })

  it('التعبئة من القطاع تجري فقط حيث الربط فارغ (idempotent)', () => {
    expect(read(MIG)).toMatch(/and g\.map_zone_id is null/)
  })

  it('فهرس على العمود للتقارير المفلوترة', () => {
    expect(read(MIG)).toMatch(/create index if not exists garage_vehicles_map_zone_idx/)
  })
})

describe('⑦ الترحيل: التجميع والقيد', () => {
  it('صف واحد لكل (آلية × يوم × محلة) — group by مطابق', () => {
    const sql = read(MIG)
    expect(sql).toMatch(/group by fm\.placeday, fm\.vehicle_id,/)
  })

  it('الزقاق بمحلته الحقيقية والشارع بمشتقّته — لا خلط', () => {
    const sql = read(MIG)
    expect(sql).toMatch(/when f\.place_kind = 'alley' then f\.mahalla_number else f\.derived_number end/)
    expect(sql).toMatch(/when f\.place_kind = 'alley' then 'actual'/)
  })

  it('رقم الزقاق يُستخرج بدالة واحدة لا بتكرار', () => {
    expect(read(MIG)).toMatch(/create or replace function app\.map_alley_short/)
  })

  it('الفلاتر الأربعة على الخادم: آلية · شفت · حالة · محلة', () => {
    const sql = read(MIG)
    expect(sql).toMatch(/p_vehicle is null or v\.vehicle_id = p_vehicle/)
    expect(sql).toMatch(/p_shift is null or eff_shift = p_shift/)
    expect(sql).toMatch(/p_status is null or v\.status = p_status/)
    expect(sql).toMatch(/p_mahalla is null or eff_number = p_mahalla/)
  })

  it('يوم بغداد لا UTC — نفس عقد المحرّك', () => {
    expect(read(MIG)).toMatch(/at time zone 'Asia\/Baghdad'/)
  })
})

describe('⑧ الصلاحيات والغلاف', () => {
  it('القارئ فقط — لا anon على الدالة العامة', () => {
    const sql = read(MIG)
    expect(sql).toMatch(/revoke all on function public\.map_vehicle_visits_grouped[^;]+from public, anon;/)
    expect(sql).toMatch(/perform public\.map_require_reader\(\)/)
  })

  it('الغلاف العام موجود ويعيد كل الأعمدة', () => {
    expect(read(MIG)).toMatch(/create or replace function public\.map_vehicle_visits_grouped/)
  })
})

describe('⑨ الصفحة والمسار', () => {
  it('المسار مسجَّل', () => {
    expect(read('src/portals/ops-room/routes.tsx')).toMatch(/map-planning\/grouped-report/)
  })

  it('مدخل التنقّل موجود ومترجم', () => {
    expect(read('src/config/portals.config.ts')).toMatch(/nav\.map_grouped_report/)
    const ar = JSON.parse(read('src/i18n/ar/sidebar.json')) as { nav: Record<string, string> }
    expect(ar.nav.map_grouped_report).toBeTruthy()
    expect(ar.nav.map_grouped_report).not.toMatch(/^nav\./)
  })

  it('الصفحة تستخدم ExecPageHeader بلا h1', () => {
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapGroupedReportPage.tsx')
    expect(src).toMatch(/<ExecPageHeader\s+icon=["{]/)
    expect(src).not.toMatch(/<h1\b/)
  })

  it('الصفحة لا تستورد supabase مباشرة — RLS عند الحد', () => {
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapGroupedReportPage.tsx')
    expect(src).not.toMatch(/from '.*\/client'/)
    expect(src).toMatch(/@features\/map-planning\/hooks\/useMapPlanning/)
  })

  it('الفلاتر تُمرَّر للخادم لا تُطبَّق في المتصفح', () => {
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapGroupedReportPage.tsx')
    expect(src).toMatch(/useVehicleVisitsGrouped\(\s*activeZoneId, from, to, filters,?\s*\)/)
    // لا فلترة صفوف محلية على rows
    expect(src).not.toMatch(/rows\.filter\(\(r\) => r\.shift/)
  })

  it('التصدير والطباعة معطَّلان حين لا بيانات', () => {
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapGroupedReportPage.tsx')
    expect(src).toMatch(/disabled=\{busy \|\| rows\.length === 0\}/)
  })
})

describe('⑩ زون الآلية — «الأرخيته فقط» (طلب المستخدم الحرفي)', () => {
  it('الدالة تقبل مفتاح احترام الزون', () => {
    expect(read(MIG)).toMatch(/p_respect_vehicle_zone boolean default true/)
  })

  it('الافتراضي = احترام الزون (لا يظهر في زون آخر)', () => {
    const sql = read(MIG)
    expect(sql).toMatch(/and \(not p_respect_vehicle_zone/)
    expect(sql).toMatch(/or vg\.map_zone_id is null/)
    expect(sql).toMatch(/or vg\.map_zone_id = p_zone\)/)
  })

  it('آلية بلا زون لا تُحجب — لا نمنع بيانات بلا تصنيف', () => {
    // الشرط `vg.map_zone_id is null` يعني: بلا ربط ⇒ تظهر دائماً
    expect(read(MIG)).toMatch(/or vg\.map_zone_id is null/)
  })

  it('يمكن تعطيل القيد صراحةً — السلوك القديم متاح', () => {
    expect(read(MIG)).toMatch(/p_respect_vehicle_zone boolean default true/)
    expect(read(MIG)).toMatch(/not p_respect_vehicle_zone/)
  })

  it('الغلاف العام يمرّر القيد لا يُسقطه', () => {
    const sql = read(MIG)
    expect(sql).toMatch(/app\.map_vehicle_visits_grouped\(\s*p_zone, p_from, p_to, p_vehicle, p_shift, p_status, p_mahalla, p_respect_vehicle_zone\)/)
  })

  it('الـ SDK يرسل القيد وافتراضيه true', () => {
    const sdk = read('src/services/map-planning.sdk.ts')
    expect(sdk).toMatch(/p_respect_vehicle_zone: input\.respectVehicleZone \?\? true/)
  })

  it('الـ hook يُضمّن القيد في مفتاح الكاش — لا تُعرض نتيجة مفلترة بغيرها', () => {
    const hook = read('src/features/map-planning/hooks/useMapPlanning.ts')
    expect(hook).toMatch(/respectVehicleZone \? 'rz1' : 'rz0'/)
  })

  it('الواجهة تُظهر مفتاح التحكم صراحةً للمستخدم', () => {
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapGroupedReportPage.tsx')
    expect(src).toContain('حصر النتائج في زون الآلية')
    expect(src).toMatch(/filters\.respectVehicleZone !== false/)
  })
})

describe('⑪ لا مخرج خلفي لتجاوز الصلاحية', () => {
  it('نسخة app مسحوبة من anon أيضاً — لا استدعاء مباشر عبر PostgREST', () => {
    const sql = read(MIG)
    // الغلاف العام وحده يحمي، لكن PostgREST يستدعي app.* مباشرة.
    expect(sql).toMatch(
      /revoke all on function app\.map_vehicle_visits_grouped\([^)]+\)\s*\n?\s*from public, anon, authenticated;/
    )
  })

  it('service_role مسموح — المهام الخلفية والتصدير المدفوع', () => {
    expect(read(MIG)).toMatch(/to authenticated, service_role;/)
  })
})
