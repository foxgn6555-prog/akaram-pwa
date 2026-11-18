/** الحضور اليدوي — اختيار النطاق من الهيكل التنظيمي: شجرة الأقسام، وصف النطاق، وتواريخ بغداد */
import { describe, expect, it } from 'vitest'
import { baghdadToday, buildDepartmentOptions, describeScope, shiftDay } from '@features/attendance-manual/org-options'
import type { Department } from '@features/departments'

const d = (id: string, name: string, parent: string | null = null, over: Partial<Department> = {}): Department => ({ id, name, code: id, parent_id: parent, is_active: true, ...over })

describe('buildDepartmentOptions', () => {
  it('شجرة: العمق صحيح والأبناء بعد أبيهم مباشرةً', () => {
    const out = buildDepartmentOptions([d('c', 'محطة التحويل', 'a'), d('a', 'العمليات'), d('b', 'الإدارة'), d('e', 'الصيانة', 'a'), d('f', 'ورشة', 'e')])
    expect(out.map((o) => [o.id, o.depth])).toEqual([['b', 0], ['a', 0], ['e', 1], ['f', 2], ['c', 1]])
  })

  it('التسميات: الإدارة، العمليات، (الصيانة، ورشة)، محطة التحويل — مع بادئة العمق', () => {
    const out = buildDepartmentOptions([d('c', 'محطة التحويل', 'a'), d('a', 'العمليات'), d('b', 'الإدارة'), d('e', 'الصيانة', 'a'), d('f', 'ورشة', 'e')])
    expect(out.map((o) => o.label)).toEqual(['الإدارة', 'العمليات', '– الصيانة', '– – ورشة', '– محطة التحويل'])
  })

  it('يستبعد المسمّيات الوظيفية وغير الفعّالة', () => {
    const out = buildDepartmentOptions([d('a', 'العمليات'), d('j', 'سائق', 'a', { is_job_title: true }), d('x', 'ملغى', null, { is_active: false })])
    expect(out.map((o) => o.id)).toEqual(['a'])
  })

  it('قسم أبوه غير معروض (مؤرشف/مسمّى) يُعامل كجذر ولا يضيع', () => {
    const out = buildDepartmentOptions([d('a', 'الأب', null, { is_active: false }), d('b', 'الابن', 'a')])
    expect(out).toEqual([{ id: 'b', label: 'الابن', depth: 0 }])
  })

  it('اليتيم يُرتَّب بين الجذور بحسب اسمه لا في آخر القائمة', () => {
    const out = buildDepartmentOptions([d('r2', 'جـ'), d('o', 'أ', 'gone'), d('r1', 'ب'), d('k', 'تابع', 'o')])
    expect(out.map((o) => [o.id, o.depth])).toEqual([['o', 0], ['k', 1], ['r1', 0], ['r2', 0]])
  })

  it('حلقة بيانات (أ أب ب وب أب أ) لا تُدوِّر ولا تُكرّر ولا تُسقط أحداً', () => {
    const out = buildDepartmentOptions([d('a', 'أ', 'b'), d('b', 'ب', 'a'), d('c', 'جـ')])
    expect(out.map((o) => o.id).sort()).toEqual(['a', 'b', 'c'])
    expect(new Set(out.map((o) => o.id)).size).toBe(3)
  })

  it('قسم أبوه نفسه لا يدور', () => {
    const out = buildDepartmentOptions([d('a', 'ذاتي', 'a')])
    expect(out.map((o) => o.id)).toEqual(['a'])
  })

  it('صف مكرر بالمعرّف نفسه لا يظهر مرتين', () => {
    const out = buildDepartmentOptions([d('a', 'العمليات'), d('a', 'العمليات'), d('b', 'فرعي', 'a'), d('b', 'فرعي', 'a')])
    expect(out.map((o) => o.id)).toEqual(['a', 'b'])
  })

  it('قائمة فارغة ⇒ فارغة', () => { expect(buildDepartmentOptions([])).toEqual([]) })
})

describe('describeScope', () => {
  const branches = [{ id: 'b1', name: 'الفرع الرئيسي' }]
  const depts = [{ id: 'd1', name: 'النقل' }]
  it('قسم وأقسامه الفرعية / بلا فروعه / فرع / تقاطع فرع وقسم', () => {
    expect(describeScope({ branchId: null, departmentId: 'd1', includeSub: true }, branches, depts)).toBe('قسم النقل وأقسامه الفرعية')
    expect(describeScope({ branchId: null, departmentId: 'd1', includeSub: false }, branches, depts)).toBe('قسم النقل (بلا فروعه)')
    expect(describeScope({ branchId: 'b1', departmentId: null, includeSub: true }, branches, depts)).toBe('فرع الفرع الرئيسي')
    expect(describeScope({ branchId: 'b1', departmentId: 'd1', includeSub: true }, branches, depts)).toBe('فرع الفرع الرئيسي ∩ قسم النقل وأقسامه الفرعية')
  })
  it('معرّف غير معروف ⇒ علامة حذف لا انهيار؛ بلا نطاق ⇒ نص فارغ', () => {
    expect(describeScope({ branchId: 'zz', departmentId: null, includeSub: true }, branches, depts)).toBe('فرع …')
    expect(describeScope({ branchId: null, departmentId: null, includeSub: true }, branches, depts)).toBe('')
  })
})

describe('تواريخ بغداد', () => {
  it('baghdadToday: UTC+3 — بعد الحادية والعشرين بالتوقيت العالمي يصير اليوم التالي', () => {
    expect(baghdadToday(Date.parse('2026-11-17T20:59:00Z'))).toBe('2026-11-17')
    expect(baghdadToday(Date.parse('2026-11-17T21:00:00Z'))).toBe('2026-11-18')
    expect(baghdadToday(Date.parse('2026-12-31T22:00:00Z'))).toBe('2027-01-01')
  })
  it('shiftDay: عبر الشهر والسنة والكبيسة', () => {
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29')
    expect(shiftDay('2026-11-17', -31)).toBe('2026-10-17')
    expect(shiftDay('2026-11-17', 0)).toBe('2026-11-17')
  })
})
