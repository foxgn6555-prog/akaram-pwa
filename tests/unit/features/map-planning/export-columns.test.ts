/**
 * منطق الأعمدة القابلة للاختيار والترتيب — يُختبر نقياً بلا قاعدة ولا DOM.
 * الحالات التي تُفشل التطبيقات عادةً: تفضيل محفوظ من نسخة أقدم (عمود مُزال)،
 * إخفاء كل الأعمدة، تكرار المعرّفات، وترتيب سالب.
 */
import { describe, expect, it } from 'vitest'
import {
  baghdadDay,
  baghdadTime,
  columnsFor,
  defaultSelection,
  dwellText,
  moveColumn,
  resolveColumns,
  toReportColumns,
  toReportRows,
  toggleColumn,
  totalRow,
  type ColumnContext,
  type Row,
} from '@features/map-planning/export-columns'

const ctx: ColumnContext = { zoneName: 'الرياض', shiftLabel: (s) => (s === 'morning' ? 'صباحي' : s ?? '—') }

const row = (over: Partial<Row> = {}): Row => ({
  place_kind: 'street', place_code: 'STR-0001', place_name: 'شارع أ',
  mahalla_code: null, length_m: 100, width_m: 10,
  visited: true, confirmed: true, visits_count: 2, vehicles_count: 1,
  total_dwell_seconds: 420, first_entered_at: '2026-11-22T20:00:00Z',
  last_exited_at: '2026-11-22T20:07:00Z', ...over,
})

describe('① الترتيب الافتراضي معلن وثابت', () => {
  it('أحد عشر عموداً في تقرير الأماكن', () => {
    expect(columnsFor('places')).toHaveLength(12)
  })

  it('الترتيب الافتراضي يبدأ بالنوع وينتهي بآخر زيارة', () => {
    const ids = columnsFor('places').map((c) => c.id)
    expect(ids[0]).toBe('place_kind')
    expect(ids[10]).toBe('last_visit')
    expect(ids[11]).toBe('manager')
    // عمود المسؤول يُطبع نصاً كما هو (يأتي من القاطع)، ويُترك فارغاً بلا مسؤول
    const col = columnsFor('places').find((c) => c.id === 'manager')!
    expect(col.header).toBe('مسؤول القسم')
    const c0 = { zoneName: 'الرياض', shiftLabel: (x: string | null | undefined) => x ?? '—' }
    const base = {
      place_kind: 'street' as const, place_code: 'STR-1', place_name: 'شارع', mahalla_code: null,
      length_m: 100, width_m: 8, status_ar: 'مقبول', visited: false, confirmed: false,
      visits_count: 0, vehicles_count: 0, total_dwell_seconds: 0,
      first_entered_at: null, last_exited_at: null,
    }
    expect(col.value({ ...base, department_manager_names: 'علي المسائي، أحمد الصباحي' }, c0))
      .toBe('علي المسائي، أحمد الصباحي')
    expect(col.value({ ...base }, c0)).toBeNull()
  })

  it('أعمدة سجل الزيارات منفصلة عن أعمدة الأماكن', () => {
    expect(columnsFor('visits')).toHaveLength(10)
    const placeIds = new Set(columnsFor('places').map((c) => c.id))
    for (const c of columnsFor('visits')) expect(placeIds.has(c.id)).toBe(false)
  })

  it('كل عمود له ترويسة عربية غير فارغة', () => {
    for (const c of [...columnsFor('places'), ...columnsFor('visits')]) {
      expect(c.header.trim().length).toBeGreaterThan(1)
    }
  })

  it('المعرّفات فريدة عبر الصنفين', () => {
    const ids = [...columnsFor('places'), ...columnsFor('visits')].map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('② resolveColumns — يقاوم تفضيلاً محفوظاً فاسداً', () => {
  it('بلا تفضيل ⇒ كل الأعمدة', () => {
    expect(resolveColumns('places', null)).toHaveLength(12)
    expect(resolveColumns('places', [])).toHaveLength(12)
  })

  it('يحترم الترتيب المحفوظ', () => {
    const sel = [
      { id: 'place_name', visible: true, order: 0 },
      { id: 'place_code', visible: true, order: 1 },
    ]
    expect(resolveColumns('places', sel).map((c) => c.id)).toEqual(['place_name', 'place_code'])
  })

  it('يتجاهل عموداً مجهولاً بقي من نسخة أقدم (لا عمود شبح)', () => {
    const sel = [
      { id: 'column_removed_last_year', visible: true, order: 0 },
      { id: 'place_code', visible: true, order: 1 },
    ]
    expect(resolveColumns('places', sel).map((c) => c.id)).toEqual(['place_code'])
  })

  it('يستبعد المخفي', () => {
    const sel = [
      { id: 'place_code', visible: false, order: 0 },
      { id: 'place_name', visible: true, order: 1 },
    ]
    expect(resolveColumns('places', sel).map((c) => c.id)).toEqual(['place_name'])
  })

  it('لا يُكرّر عموداً مكرّرة في التفضيل', () => {
    const sel = [
      { id: 'place_code', visible: true, order: 0 },
      { id: 'place_code', visible: true, order: 1 },
    ]
    expect(resolveColumns('places', sel)).toHaveLength(1)
  })

  it('عمود من الصنف الآخر لا يتسرّب', () => {
    const sel = [{ id: 'v_vehicle', visible: true, order: 0 }]
    expect(resolveColumns('places', sel)).toHaveLength(0)
  })
})

describe('③ moveColumn — إعادة الترتيب', () => {
  const base = defaultSelection('places')

  it('نقل عمود إلى الأمام يعيد ترقيم order من صفر', () => {
    const moved = moveColumn(base, 'place_name', 0)
    expect(moved[0]?.id).toBe('place_name')
    expect(moved.map((s) => s.order)).toEqual(moved.map((_, i) => i))
  })

  it('نقل إلى موضع أبعد من النهاية يُقصّ ولا ينفجر', () => {
    const moved = moveColumn(base, 'place_kind', 999)
    expect(moved[moved.length - 1]?.id).toBe('place_kind')
  })

  it('نقل إلى موضع سالب ⇒ الأول', () => {
    const moved = moveColumn(base, 'last_visit', -5)
    expect(moved[0]?.id).toBe('last_visit')
  })

  it('معرّف غير موجود لا يغيّر شيئاً', () => {
    expect(moveColumn(base, 'nope', 3)).toBe(base)
  })

  it('عدد الأعمدة لا يتغيّر بإعادة الترتيب', () => {
    expect(moveColumn(base, 'place_code', 5)).toHaveLength(base.length)
  })
})

describe('④ toggleColumn — لا تقرير بلا أعمدة', () => {
  it('إخفاء عمود واحد يعمل', () => {
    const out = toggleColumn(defaultSelection('places'), 'width_m')
    expect(out.find((s) => s.id === 'width_m')?.visible).toBe(false)
  })

  it('إخفاء الكل مرفوض — يبقى مرئياً واحد على الأقل', () => {
    let sel = defaultSelection('places')
    for (const c of columnsFor('places')) sel = toggleColumn(sel, c.id)
    expect(sel.some((s) => s.visible)).toBe(true)
  })

  it('إعادة إظهار عمود مخفي', () => {
    let sel = toggleColumn(defaultSelection('places'), 'width_m')
    sel = toggleColumn(sel, 'width_m')
    expect(sel.find((s) => s.id === 'width_m')?.visible).toBe(true)
  })

  it('إضافة عمود غير موجود في التفضيل تُلحقه بآخر الترتيب', () => {
    const sel = toggleColumn([{ id: 'place_code', visible: true, order: 0 }], 'place_name')
    expect(sel.find((s) => s.id === 'place_name')).toMatchObject({ visible: true, order: 1 })
  })
})

describe('⑤ التنسيق: بغداد وأرقام لاتينية', () => {
  it('الوقت بتوقيت بغداد لا UTC', () => {
    // 20:00 UTC = 23:00 بغداد
    expect(baghdadTime('2026-11-22T20:00:00Z')).toBe('23:00')
  })

  it('تاريخ اليوم بتوقيت بغداد يعبر منتصف الليل صحيحاً', () => {
    // 22:00 UTC من 22 = 01:00 بغداد من 23
    expect(baghdadDay('2026-11-22T22:00:00Z')).toBe('2026-11-23')
    expect(baghdadTime('2026-11-22T22:00:00Z')).toBe('01:00')
  })

  it('المكوث مقروء', () => {
    expect(dwellText(420)).toBe('7 د 0 ث')
    expect(dwellText(40)).toBe('40 ث')
    expect(dwellText(null)).toBeNull()
  })

  it('طابع زمني فاسد لا يُنتج Invalid Date في الملف', () => {
    expect(baghdadTime('ليس وقتاً')).toBeNull()
    expect(baghdadDay('')).toBeNull()
  })
})

describe('⑥ الصفوف والترويسة', () => {
  it('الصف يُبنى بمفاتيح الأعمدة المختارة فقط', () => {
    const cols = resolveColumns('places', [
      { id: 'place_code', visible: true, order: 0 },
      { id: 'length_m', visible: true, order: 1 },
    ])
    const rows = toReportRows([row()], cols, ctx)
    expect(Object.keys(rows[0] ?? {})).toEqual(['place_code', 'length_m'])
    expect(rows[0]?.place_code).toBe('STR-0001')
  })

  it('حالة التغطية ثلاثية لا ثنائية', () => {
    const cols = resolveColumns('places', [{ id: 'coverage_state', visible: true, order: 0 }])
    const v = (r: Row) => toReportRows([r], cols, ctx)[0]?.coverage_state
    expect(v(row())).toBe('مؤكد')
    expect(v(row({ confirmed: false }))).toBe('غير مؤكد')
    expect(v(row({ visited: false, confirmed: false }))).toBe('لم تُدخل')
  })

  it('الترويسة تحمل نصّ التعريف وتعرض العرض والمحاذاة', () => {
    const rc = toReportColumns(columnsFor('places'))
    expect(rc).toHaveLength(12)
    expect(rc[1]).toMatchObject({ header: 'الكود', key: 'place_code', align: 'center' })
  })

  it('صف الإجمالي يجمع الأعمدة القابلة للجمع فقط', () => {
    const rows = [row({ length_m: 100, visits_count: 2 }), row({ length_m: 50, visits_count: 3 })]
    const t = totalRow(rows, columnsFor('places'), ctx)
    expect(t?.length_m).toBe(150)
    expect(t?.visits_count).toBe(5)
    expect(t?.width_m).toBeUndefined()
  })

  it('لا صف إجمالي إن لم يكن هناك عمود يُجمع', () => {
    const cols = resolveColumns('places', [{ id: 'place_name', visible: true, order: 0 }])
    expect(totalRow([row()], cols, ctx)).toBeUndefined()
  })
})
