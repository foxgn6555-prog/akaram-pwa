/**
 * الصفحة العامة «الحضور اليدوي» (/<portal>/manual-attendance) — تفعيلات البوابة:
 *   ترتيب (الساري أولاً ثم الأحدث) · البوابة العادية ترى التفعيلات المفوّضة لها؛ غرفة العمليات وحدها ترى الكل · تبويب عند التعدد
 *   · حالة فارغة · التحميل عند الفتح برابط مباشر · تفعيل منتهٍ بقي فيه معلّق.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const h = vi.hoisted(() => ({ my: vi.fn(), sheet: vi.fn() }))
vi.mock('@sdk/attendance-manual.sdk', async (importOriginal) => {
  const m = await importOriginal<{ attendanceManual: object } & Record<string, unknown>>()
  return { ...m, attendanceManual: { ...m.attendanceManual, myActivations: h.my, sheet: h.sheet } }
})

import ManualAttendancePage, { activationsForPortal } from '@features/attendance-manual/pages/ManualAttendancePage'
import { useManualActivationsStore } from '@features/attendance-manual/store'
import type { ManualMyActivation, ManualSheet } from '@sdk/attendance-manual.sdk'

const act = (id: string, portal: string, over: Partial<ManualMyActivation> = {}): ManualMyActivation => ({
  id, portal, portal_label: `بوابة ${portal}`, status: 'active', starts_on: '2026-11-10', ends_on: null, pending: 0, scope_label: `نطاق ${id}`, ...over,
})
const sheetFor = (id: string): ManualSheet => ({
  activation: { id, portal: 'transfer-station', portal_label: 'المحطة التحويلية', status: 'active', starts_on: '2026-11-10', ends_on: null, reason: 'عطل', branch_id: null, department_id: 'd1', include_sub_departments: true, scope_label: `نطاق ${id}` },
  date: '2026-11-17', today: '2026-11-17', from: '2026-11-10', to: '2026-11-17', lock: null, can_review: false, days: [{ date: '2026-11-17', total: 1, entered: 0, pending: 1 }],
  employees: [{ id: 'e1', name: 'أحمد', number: '101', job_title: null, department: null, has_shift: true, state: 'open', entry: null, note: null, by: null, at: null, punches: 0, first_punch: null, last_punch: null, status: null, source: null }],
  excluded: { no_pin: 0, contractors: 0 }, included_no_pin: 0,
})

const renderPage = (portal: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ManualAttendancePage portal={portal} /></QueryClientProvider>)
}

beforeEach(() => {
  useManualActivationsStore.getState().reset()
  h.my.mockReset(); h.sheet.mockReset()
  h.sheet.mockImplementation(async (id: string) => sheetFor(id))
})

describe('activationsForPortal', () => {
  const items = [
    act('old-ended', 'hr', { status: 'ended', ends_on: '2026-11-05', starts_on: '2026-11-01' }),
    act('new', 'hr', { starts_on: '2026-11-15' }),
    act('older', 'hr', { starts_on: '2026-11-08' }),
    act('other', 'transfer-station'),
    act('admin-only', 'admin', { starts_on: '2026-11-16' }),
  ]
  it('بوابة عادية: تفعيلاتها فقط، الساري أولاً (الأحدث بدءاً) ثم المنتهي', () => {
    expect(activationsForPortal('hr', items).map((a) => a.id)).toEqual(['new', 'older', 'old-ended'])
    expect(activationsForPortal('transfer-station', items).map((a) => a.id)).toEqual(['other'])
    expect(activationsForPortal('finance', items)).toEqual([])
  })
  it('غرفة العمليات وحدها ترى كل التفعيلات؛ الإدارة ترى ما فُوّض إليها فقط', () => {
    expect(activationsForPortal('ops-room', items).map((a) => a.id)).toEqual(['admin-only', 'new', 'other', 'older', 'old-ended'])
    expect(activationsForPortal('admin', items).map((a) => a.id)).toEqual(['admin-only'])
    expect(activationsForPortal('manager', items)).toEqual([])
  })
  it('لا يعدّل المصفوفة الأصلية', () => {
    const copy = [...items]
    activationsForPortal('ops-room', items)
    expect(items).toEqual(copy)
  })
})

describe('ManualAttendancePage', () => {
  it('يحمّل التفعيلات عند الفتح (رابط مباشر من إشعار) ثم يعرض كشف أول تفعيل لبوابته', async () => {
    h.my.mockResolvedValue([act('a1', 'transfer-station', { portal_label: 'المحطة التحويلية', scope_label: 'قسم المحطة' }), act('x', 'hr')])
    renderPage('transfer-station')
    expect(await screen.findByTestId('manual-attendance-page')).toBeInTheDocument()
    expect(h.my).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('manual-attendance-scope')).toHaveTextContent('المحطة التحويلية')
    expect(screen.getByTestId('manual-attendance-scope')).toHaveTextContent('قسم المحطة')
    expect(screen.getByTestId('manual-attendance-scope')).toHaveTextContent('البصمة موقوفة — الكشف هو المصدر')
    expect(screen.queryByTestId('manual-attendance-tabs')).toBeNull()   // تفعيل واحد ⇒ لا تبويبات
    await waitFor(() => expect(h.sheet).toHaveBeenCalledWith('a1', null))
    expect(await screen.findByTestId('mam-panel')).toBeInTheDocument()
    expect(h.sheet).not.toHaveBeenCalledWith('x', expect.anything())   // تفعيل بوابة أخرى لا يُحمَّل
  })

  it('أثناء التحميل: مؤشر انتظار فقط — لا تُعرَض رسالة «لا تفعيل» قبل أن يُعرف الواقع', async () => {
    let release: (v: ManualMyActivation[]) => void = () => undefined
    h.my.mockImplementation(() => new Promise<ManualMyActivation[]>((r) => { release = r }))
    renderPage('hr')
    expect(screen.queryByTestId('manual-attendance-page')).toBeNull()
    expect(screen.queryByTestId('manual-attendance-empty')).toBeNull()
    release([act('a1', 'hr')])
    expect(await screen.findByTestId('manual-attendance-page')).toBeInTheDocument()
    expect(screen.queryByTestId('manual-attendance-empty')).toBeNull()
  })

  it('بلا تفعيل ولا معلّق: رسالة فارغة تشرح كيف يُفعَّل (من التطوير المركزية)', async () => {
    h.my.mockResolvedValue([])
    renderPage('hr')
    expect(await screen.findByTestId('manual-attendance-empty')).toHaveTextContent('اطلب من التطوير المركزية')
    expect(h.sheet).not.toHaveBeenCalled()
  })

  it('فشل تحميل القائمة: يُعرَض الفارغ لا شاشة تحميل أبدية', async () => {
    h.my.mockRejectedValue(new Error('network'))
    renderPage('hr')
    expect(await screen.findByTestId('manual-attendance-empty')).toBeInTheDocument()
  })

  it('تفعيلان لبوابة واحدة: تبويبان، والتبديل بينهما يُحمّل كشف الآخر بنطاقه', async () => {
    h.my.mockResolvedValue([act('a1', 'hr', { scope_label: 'قسم الأرشيف', starts_on: '2026-11-12' }), act('a2', 'hr', { scope_label: 'فرع الكرادة', starts_on: '2026-11-10', pending: 3 })])
    renderPage('hr')
    const tabs = await screen.findByTestId('manual-attendance-tabs')
    expect(tabs).toHaveTextContent('قسم الأرشيف'); expect(tabs).toHaveTextContent('فرع الكرادة')
    expect(tabs).not.toHaveTextContent('بوابة hr')   // بوابة واحدة ⇒ لا تُكرَّر تسميتها
    expect(screen.getByTestId('manual-tab-a2')).toHaveTextContent('3 بانتظار الكشف')
    expect(screen.getByTestId('manual-tab-a1')).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(h.sheet).toHaveBeenCalledWith('a1', null))
    fireEvent.click(screen.getByTestId('manual-tab-a2'))
    expect(screen.getByTestId('manual-tab-a2')).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(h.sheet).toHaveBeenCalledWith('a2', null))
    expect(screen.getByTestId('manual-attendance-scope')).toHaveTextContent('فرع الكرادة')
  })

  it('التبديل بين التفعيلين يطرح مسودة الأول (لا تُنسَب اختيارات تفعيل لآخر)', async () => {
    h.my.mockResolvedValue([act('a1', 'hr', { starts_on: '2026-11-12' }), act('a2', 'hr', { starts_on: '2026-11-10' })])
    renderPage('hr')
    await screen.findByTestId('mam-rows')
    fireEvent.click(screen.getByTestId('mam-present-e1'))
    expect(screen.getByTestId('mam-row-e1')).toHaveAttribute('data-status', 'present')
    fireEvent.click(screen.getByTestId('manual-tab-a2'))
    await waitFor(() => expect(h.sheet).toHaveBeenCalledWith('a2', null))
    await waitFor(() => expect(screen.getByTestId('mam-panel')).toHaveAttribute('aria-busy', 'false'))
    expect(screen.getByTestId('mam-row-e1')).toHaveAttribute('data-status', 'none')
    expect(screen.getByTestId('mam-dirty')).toHaveTextContent('لا تغييرات غير محفوظة')
  })

  it('غرفة العمليات ترى تفعيلات بوابات متعددة وتُسمّى البوابة في التبويب', async () => {
    h.my.mockResolvedValue([act('a1', 'hr', { portal_label: 'الموارد البشرية', scope_label: 'قسم الأرشيف' }), act('a2', 'transfer-station', { portal_label: 'المحطة التحويلية', scope_label: 'قسم المحطة', starts_on: '2026-11-09' })])
    renderPage('ops-room')
    const tabs = await screen.findByTestId('manual-attendance-tabs')
    expect(tabs).toHaveTextContent('الموارد البشرية — قسم الأرشيف')
    expect(tabs).toHaveTextContent('المحطة التحويلية — قسم المحطة')
  })

  it('تفعيل منتهٍ بقي فيه معلّق: شارة «عادت البصمة — أكمل المعلّق» ولا «الكشف هو المصدر»', async () => {
    h.my.mockResolvedValue([act('a1', 'hr', { status: 'ended', ends_on: '2026-11-15', pending: 2 })])
    renderPage('hr')
    const scope = await screen.findByTestId('manual-attendance-scope')
    expect(scope).toHaveTextContent('عادت البصمة — أكمل المعلّق')
    expect(scope).not.toHaveTextContent('الكشف هو المصدر')
  })

  it('المخزن المحمَّل مسبقاً (من AppShell) يُعرض فوراً ثم يُحدَّث بإعادة التحميل', async () => {
    useManualActivationsStore.getState().set([act('a1', 'hr')])
    h.my.mockResolvedValue([act('a1', 'hr'), act('a9', 'hr', { starts_on: '2026-11-16', scope_label: 'جديد' })])
    renderPage('hr')
    expect(screen.getByTestId('manual-attendance-page')).toBeInTheDocument()   // بلا انتظار
    expect(await screen.findByTestId('manual-tab-a9')).toBeInTheDocument()      // وصل التحديث
  })
})
