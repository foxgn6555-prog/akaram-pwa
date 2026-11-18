/**
 * الحضور اليدوي — كشف اليوم لأصحاب البوابة (ManualSheetPanel):
 *   عرض موظفي النطاق وحالاتهم · حاضر/غائب بلا افتراضي · حفظ بتأكيد يرسل المتغيّر فقط · تعديل المُدخَل يشترط سبباً
 *   · شهر معتمد/مقفل للاطلاع · الانتقال بين الأيام يحمي التغييرات غير المحفوظة · أخطاء بالعربية.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const h = vi.hoisted(() => ({
  sheet: vi.fn(),
  save: vi.fn(),
  my: vi.fn(async () => []),
}))
vi.mock('@sdk/attendance-manual.sdk', async (importOriginal) => {
  const m = await importOriginal<{ attendanceManual: object } & Record<string, unknown>>()
  return { ...m, attendanceManual: { ...m.attendanceManual, sheet: h.sheet, saveSheet: h.save, myActivations: h.my } }
})

import { ManualSheetPanel } from '@features/attendance-manual/components/ManualSheetPanel'
import { useUiStore } from '@stores/ui.store'
import { HR_ERROR_MESSAGES } from '@sdk/hr.sdk'
import type { ManualSheet, ManualSheetEmployee } from '@sdk/attendance-manual.sdk'

const emp = (id: string, name: string, over: Partial<ManualSheetEmployee> = {}): ManualSheetEmployee => ({
  id, name, number: `10${id.slice(1)}`, job_title: 'عامل', department: 'المحطة', has_shift: true, state: 'open', entry: null, note: null, by: null, at: null,
  punches: 0, first_punch: null, last_punch: null, status: null, source: null, ...over,
})
const sheetOf = (over: Partial<ManualSheet> = {}): ManualSheet => ({
  activation: { id: 'act1', portal: 'transfer-station', portal_label: 'المحطة التحويلية', status: 'active', starts_on: '2026-11-10', ends_on: null, reason: 'عطل الجهاز',
    branch_id: null, department_id: 'd1', include_sub_departments: true, scope_label: 'قسم المحطة وأقسامه الفرعية' },
  date: '2026-11-17', today: '2026-11-17', from: '2026-11-10', to: '2026-11-17', lock: null, can_review: false,
  days: [{ date: '2026-11-17', total: 2, entered: 1, pending: 1 }, { date: '2026-11-16', total: 2, entered: 2, pending: 0 }],
  employees: [
    emp('e1', 'أحمد علي'),
    emp('e2', 'بسام حسن', { entry: 'present', by: 'سارة', at: '2026-11-17T05:00:00Z', status: 'present', source: 'manual' }),
    emp('e3', 'جاسم كريم', { state: 'leave' }),
  ],
  excluded: { no_pin: 1, contractors: 2 },
  ...over,
})

const renderPanel = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ManualSheetPanel activationId="act1" /></QueryClientProvider>)
}
const loaded = async () => { await screen.findByTestId('mam-rows') }
/** قيمة بطاقة الإحصاء بدقة (الرقم وحده لا نصاً يحتويه) */
const stat = (id: string) => screen.getByTestId(id).querySelectorAll('p')[1]?.textContent
const toasts = () => useUiStore.getState().toasts

beforeEach(() => {
  useUiStore.setState({ toasts: [] })
  h.sheet.mockReset(); h.save.mockReset(); h.my.mockClear()
  h.sheet.mockImplementation(async () => sheetOf())
  h.save.mockImplementation(async () => ({ saved: 1, changed: 0, unchanged: 0, present: 0, absent: 1, pending_left: 0, date: '2026-11-17' }))
})

afterEach(() => { vi.restoreAllMocks() })

describe('عرض الكشف', () => {
  it('موظفو النطاق بحالاتهم، والعدّادات، والمقفل بسببه، وما استُثني من الكشف، وشريط الأيام', async () => {
    renderPanel(); await loaded()
    expect(screen.getByTestId('mam-active-banner')).toHaveTextContent('قسم المحطة وأقسامه الفرعية')
    expect([stat('mam-stat-open'), stat('mam-stat-present'), stat('mam-stat-absent'), stat('mam-stat-pending')]).toEqual(['2', '1', '0', '1'])   // المقفل (إجازة) خارج «المطلوب»
    expect(screen.getByTestId('mam-locked-e3')).toHaveTextContent('في إجازة معتمدة')
    expect(screen.queryByTestId('mam-present-e3')).toBeNull()
    expect(screen.getByTestId('mam-meta-e2')).toHaveTextContent('سُجّل «حاضر» بواسطة سارة')
    expect(screen.getByTestId('mam-excluded')).toHaveTextContent('1 بلا رقم بصمة')
    expect(screen.getByTestId('mam-excluded')).toHaveTextContent('2 متعهد')
    expect(screen.getByTestId('mam-day-2026-11-17')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mam-day-2026-11-16')).toHaveTextContent('اكتمل')
    expect(screen.getByTestId('mam-day-2026-11-17')).toHaveTextContent('1 بانتظار')
    expect(screen.getByTestId('mam-dirty')).toHaveTextContent('لا تغييرات غير محفوظة')
    expect(screen.getByTestId('mam-save')).toBeDisabled()
    expect(h.sheet).toHaveBeenCalledWith('act1', null)
  })

  it('بصمات الجهاز الواردة تُعرض للاطلاع فقط، وموظف بلا شفت يُنبَّه', async () => {
    h.sheet.mockImplementation(async () => sheetOf({ employees: [emp('e1', 'أحمد علي', { punches: 2, first_punch: '2026-11-17T04:55:00Z', last_punch: '2026-11-17T13:00:00Z', has_shift: false })] }))
    renderPanel(); await loaded()
    expect(screen.getByTestId('mam-punches-e1')).toHaveTextContent('للاطلاع فقط')
    expect(screen.getByTestId('mam-punches-e1')).toHaveTextContent('07:55')
    expect(screen.getByTestId('mam-row-e1')).toHaveTextContent('بلا شفت مُسنَد')
  })

  it('تفعيل منتهٍ بقي فيه معلّق: شريط أصفر بدل شريط التفعيل', async () => {
    h.sheet.mockImplementation(async () => sheetOf({ activation: { ...sheetOf().activation, status: 'ended', ends_on: '2026-11-15' } }))
    renderPanel(); await loaded()
    expect(screen.getByTestId('mam-ended-banner')).toHaveTextContent('عادت البصمة')
    expect(screen.queryByTestId('mam-active-banner')).toBeNull()
  })

  it('لا يوم ضمن نافذة التسجيل ⇒ رسالة واضحة بلا قائمة', async () => {
    h.sheet.mockImplementation(async () => sheetOf({ date: null, days: [], employees: [], from: '2026-11-17', to: '2026-11-10' }))
    renderPanel()
    expect(await screen.findByTestId('mam-no-window')).toHaveTextContent('غرفة العمليات')
    expect(screen.queryByTestId('mam-rows')).toBeNull()
  })

  it('فشل التحميل: رسالة عربية وزر إعادة المحاولة', async () => {
    h.sheet.mockImplementation(async () => { throw new Error('ATT_MANUAL_NOT_FOUND') })
    renderPanel()
    expect(await screen.findByTestId('mam-error')).toHaveTextContent('التفعيل غير موجود')
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument()
  })

  it('البحث والتصفية: بانتظار / حاضر / مقفل / بالاسم', async () => {
    renderPanel(); await loaded()
    fireEvent.click(screen.getByTestId('mam-filter-pending'))
    expect(screen.getByTestId('mam-row-e1')).toBeInTheDocument(); expect(screen.queryByTestId('mam-row-e2')).toBeNull(); expect(screen.queryByTestId('mam-row-e3')).toBeNull()
    fireEvent.click(screen.getByTestId('mam-filter-present'))
    expect(screen.queryByTestId('mam-row-e1')).toBeNull(); expect(screen.getByTestId('mam-row-e2')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('mam-filter-locked'))
    expect(screen.getByTestId('mam-row-e3')).toBeInTheDocument(); expect(screen.queryByTestId('mam-row-e2')).toBeNull()
    fireEvent.click(screen.getByTestId('mam-filter-all'))
    fireEvent.change(screen.getByTestId('mam-search'), { target: { value: 'بسام' } })
    expect(screen.getByTestId('mam-row-e2')).toBeInTheDocument(); expect(screen.queryByTestId('mam-row-e1')).toBeNull()
    fireEvent.change(screen.getByTestId('mam-search'), { target: { value: '102' } })   // بالرقم الوظيفي (جزء منه)
    expect(screen.getByTestId('mam-row-e2')).toBeInTheDocument(); expect(screen.queryByTestId('mam-row-e1')).toBeNull(); expect(screen.queryByTestId('mam-row-e3')).toBeNull()
    fireEvent.change(screen.getByTestId('mam-search'), { target: { value: 'سن 10' } })   // الاسم والرقم معاً في سلسلة البحث نفسها
    expect(screen.getByTestId('mam-row-e2')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('mam-search'), { target: { value: 'غير موجود' } })
    expect(within(screen.getByTestId('mam-rows')).getByText('لا نتائج مطابقة.')).toBeInTheDocument()
  })
})

describe('التسجيل والحفظ', () => {
  it('«غائب» لموظف بلا مُدخَل ثم الحفظ بتأكيد: يُرسل المتغيّر وحده بلا ملاحظة', async () => {
    renderPanel(); await loaded()
    fireEvent.click(screen.getByTestId('mam-absent-e1'))
    expect(screen.getByTestId('mam-row-e1')).toHaveAttribute('data-status', 'absent')
    expect(screen.getByTestId('mam-dirty')).toHaveTextContent(/تغييرات غير محفوظة: 1/)
    expect(screen.queryByTestId('mam-note')).toBeNull()   // لا سبب لمُدخَل جديد
    fireEvent.click(screen.getByTestId('mam-save'))
    expect([stat('mam-confirm-present'), stat('mam-confirm-absent')]).toEqual(['0', '1'])
    expect(screen.getByTestId('mam-confirm-names')).toHaveTextContent('أحمد علي')
    expect(h.save).not.toHaveBeenCalled()   // لا حفظ قبل التأكيد
    h.sheet.mockImplementation(async () => sheetOf({ employees: [emp('e1', 'أحمد علي', { entry: 'absent', by: 'سارة', at: '2026-11-17T06:00:00Z' }), emp('e2', 'بسام حسن', { entry: 'present' }), emp('e3', 'جاسم كريم', { state: 'leave' })] }))
    fireEvent.click(screen.getByTestId('mam-confirm-save'))
    await waitFor(() => expect(h.save).toHaveBeenCalledWith('act1', '2026-11-17', [{ employee_id: 'e1', status: 'absent' }], null))
    await waitFor(() => expect(screen.queryByTestId('mam-confirm')).toBeNull())
    await waitFor(() => expect(screen.getByTestId('mam-dirty')).toHaveTextContent('لا تغييرات غير محفوظة'))
    expect(stat('mam-stat-absent')).toBe('1')
    expect(toasts()).toEqual([expect.objectContaining({ type: 'success', message: expect.stringContaining('حُفظ الكشف: 1 موظف') })])
    expect(h.my).toHaveBeenCalled()   // تفعيلاتي (الشريط الجانبي) تُحدَّث بعد كل حفظ
  })

  it('تعديل مُدخَل محفوظ يشترط سبباً (3 أحرف)، ويُرسل مع الحفظ', async () => {
    renderPanel(); await loaded()
    fireEvent.click(screen.getByTestId('mam-absent-e2'))
    expect(screen.getByTestId('mam-change-e2')).toHaveTextContent('سيُعدَّل من «حاضر» إلى «غائب»')
    expect(screen.getByTestId('mam-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('mam-note'), { target: { value: 'خط' } })
    expect(screen.getByTestId('mam-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('mam-note'), { target: { value: '  خطأ في الإدخال  ' } })
    expect(screen.getByTestId('mam-save')).toBeEnabled()
    fireEvent.click(screen.getByTestId('mam-save'))
    fireEvent.click(screen.getByTestId('mam-confirm-save'))
    await waitFor(() => expect(h.save).toHaveBeenCalledWith('act1', '2026-11-17', [{ employee_id: 'e2', status: 'absent' }], 'خطأ في الإدخال'))
  })

  it('النقر على الاختيار المحفوظ نفسه لا يصنع تغييراً؛ وتكرار النقر على اختيار جديد يلغيه', async () => {
    renderPanel(); await loaded()
    fireEvent.click(screen.getByTestId('mam-present-e2'))   // محفوظ «حاضر» أصلاً
    expect(screen.getByTestId('mam-dirty')).toHaveTextContent('لا تغييرات غير محفوظة')
    fireEvent.click(screen.getByTestId('mam-present-e1'))
    expect(screen.getByTestId('mam-dirty')).toHaveTextContent(/تغييرات غير محفوظة: 1/)
    fireEvent.click(screen.getByTestId('mam-present-e1'))
    expect(screen.getByTestId('mam-dirty')).toHaveTextContent('لا تغييرات غير محفوظة')
    expect(screen.getByTestId('mam-row-e1')).toHaveAttribute('data-status', 'none')
  })

  it('تغيير ثم العودة إلى المحفوظ يلغي التعديل (لا سبب مطلوب)', async () => {
    renderPanel(); await loaded()
    fireEvent.click(screen.getByTestId('mam-absent-e2'))
    expect(screen.getByTestId('mam-note')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('mam-present-e2'))
    expect(screen.queryByTestId('mam-note')).toBeNull()
    expect(screen.getByTestId('mam-save')).toBeDisabled()
  })

  it('«كلهم حاضرون / غائبون» للمتبقّين بلا تسجيل فقط، ولا يمس المحفوظ، و«تراجع» يعيد الصفحة نظيفة', async () => {
    h.sheet.mockImplementation(async () => sheetOf({ employees: [emp('e1', 'أحمد علي'), emp('e4', 'خالد'), emp('e2', 'بسام حسن', { entry: 'absent' })] }))
    renderPanel(); await loaded()
    fireEvent.click(screen.getByTestId('mam-all-present'))
    expect(screen.getByTestId('mam-row-e1')).toHaveAttribute('data-status', 'present')
    expect(screen.getByTestId('mam-row-e4')).toHaveAttribute('data-status', 'present')
    expect(screen.getByTestId('mam-row-e2')).toHaveAttribute('data-status', 'absent')   // محفوظ — لم يُلمس
    expect(screen.getByTestId('mam-dirty')).toHaveTextContent(/تغييرات غير محفوظة: 2/)
    expect(screen.queryByTestId('mam-note')).toBeNull()   // كلهم جدد ⇒ لا سبب
    fireEvent.click(screen.getByTestId('mam-reset'))
    expect(screen.getByTestId('mam-dirty')).toHaveTextContent('لا تغييرات غير محفوظة')
    fireEvent.click(screen.getByTestId('mam-all-absent'))
    expect(screen.getByTestId('mam-row-e1')).toHaveAttribute('data-status', 'absent')
    expect(screen.getByTestId('mam-row-e4')).toHaveAttribute('data-status', 'absent')
  })

  it('الاختيار الجماعي يحترم البحث والتصفية: لا يغيّر الموظفين المخفيين ولا المُسجَّل لهم مسبقاً', async () => {
    h.sheet.mockImplementation(async () => sheetOf({ employees: [emp('e1', 'أحمد علي'), emp('e4', 'خالد'), emp('e2', 'بسام حسن', { entry: 'absent' }), emp('e3', 'جاسم', { state: 'leave' })] }))
    renderPanel(); await loaded()
    fireEvent.click(screen.getByTestId('mam-filter-pending'))
    fireEvent.change(screen.getByTestId('mam-search'), { target: { value: 'أحمد' } })
    expect(screen.getByTestId('mam-row-e1')).toBeInTheDocument()
    expect(screen.queryByTestId('mam-row-e4')).toBeNull()
    fireEvent.click(screen.getByTestId('mam-all-present'))
    expect(screen.queryByTestId('mam-row-e1')).toBeNull() // لم يعد «بانتظار» بعد الاختيار
    fireEvent.click(screen.getByTestId('mam-filter-all'))
    expect(screen.getByTestId('mam-row-e1')).toHaveAttribute('data-status', 'present')
    fireEvent.change(screen.getByTestId('mam-search'), { target: { value: '' } })
    expect(screen.getByTestId('mam-row-e4')).toHaveAttribute('data-status', 'none')
    expect(screen.getByTestId('mam-row-e2')).toHaveAttribute('data-status', 'absent')
    expect(screen.getByTestId('mam-row-e3')).toHaveAttribute('data-state', 'leave')
    expect(screen.queryByTestId('mam-present-e3')).toBeNull()
    expect(screen.getByTestId('mam-dirty')).toHaveTextContent(/تغييرات غير محفوظة: 1/)
  })

  it('سجل يدوي يتيم يبقى مقفلاً لغير المخوّل ويظهر كمانع يحتاج مراجعة', async () => {
    h.sheet.mockImplementation(async () => sheetOf({
      days: [{ date: '2026-11-17', total: 1, entered: 0, pending: 1 }],
      employees: [emp('e1', 'أحمد علي', { state: 'other', source: 'manual', status: 'present' })],
    }))
    renderPanel(); await loaded()
    expect(screen.getByTestId('mam-review-banner')).toHaveTextContent('مانعاً لاعتماد حضورية الشهر')
    expect(screen.getByTestId('mam-review-banner')).toHaveTextContent('مسؤول مخوّل')
    expect(screen.getByTestId('mam-day-2026-11-17')).toHaveTextContent('1 بانتظار')
    expect(screen.getByTestId('mam-locked-e1')).toHaveTextContent('يلزم مراجعة مخوّلة')
    expect(screen.queryByTestId('mam-present-e1')).toBeNull()
    expect(screen.queryByTestId('mam-absent-e1')).toBeNull()
  })

  it('المراجع المخوّل يستطيع اعتماد السجل اليتيم فقط بعد اختيار صريح وكتابة سبب', async () => {
    h.sheet.mockImplementation(async () => sheetOf({ can_review: true,
      days: [{ date: '2026-11-17', total: 1, entered: 0, pending: 1 }],
      employees: [emp('e1', 'أحمد علي', { state: 'other', source: 'manual', status: 'present' })],
    }))
    renderPanel(); await loaded()
    expect(screen.getByTestId('mam-present-e1')).toBeEnabled()
    expect(screen.getByTestId('mam-absent-e1')).toBeEnabled()
    expect(screen.getByTestId('mam-review-e1')).toHaveTextContent('بلا إدخال كشف مطابق')
    fireEvent.click(screen.getByTestId('mam-present-e1'))
    expect(screen.getByTestId('mam-save')).toBeDisabled()
    expect(screen.getByTestId('mam-note')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('mam-note'), { target: { value: 'مراجعة السجل القديم' } })
    expect(screen.getByTestId('mam-save')).toBeEnabled()
    fireEvent.click(screen.getByTestId('mam-save'))
    fireEvent.click(screen.getByTestId('mam-confirm-save'))
    await waitFor(() => expect(h.save).toHaveBeenCalledWith('act1', '2026-11-17', [{ employee_id: 'e1', status: 'present' }], 'مراجعة السجل القديم'))
  })

  it('فشل الحفظ (شهر معتمد بين الفتح والحفظ): يُغلق التأكيد، وتبقى الاختيارات لإعادة المحاولة', async () => {
    h.save.mockImplementation(async () => { throw new Error('HR_ATTENDANCE_CONFIRMED') })
    renderPanel(); await loaded()
    fireEvent.click(screen.getByTestId('mam-present-e1'))
    fireEvent.click(screen.getByTestId('mam-save'))
    fireEvent.click(screen.getByTestId('mam-confirm-save'))
    await waitFor(() => expect(screen.queryByTestId('mam-confirm')).toBeNull())
    expect(screen.getByTestId('mam-row-e1')).toHaveAttribute('data-status', 'present')
    expect(screen.getByTestId('mam-dirty')).toHaveTextContent(/تغييرات غير محفوظة: 1/)
    expect(toasts()).toEqual([expect.objectContaining({ type: 'error', message: HR_ERROR_MESSAGES.HR_ATTENDANCE_CONFIRMED })])
  })
})

describe('القفل والانتقال بين الأيام', () => {
  it('شهر معتمد: الأزرار معطّلة وبلا شريط حفظ، مع سبب القفل', async () => {
    h.sheet.mockImplementation(async () => sheetOf({ lock: 'month_confirmed' }))
    renderPanel(); await loaded()
    expect(screen.getByTestId('mam-lock')).toHaveTextContent('أعد فتحها من غرفة العمليات')
    expect(screen.getByTestId('mam-present-e1')).toBeDisabled()
    expect(screen.getByTestId('mam-absent-e1')).toBeDisabled()
    expect(screen.queryByTestId('mam-savebar')).toBeNull()
    expect(screen.queryByTestId('mam-all-present')).toBeNull()
  })

  it('شهر مقفل مالياً: للاطلاع فقط', async () => {
    h.sheet.mockImplementation(async () => sheetOf({ lock: 'month_locked' }))
    renderPanel(); await loaded()
    expect(screen.getByTestId('mam-lock')).toHaveTextContent('اعتمدت المالية')
    expect(screen.getByTestId('mam-present-e1')).toBeDisabled()
  })

  it('الانتقال إلى يوم آخر مع تغييرات غير محفوظة يطلب تأكيداً: الرفض يُبقي اليوم والاختيارات، والقبول يطرحها ويحمّل اليوم الجديد', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPanel(); await loaded()
    fireEvent.click(screen.getByTestId('mam-present-e1'))
    fireEvent.click(screen.getByTestId('mam-day-2026-11-16'))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(h.sheet).not.toHaveBeenCalledWith('act1', '2026-11-16')
    expect(screen.getByTestId('mam-row-e1')).toHaveAttribute('data-status', 'present')
    confirm.mockReturnValue(true)
    h.sheet.mockImplementation(async (_a: string, d: string | null) => sheetOf({ date: d ?? '2026-11-17', employees: [emp('e1', 'أحمد علي', { entry: 'present' })] }))
    fireEvent.click(screen.getByTestId('mam-day-2026-11-16'))
    await waitFor(() => expect(h.sheet).toHaveBeenCalledWith('act1', '2026-11-16'))
    await waitFor(() => expect(screen.getByTestId('mam-day-2026-11-16')).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByTestId('mam-dirty')).toHaveTextContent('لا تغييرات غير محفوظة')
  })

  it('النقر على اليوم المعروض نفسه لا يسأل ولا يطرح الاختيارات ولا يعيد التحميل', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPanel(); await loaded()
    fireEvent.click(screen.getByTestId('mam-present-e1'))
    const calls = h.sheet.mock.calls.length
    fireEvent.click(screen.getByTestId('mam-day-2026-11-17'))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByTestId('mam-row-e1')).toHaveAttribute('data-status', 'present')
    expect(h.sheet.mock.calls.length).toBe(calls)
  })

  it('الانتقال بلا تغييرات لا يسأل', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    h.sheet.mockImplementation(async (_a: string, d: string | null) => sheetOf({ date: d ?? '2026-11-17' }))
    renderPanel(); await loaded()
    fireEvent.click(screen.getByTestId('mam-day-2026-11-16'))
    expect(confirm).not.toHaveBeenCalled()
    await waitFor(() => expect(h.sheet).toHaveBeenCalledWith('act1', '2026-11-16'))
  })

  it('أثناء تحميل اليوم الجديد تُعطَّل الأزرار فلا يُنسَب اختيار لليوم الخطأ', async () => {
    let release: (v: ManualSheet) => void = () => undefined
    h.sheet.mockImplementation((_a: string, d: string | null) => d === '2026-11-16' ? new Promise<ManualSheet>((r) => { release = r }) : Promise.resolve(sheetOf()))
    renderPanel(); await loaded()
    fireEvent.click(screen.getByTestId('mam-day-2026-11-16'))
    await waitFor(() => expect(screen.getByTestId('mam-panel')).toHaveAttribute('aria-busy', 'true'))
    expect(screen.getByTestId('mam-present-e1')).toBeDisabled()
    release(sheetOf({ date: '2026-11-16' }))
    await waitFor(() => expect(screen.getByTestId('mam-panel')).toHaveAttribute('aria-busy', 'false'))
    expect(screen.getByTestId('mam-present-e1')).toBeEnabled()
  })
})
