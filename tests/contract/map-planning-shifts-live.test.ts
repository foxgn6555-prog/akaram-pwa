/**
 * عقد شفتات وحدة التخطيط الجغرافي — يمنع عودة العطل الذي أُصلح في الجولة ①.
 *
 * العطل كما كان على الإنتاج (2026-11-24):
 *   `SHIFT_LABEL_AR` قاموس ثابت بثلاثة رموز فقط (morning/evening/night)،
 *   بينما `public.hr_shifts` تحمل **خمسة** شفتات — منها المرنان:
 *       shift_08f99593  «مرن صباحي»  05:00→16:00
 *       shift_7d5e62a0  «مرن مسائي»  17:00→04:00
 *   والمركبة `DB-118` («كابسة» — المركبة الإنتاجية الوحيدة) شفتها shift_08f99593.
 *
 *   الأثر المزدوج:
 *     ① عمود الشفت في التقرير المعتمد كان يعرض الرمز الخام `shift_08f99593`.
 *     ② فلتر الشفت كان يعرض ثلاثة خيارات فقط ⇒ اختيار «صباحي» لا يُظهر DB-118 أبداً،
 *        ولا توجد أي طريقة لتصفية الشفت المرن من الواجهة إطلاقاً.
 *
 * الحارس: كل صفحة في وحدة التخطيط تعرض/تصفّي شفتاً يجب أن تقرأه من
 * `useShiftLabel()` (سجل `hr_shifts` الحيّ) أو من `ShiftSelect`، لا من قاموس ثابت.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SHIFT_FALLBACK_LABELS, shiftLabel } from '@sdk/hr-shifts.sdk'
import { SHIFT_LABEL_AR } from '@sdk/map-planning.sdk'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** كل صفحة في الوحدة تعرض شفتاً أو تصفّيه */
const SHIFT_PAGES = [
  'src/portals/ops-room/pages/MapPlanning/OpsMapCoveragePage.tsx',
  'src/portals/ops-room/pages/MapPlanning/OpsMapGroupedReportPage.tsx',
  'src/portals/ops-room/pages/MapPlanning/OpsMapPlanningTablePage.tsx',
  'src/portals/ops-room/pages/MapPlanning/OpsMapVehicleVisitsPage.tsx',
] as const

describe('① لا قاموس شفتات ثابت في وحدة التخطيط', () => {
  it.each(SHIFT_PAGES)('%s لا يستورد SHIFT_LABEL_AR', (page) => {
    const src = read(page)
    expect(src).not.toMatch(/SHIFT_LABEL_AR/)
  })

  it.each(SHIFT_PAGES)('%s يقرأ الشفت من السجل الحيّ', (page) => {
    const src = read(page)
    expect(src).toMatch(/useShiftLabel\(\)|ShiftSelect/)
  })
})

describe('② القاموس المهجور لا يعرف الشفتات المرنة (سبب العطل موثَّق)', () => {
  it('SHIFT_LABEL_AR يحمل ثلاثة رموز فقط — وهذا هو العطل', () => {
    expect(Object.keys(SHIFT_LABEL_AR).sort()).toEqual(['evening', 'morning', 'night'])
    // الرمزان المرنان غير موجودين فيه — أي أنه لا يصلح مصدراً للتسمية
    expect(SHIFT_LABEL_AR.shift_08f99593).toBeUndefined()
    expect(SHIFT_LABEL_AR.shift_7d5e62a0).toBeUndefined()
  })

  it('دالة shiftLabel الحيّة تُرجع الرمز نفسه عند غياب التسمية (لا تخفي الخطأ)', () => {
    // لا ادّعاء بأنها تعرف «مرن صباحي» قبل تحميل السجل — لكنها لا تُطلق استثناءً
    expect(typeof shiftLabel('shift_08f99593')).toBe('string')
  })

  it('القائمة الاحتياطية تطابق القاموس المهجور — فالتوافق قبل التحميل محفوظ', () => {
    for (const [code, name] of Object.entries(SHIFT_FALLBACK_LABELS)) {
      expect(SHIFT_LABEL_AR[code]).toBe(name)
    }
  })
})

describe('③ فلتر الشفت في التقرير المعتمد يقرأ hr_shifts', () => {
  it('يستخدم ShiftSelect بخيار «كل الشفتات»', () => {
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapGroupedReportPage.tsx')
    expect(src).toMatch(/<ShiftSelect/)
    expect(src).toMatch(/allLabel="كل الشفتات"/)
    expect(src).toMatch(/testId="grouped-shift-filter"/)
    // الفلتر لا يُبنى من كائن ثابت بعد الآن
    expect(src).not.toMatch(/Object\.entries\(SHIFT_LABEL_AR\)/)
  })

  it('سياق التصدير يحمل دالة التسمية الحيّة', () => {
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapGroupedReportPage.tsx')
    expect(src).toMatch(/shiftLabel,/)
    expect(src).toMatch(/\[zoneName, from, to, shiftLabel\]/)
  })
})

describe('④ ShiftSelect نفسه يتحمّل قيمة خارج القائمة', () => {
  it('يبقي الخيار المختار ظاهراً حتى لو لم يكن في القائمة النشطة', () => {
    const src = read('src/features/hr-shifts/ShiftSelect.tsx')
    expect(src).toMatch(/missing && <option/)
    expect(src).toMatch(/shiftLabel\(value, options\)/)
  })
})
