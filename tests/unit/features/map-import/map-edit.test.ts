/**
 * محرّك التعديل اليدوي — الجولة ②.
 *
 * يُختبر المنطق الخالص (`validateEdit`) وتدفّق التاريخ (`useMapEdit`) عبر
 * `renderHook`. كل حالة هنا مطابقة لما سيحدث في الواجهة حرفياً لأن الدالة نفسها.
 */
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  MIN_EDIT_LENGTH_M,
  canDropAt,
  useMapEdit,
  validateEdit,
  type EditDraft,
} from '@features/map-import/hooks/useMapEdit'
import { pathLengthM, type LatLng } from '@features/map-import/lib/geometry'

const ZONE: LatLng[] = [
  [33.3, 44.4],
  [33.3, 44.411],
  [33.309, 44.411],
  [33.309, 44.4],
]

const draft = (over: Partial<EditDraft> = {}): EditDraft => ({
  target: { kind: 'street', id: 's1', code: 'STR-0001' },
  pts: [
    [33.302, 44.402],
    [33.306, 44.406],
  ],
  name: 'شارع السندباد',
  kind: 'primary',
  dirty: false,
  ...over,
})

describe('① التحقق قبل الحفظ', () => {
  it('مسار سليم داخل الزون ⇒ لا أخطاء', () => {
    expect(validateEdit(draft(), ZONE)).toEqual([])
  })

  it('أكثر من نصف النقاط خارج الزون ⇒ خطأ بالمسار مع مثال الإحداثي', () => {
    const errs = validateEdit(
      draft({ pts: [[33.302, 44.402], [33.32, 44.43], [33.322, 44.432]] }),
      ZONE,
    )
    expect(errs).toHaveLength(1)
    expect(errs[0]?.field).toBe('path')
    expect(errs[0]?.message).toContain('خارج حدّ الزون')
    expect(errs[0]?.message).toMatch(/33\.3\d+, 44\.\d+/)
  })

  /**
   * مواءمة مع القاعدة: `app.map_guard_path_in_zone` يرفض حين يكون **أكثر من
   * نصف** النقاط خارج الزون فقط. الواجهة كانت تشترط كلّ نقطة، فتمنع تعديلاً
   * مشروعاً على شارع يلامس الحدّ الإداري — وهذا نصف سبب «خطأ عند التعديل».
   */
  it('نقطة واحدة خارج الزون من أصل ثلاث ⇒ مقبولة (نفس عتبة القاعدة)', () => {
    expect(validateEdit(draft({ pts: [[33.302, 44.402], [33.306, 44.406], [33.32, 44.43]] }), ZONE)).toEqual([])
  })

  it('نصف النقاط خارجاً (٢ من ٤) ⇒ مقبولة: العتبة «أكثر من النصف»', () => {
    const pts: LatLng[] = [[33.302, 44.402], [33.306, 44.406], [33.32, 44.43], [33.322, 44.432]]
    expect(validateEdit(draft({ pts }), ZONE)).toEqual([])
  })

  it('نقطة على الحدّ تماماً مقبولة (تسامح ٥م)', () => {
    expect(validateEdit(draft({ pts: [[33.3, 44.405], [33.306, 44.406]] }), ZONE)).toEqual([])
  })

  it('نقطة واحدة ⇒ مرفوض، وتُفحص بقية الحقول أيضاً', () => {
    const errs = validateEdit(draft({ pts: [[33.302, 44.402]] }), ZONE)
    expect(errs.some((e) => e.message.includes('نقطتين'))).toBe(true)
    // مربّع: نقطة واحدة + اسم «ش» ⇒ خطأان معاً لا الأول فقط
    const both = validateEdit(draft({ pts: [[33.302, 44.402]], name: 'ش' }), ZONE)
    expect(both.length).toBeGreaterThanOrEqual(2)
  })

  it(`مسار أقصر من ${MIN_EDIT_LENGTH_M}م ⇒ مرفوض`, () => {
    // متر واحد تقريباً
    const errs = validateEdit(draft({ pts: [[33.304, 44.404], [33.304009, 44.404]] }), ZONE)
    expect(errs.some((e) => e.message.includes('أقل من الحدّ'))).toBe(true)
  })

  it('اسم بحرف واحد ⇒ مرفوض، واسم فارغ مقبول (بلا اسم)', () => {
    expect(validateEdit(draft({ name: 'ش' }), ZONE)).toHaveLength(1)
    expect(validateEdit(draft({ name: '' }), ZONE)).toEqual([])
    expect(validateEdit(draft({ name: null }), ZONE)).toEqual([])
  })

  it('تصنيف غير معروف ⇒ مرفوض', () => {
    expect(validateEdit(draft({ kind: 'motorway' }), ZONE)[0]?.field).toBe('kind')
  })

  it('زقاق بتصنيف alley مقبول', () => {
    expect(validateEdit(draft({ kind: 'alley', target: { kind: 'alley', id: 'a1', code: 'ALY-0001' } }), ZONE)).toEqual([])
  })

  it('عدة أخطاء معاً كلها تُعرض لا الأول فقط', () => {
    const errs = validateEdit(draft({ pts: [[33.32, 44.43]], name: 'ش', kind: 'x' }), ZONE)
    expect(errs.length).toBeGreaterThanOrEqual(2)
  })
})

describe('② حالة التعديل والتاريخ', () => {
  it('begin ينشئ مسودة نظيفة غير معدَّلة', () => {
    const { result } = renderHook(() => useMapEdit(ZONE))
    act(() => result.current.begin({ kind: 'street', id: 's1', code: 'STR-0001', pts: [[33.302, 44.402], [33.306, 44.406]], name: 'شارع تجريبي', kindValue: 'primary' }))
    expect(result.current.draft?.dirty).toBe(false)
    expect(result.current.valid).toBe(true)
    expect(result.current.canUndo).toBe(false)
  })

  it('apply يعدّل ويوسم dirty ويفتح التراجع', () => {
    const { result } = renderHook(() => useMapEdit(ZONE))
    act(() => result.current.begin({ kind: 'street', id: 's1', code: 'STR-0001', pts: [[33.302, 44.402], [33.306, 44.406]], name: 'شارع تجريبي', kindValue: 'primary' }))
    act(() => result.current.apply({ name: 'اسم جديد' }))
    expect(result.current.draft?.name).toBe('اسم جديد')
    expect(result.current.draft?.dirty).toBe(true)
    expect(result.current.canUndo).toBe(true)
  })

  it('تراجع يُرجع القيمة السابقة، وإعادة يُعيدها', () => {
    const { result } = renderHook(() => useMapEdit(ZONE))
    act(() => result.current.begin({ kind: 'street', id: 's1', code: 'STR-0001', pts: [[33.302, 44.402], [33.306, 44.406]], name: 'الأصل', kindValue: 'primary' }))
    act(() => result.current.apply({ name: 'بديل' }))
    act(() => result.current.undo())
    expect(result.current.draft?.name).toBe('الأصل')
    expect(result.current.canRedo).toBe(true)
    act(() => result.current.redo())
    expect(result.current.draft?.name).toBe('بديل')
  })

  it('سلسلة تعديلات: كل تراجع يخطو خطوة واحدة', () => {
    const { result } = renderHook(() => useMapEdit(ZONE))
    act(() => result.current.begin({ kind: 'street', id: 's1', code: 'STR-0001', pts: [[33.302, 44.402], [33.306, 44.406]], name: 'أ', kindValue: 'primary' }))
    act(() => result.current.apply({ name: 'ب' }))
    act(() => result.current.apply({ name: 'ج' }))
    act(() => result.current.undo())
    expect(result.current.draft?.name).toBe('ب')
    act(() => result.current.undo())
    expect(result.current.draft?.name).toBe('أ')
  })

  it('تعديل جديد بعد تراجع يمسح الإعادة', () => {
    const { result } = renderHook(() => useMapEdit(ZONE))
    act(() => result.current.begin({ kind: 'street', id: 's1', code: 'STR-0001', pts: [[33.302, 44.402], [33.306, 44.406]], name: 'أ', kindValue: 'primary' }))
    act(() => result.current.apply({ name: 'ب' }))
    act(() => result.current.undo())
    expect(result.current.canRedo).toBe(true)
    act(() => result.current.apply({ name: 'د' }))
    expect(result.current.canRedo).toBe(false)
  })

  it('سحب أكثر من نصف النقاط خارج الزون يُظهر الخطأ فوراً ولا يُبقي المسودة صالحة', () => {
    const { result } = renderHook(() => useMapEdit(ZONE))
    act(() => result.current.begin({ kind: 'street', id: 's1', code: 'STR-0001', pts: [[33.302, 44.402], [33.306, 44.406]], name: 'شارع تجريبي', kindValue: 'primary' }))
    act(() => result.current.apply({ pts: [[33.32, 44.43], [33.322, 44.432], [33.324, 44.434]] }))
    expect(result.current.errors.length).toBeGreaterThan(0)
    expect(result.current.valid).toBe(false)
  })

  it('سحب نقطة واحدة خارج الزون — الباقي داخله ⇒ يبقى صالحاً (عتبة القاعدة)', () => {
    const { result } = renderHook(() => useMapEdit(ZONE))
    act(() => result.current.begin({ kind: 'street', id: 's1', code: 'STR-0001', pts: [[33.302, 44.402], [33.306, 44.406]], name: 'شارع تجريبي', kindValue: 'primary' }))
    act(() => result.current.apply({ pts: [[33.302, 44.402], [33.306, 44.406], [33.32, 44.43]] }))
    expect(result.current.errors).toEqual([])
    expect(result.current.valid).toBe(true)
  })

  it('prepareSave يُرجع null للمسودة الخاطئة ولا يحفظ', () => {
    const { result } = renderHook(() => useMapEdit(ZONE))
    act(() => result.current.begin({ kind: 'street', id: 's1', code: 'STR-0001', pts: [[33.302, 44.402], [33.306, 44.406]], name: 'شارع تجريبي', kindValue: 'primary' }))
    // اسم بحرف واحد + مسار من نقطة واحدة = مسودة خاطئة، بلا الاعتماد على قانون الحدود
    act(() => result.current.apply({ pts: [[33.32, 44.43]], name: 'ش' }))
    let out: unknown = 'غير مُهيّأ'
    act(() => {
      out = result.current.prepareSave()
    })
    expect(out).toBeNull()
  })

  it('prepareSave يُرجع المسودة الصالحة', () => {
    const { result } = renderHook(() => useMapEdit(ZONE))
    act(() => result.current.begin({ kind: 'street', id: 's1', code: 'STR-0001', pts: [[33.302, 44.402], [33.306, 44.406]], name: 'شارع تجريبي', kindValue: 'primary' }))
    act(() => result.current.apply({ name: 'اسم' }))
    let out: EditDraft | null = null
    act(() => {
      out = result.current.prepareSave()
    })
    expect(out).not.toBeNull()
    expect((out as unknown as EditDraft).name).toBe('اسم')
  })

  it('cancel يُلغي كل شيء ويعيد الحالة فارغة', () => {
    const { result } = renderHook(() => useMapEdit(ZONE))
    act(() => result.current.begin({ kind: 'street', id: 's1', code: 'STR-0001', pts: [[33.302, 44.402], [33.306, 44.406]], name: 'شارع تجريبي', kindValue: 'primary' }))
    act(() => result.current.apply({ name: 'بديل' }))
    act(() => result.current.cancel())
    expect(result.current.draft).toBeNull()
    expect(result.current.valid).toBe(false)
  })

  it('كل تعديل يعيد حساب الطول — لا قيمة قديمة عالقة', () => {
    const { result } = renderHook(() => useMapEdit(ZONE))
    act(() => result.current.begin({ kind: 'street', id: 's1', code: 'STR-0001', pts: [[33.302, 44.402], [33.306, 44.406]], name: 'شارع تجريبي', kindValue: 'primary' }))
    const before = pathLengthM(result.current.draft!.pts)
    act(() => result.current.apply({ pts: [[33.302, 44.402], [33.303, 44.403]] }))
    const after = pathLengthM(result.current.draft!.pts)
    expect(after).toBeLessThan(before)
    expect(after).toBeGreaterThan(100)
  })
})

describe('③ canDropAt أثناء السحب', () => {
  it('يقبل نقطة داخلة', () => {
    expect(canDropAt([33.304, 44.405], ZONE)).toBe(true)
  })
  it('يقبل نقطة على الحدّ', () => {
    expect(canDropAt([33.3, 44.405], ZONE)).toBe(true)
  })
  it('يرفض نقطة بعيدة', () => {
    expect(canDropAt([33.35, 44.5], ZONE)).toBe(false)
  })
})
