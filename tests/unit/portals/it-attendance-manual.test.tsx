/**
 * بوابة التطوير المركزية · «الحضور اليدوي (تعطل البصمة)» — التفعيل والإيقاف:
 *   اختيار البوابة والنطاق من الهيكل التنظيمي (مع اقتراح من أقسام أصحاب الحسابات) · معاينة قبل التنفيذ · حدود البدء والسبب
 *   · تأكيد ثم تفعيل · رفض الخادم بالعربية · التفعيلات السارية وعدّاداتها · حوار الإيقاف (آخر يوم مغطّى) · السجل · حجب الصلاحية.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const h = vi.hoisted(() => ({
  options: vi.fn(), preview: vi.fn(), list: vi.fn(), activate: vi.fn(), deactivate: vi.fn(), my: vi.fn(async () => []), users: vi.fn(),
}))
vi.mock('@sdk/attendance-manual.sdk', async (importOriginal) => {
  const m = await importOriginal<{ attendanceManual: object } & Record<string, unknown>>()
  return { ...m, attendanceManual: { ...m.attendanceManual, portalOptions: h.options, scopePreview: h.preview, list: h.list, activate: h.activate, deactivate: h.deactivate, myActivations: h.my } }
})
vi.mock('@features/user-management', () => ({ useUsers: (...args: unknown[]) => h.users(...args) }))
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [{ id: 'b1', name: 'الفرع الرئيسي', is_active: true }, { id: 'b2', name: 'فرع مغلق', is_active: false }] }) }))
vi.mock('@features/departments', () => ({
  useDepartments: () => ({ data: [
    { id: 'd1', name: 'المحطة التحويلية', code: 'ts', parent_id: null, is_active: true },
    { id: 'd2', name: 'الورشة', code: 'ws', parent_id: 'd1', is_active: true },
    { id: 'd3', name: 'سائق', code: 'jt', parent_id: 'd1', is_active: true, is_job_title: true },
  ] }),
}))

import AttendanceManualPage from '@portals/it/pages/Integrations/AttendanceManualPage'
import { useMyPermissionsStore, PERMISSION_DENIED_TITLE } from '@features/permissions/my-permissions'
import { useUiStore } from '@stores/ui.store'
import { ATTENDANCE_MANUAL_ERROR_MESSAGES, type ManualActivationRow, type ManualScopePreview } from '@sdk/attendance-manual.sdk'
import type { PlatformUser } from '@sdk/users.sdk'

const NOW = new Date('2026-11-17T09:00:00Z')   // اليوم في بغداد: 2026-11-17
const TODAY = '2026-11-17'

const row = (id: string, over: Partial<ManualActivationRow> = {}): ManualActivationRow => ({
  id, portal: 'transfer-station', portal_label: 'المحطة التحويلية', status: 'active', branch_id: null, department_id: 'd1', include_sub_departments: true,
  scope_label: 'قسم المحطة التحويلية وأقسامه الفرعية', starts_on: '2026-11-10', ends_on: null, reason: 'عطل الجهاز', activated_by_name: 'مهندس الشبكة', activated_at: '2026-11-10T06:00:00Z',
  ended_by_name: null, ended_at: null, end_note: null, employees: 12, entries: 30, pending_days: 4, pending_dates: 2, ...over,
})
const prev = (over: Partial<ManualScopePreview> = {}): ManualScopePreview => ({ employees: 12, no_pin: 2, contractors: 3, sample: ['أحمد', 'بسام', 'جاسم'], overlapping: [], ...over })
const platformUser = (id: string, roles: string[]): PlatformUser => ({
  id, email: `${id}@example.test`, created_at: '2026-01-01T00:00:00Z', last_sign_in_at: null, banned_until: null,
  roles: roles as PlatformUser['roles'], employee_id: null, employee_name: id, employee_number: null, phone: null,
  job_title: null, department_id: null, department_name: null,
})

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter><AttendanceManualPage /></MemoryRouter></QueryClientProvider>)
}
const stat = (id: string) => screen.getByTestId(id).querySelectorAll('p')[1]?.textContent
const toasts = () => useUiStore.getState().toasts
const change = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } })

/** يُجهّز نموذجاً صالحاً: البوابة + قسم d1 + سبب */
async function fillValid() {
  await screen.findByRole('option', { name: /المحطة التحويلية — 5 حساب/ })
  change('am-portal', 'transfer-station')
  change('am-department', 'd1')
  change('am-reason', 'عطل جهاز البصمة منذ الصباح')
  await screen.findByTestId('am-prev-employees')
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW)
  useMyPermissionsStore.getState().reset()
  useUiStore.setState({ toasts: [] })
  for (const f of [h.options, h.preview, h.list, h.activate, h.deactivate, h.users]) f.mockReset()
  h.my.mockClear()
  h.users.mockReturnValue({ data: [], isLoading: false, isError: false })
  h.options.mockResolvedValue([
    { portal: 'transfer-station', label: 'المحطة التحويلية', holders: 5, departments: [{ id: 'd1', name: 'المحطة التحويلية', employees: 12 }], branches: [{ id: 'b1', name: 'الفرع الرئيسي', employees: 20 }] },
    { portal: 'hr', label: 'الموارد البشرية', holders: 2, departments: [], branches: [] },
  ])
  h.preview.mockResolvedValue(prev())
  h.list.mockResolvedValue([])
  h.activate.mockResolvedValue({ id: 'new1', portal: 'transfer-station', starts_on: TODAY, employees: 12, cleared_auto_days: 0, other_active: [] })
  h.deactivate.mockResolvedValue({ id: 'a1', ends_on: TODAY, reevaluated_days: 0, pending_days: 0 })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('تفعيل جديد', () => {
  it('البداية: لا شيء مفعّل ⇒ الزر معطّل والتلميح يطلب نطاقاً، وقائمة البوابات من الخادم', async () => {
    renderPage()
    expect(await screen.findByRole('option', { name: /الموارد البشرية — 2 حساب/ })).toBeInTheDocument()
    expect(screen.getByTestId('am-activate')).toBeDisabled()
    expect(screen.getByTestId('am-scope-hint')).toBeInTheDocument()
    expect(screen.queryByTestId('am-preview')).toBeNull()
    expect(h.preview).not.toHaveBeenCalled()   // المعاينة لا تعمل قبل اختيار النطاق
    expect(await screen.findByTestId('am-active-empty')).toHaveTextContent('كل البوابات تعمل ببصمتها')
    expect(screen.getByTestId('am-starts-on')).toHaveValue(TODAY)
  })

  it('خيارات الأقسام شجرة بلا مسمّيات وظيفية، والفروع المغلقة مخفية', async () => {
    renderPage()
    await screen.findByRole('option', { name: /الموارد البشرية — 2 حساب/ })
    const depts = within(screen.getByTestId('am-department')).getAllByRole('option').map((o) => o.textContent)
    expect(depts).toEqual(['— بلا تقييد بقسم —', 'المحطة التحويلية', '– الورشة'])
    const branches = within(screen.getByTestId('am-branch')).getAllByRole('option').map((o) => o.textContent)
    expect(branches).toEqual(['— بلا تقييد بفرع —', 'الفرع الرئيسي'])
  })

  it('اختيار بوابة يعرض اقتراح أقسام موظفيها؛ النقر على الاقتراح يضبط القسم ويشغّل المعاينة بالنطاق الصحيح', async () => {
    renderPage()
    await screen.findByRole('option', { name: /المحطة التحويلية — 5 حساب/ })
    change('am-portal', 'transfer-station')
    expect(screen.getByTestId('am-suggestions')).toHaveTextContent('مقترَح من موظفي حسابات هذه البوابة')
    fireEvent.click(screen.getByTestId('am-sug-dept-d1'))
    expect(screen.getByTestId('am-department')).toHaveValue('d1')
    expect(screen.getByTestId('am-branch')).toHaveValue('')
    expect(screen.getByTestId('am-sug-dept-d1')).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(h.preview).toHaveBeenCalledWith({ branchId: null, departmentId: 'd1', includeSub: true }))
    expect(await screen.findByTestId('am-preview')).toHaveTextContent('قسم المحطة التحويلية وأقسامه الفرعية')
    expect([stat('am-prev-employees'), stat('am-prev-nopin'), stat('am-prev-contractors')]).toEqual(['12', '2', '3'])
    expect(screen.getByTestId('am-prev-sample')).toHaveTextContent('منهم: أحمد، بسام، جاسم … و9 آخرين')
    // اقتراح الفرع يستبدل القسم (نطاق واحد مقترَح في كل مرة)
    fireEvent.click(screen.getByTestId('am-sug-branch-b1'))
    expect(screen.getByTestId('am-branch')).toHaveValue('b1'); expect(screen.getByTestId('am-department')).toHaveValue('')
    await waitFor(() => expect(h.preview).toHaveBeenCalledWith({ branchId: 'b1', departmentId: null, includeSub: true }))
  })

  it('بوابة بلا اقتراحات (لا موظفين بأقسام) لا تعرض الاقتراحات، ويبقى الاختيار اليدوي', async () => {
    renderPage()
    await screen.findByRole('option', { name: /الموارد البشرية — 2 حساب/ })
    change('am-portal', 'hr')
    expect(screen.queryByTestId('am-suggestions')).toBeNull()
  })

  it('خانة «الأقسام الفرعية» تظهر مع القسم فقط، وإلغاؤها يُغيّر نطاق المعاينة', async () => {
    renderPage()
    await screen.findByRole('option', { name: /المحطة التحويلية — 5 حساب/ })
    expect(screen.queryByTestId('am-include-sub')).toBeNull()
    change('am-department', 'd1')
    expect(screen.getByTestId('am-include-sub')).toBeChecked()
    fireEvent.click(screen.getByTestId('am-include-sub'))
    await waitFor(() => expect(h.preview).toHaveBeenCalledWith({ branchId: null, departmentId: 'd1', includeSub: false }))
    expect(await screen.findByTestId('am-preview')).toHaveTextContent('قسم المحطة التحويلية (بلا فروعه)')
  })

  it('الزر لا يُفعَّل إلا باكتمال: بوابة + نطاق + سبب (3 أحرف) + معاينة صالحة', async () => {
    renderPage()
    await screen.findByRole('option', { name: /المحطة التحويلية — 5 حساب/ })
    change('am-department', 'd1'); await screen.findByTestId('am-prev-employees')
    change('am-reason', 'عطل')
    expect(screen.getByTestId('am-activate')).toBeDisabled()          // لا بوابة
    change('am-portal', 'transfer-station')
    expect(screen.getByTestId('am-activate')).toBeEnabled()
    change('am-reason', 'عط')
    expect(screen.getByTestId('am-activate')).toBeDisabled()          // السبب قصير
    change('am-reason', '   عط   ')
    expect(screen.getByTestId('am-activate')).toBeDisabled()          // الفراغات لا تُحتسب
    change('am-reason', 'عطل')
    expect(screen.getByTestId('am-activate')).toBeEnabled()
    change('am-department', '')
    expect(screen.getByTestId('am-activate')).toBeDisabled()          // لا نطاق
  })

  it('البدء: اليوم أو أحد الأيام الـ31 الماضية فقط (لا مستقبل ولا أقدم)', async () => {
    renderPage(); await fillValid()
    expect(screen.getByTestId('am-activate')).toBeEnabled()
    for (const bad of ['2026-11-18', '2026-10-16']) {   // غداً · 32 يوماً
      change('am-starts-on', bad)
      expect(screen.getByTestId('am-start-invalid')).toBeInTheDocument()
      expect(screen.getByTestId('am-activate')).toBeDisabled()
    }
    change('am-starts-on', '2026-10-17')   // 31 يوماً: الحد الأقصى المسموح
    expect(screen.queryByTestId('am-start-invalid')).toBeNull()
    expect(screen.getByTestId('am-activate')).toBeEnabled()
    expect(screen.getByText(/البدء بتاريخ سابق يزيل الحضور التلقائي/)).toBeInTheDocument()
  })

  it('نطاق بلا أي موظف ⇒ تنبيه أحمر والزر معطّل', async () => {
    h.preview.mockResolvedValue(prev({ employees: 0, sample: [], no_pin: 0 }))
    renderPage()
    await screen.findByRole('option', { name: /المحطة التحويلية — 5 حساب/ })
    change('am-portal', 'transfer-station'); change('am-department', 'd1'); change('am-reason', 'عطل الجهاز')
    expect(await screen.findByTestId('am-prev-empty')).toHaveTextContent('لا يوجد موظفون في هذا النطاق')
    expect(screen.getByTestId('am-activate')).toBeDisabled()
  })

  it('نطاق كل موظفيه بلا رقم بصمة ⇒ يُفعَّل (الموظف بلا بصمة يدخل الكشف)', async () => {
    h.preview.mockResolvedValue(prev({ employees: 5, sample: ['أحمد', 'بسام'], no_pin: 5 }))
    renderPage(); await fillValid()
    expect([stat('am-prev-employees'), stat('am-prev-nopin')]).toEqual(['5', '5'])
    expect(screen.queryByTestId('am-prev-empty')).not.toBeInTheDocument()
    expect(screen.getByTestId('am-activate')).toBeEnabled()
  })

  it('تقاطع مع تفعيل ساريٍ: تنبيه أصفر يسمّي البوابة لكن لا يمنع', async () => {
    h.preview.mockResolvedValue(prev({ overlapping: [{ id: 'x', portal: 'hr', portal_label: 'الموارد البشرية' }] }))
    renderPage(); await fillValid()
    expect(screen.getByTestId('am-prev-overlap')).toHaveTextContent('يتقاطع مع تفعيل ساريٍ: الموارد البشرية')
    expect(screen.getByTestId('am-activate')).toBeEnabled()
  })

  it('فشل المعاينة: رسالة خطأ ولا تفعيل', async () => {
    h.preview.mockRejectedValue(new Error('ATT_MANUAL_SCOPE_INVALID'))
    renderPage()
    await screen.findByRole('option', { name: /المحطة التحويلية — 5 حساب/ })
    change('am-portal', 'transfer-station'); change('am-department', 'd1'); change('am-reason', 'عطل الجهاز')
    expect(await screen.findByText(/تعذّرت المعاينة/)).toHaveTextContent(`تعذّرت المعاينة — ${ATTENDANCE_MANUAL_ERROR_MESSAGES.ATT_MANUAL_SCOPE_INVALID}`)   // رسالة عربية لا رمز خام
    expect(screen.getByTestId('am-activate')).toBeDisabled()
  })

  it('التفعيل: حوار تأكيد يلخّص ما سيحدث، ولا استدعاء قبل التأكيد، ثم يُرسل المعطيات كاملة ويعيد النموذج فارغاً', async () => {
    renderPage(); await fillValid()
    fireEvent.click(screen.getByTestId('am-activate'))
    const dlg = screen.getByTestId('am-confirm')
    expect(dlg).toHaveTextContent('المحطة التحويلية')
    expect(dlg).toHaveTextContent('12 موظفاً')
    expect(dlg).toHaveTextContent('تتوقف البصمة منطقياً')
    expect(dlg).toHaveTextContent('المتعهدون في النطاق يُدفعون من الأعداد')
    expect(h.activate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('am-confirm-activate'))
    await waitFor(() => expect(h.activate).toHaveBeenCalledWith({ portal: 'transfer-station', branchId: null, departmentId: 'd1', includeSub: true, reason: 'عطل جهاز البصمة منذ الصباح', startsOn: TODAY, recorderUserIds: [] }))
    await waitFor(() => expect(screen.queryByTestId('am-confirm')).toBeNull())
    await waitFor(() => expect(screen.getByTestId('am-portal')).toHaveValue(''))
    expect(screen.getByTestId('am-reason')).toHaveValue('')
    expect(toasts()).toEqual([expect.objectContaining({ type: 'success', message: expect.stringContaining('فُعّل الحضور اليدوي لـ 12 موظفاً') })])
    expect(h.my).toHaveBeenCalled()   // الشريط الجانبي لأصحاب البوابة يتحدّث
  })

  it('تبديل بوابة التفعيل يمسح الحسابات المختارة ويعيد فحص الأدوار على البوابة الجديدة', async () => {
    h.users.mockReturnValue({
      data: [platformUser('station-user', ['transfer_station']), platformUser('hr-user', ['hr_officer'])],
      isLoading: false,
      isError: false,
    })
    renderPage()
    await screen.findByRole('option', { name: /المحطة التحويلية — 5 حساب/ })
    change('am-portal', 'transfer-station')
    fireEvent.change(screen.getByTestId('am-recorder-search'), { target: { value: 'ac' } })
    fireEvent.click(await screen.findByTestId('am-recorder-option-station-user'))
    expect(screen.getByText('حسابات التسجيل الإضافية (1/5)')).toBeInTheDocument()

    change('am-portal', 'hr')
    expect(screen.getByText('حسابات التسجيل الإضافية (0/5)')).toBeInTheDocument()
    expect(await screen.findByTestId('am-recorder-option-hr-user')).toBeEnabled()
    expect(screen.getByTestId('am-recorder-option-station-user')).toBeDisabled()
  })

  it('إرسال حسابات التسجيل المختارة مع التفعيل ضمن معاملة واحدة', async () => {
    h.users.mockReturnValue({ data: [platformUser('station-user', ['transfer_station'])], isLoading: false, isError: false })
    renderPage()
    await screen.findByRole('option', { name: /المحطة التحويلية — 5 حساب/ })
    change('am-portal', 'transfer-station')
    fireEvent.change(screen.getByTestId('am-recorder-search'), { target: { value: 'ac' } })
    fireEvent.click(await screen.findByTestId('am-recorder-option-station-user'))
    change('am-department', 'd1')
    change('am-reason', 'عطل جهاز البصمة منذ الصباح')
    await screen.findByTestId('am-prev-employees')
    fireEvent.click(screen.getByTestId('am-activate'))
    expect(screen.getByTestId('am-confirm')).toHaveTextContent('1 حساب')
    fireEvent.click(screen.getByTestId('am-confirm-activate'))
    await waitFor(() => expect(h.activate).toHaveBeenCalledWith({
      portal: 'transfer-station', branchId: null, departmentId: 'd1', includeSub: true,
      reason: 'عطل جهاز البصمة منذ الصباح', startsOn: TODAY, recorderUserIds: ['station-user'],
    }))
  })

  it('إلغاء «الأقسام الفرعية» يُرسَل كما اختاره المستخدم (لا قيمة ثابتة)', async () => {
    renderPage(); await fillValid()
    fireEvent.click(screen.getByTestId('am-include-sub'))
    await waitFor(() => expect(h.preview).toHaveBeenCalledWith({ branchId: null, departmentId: 'd1', includeSub: false }))
    await screen.findByTestId('am-prev-employees')
    fireEvent.click(screen.getByTestId('am-activate'))
    expect(screen.getByTestId('am-confirm')).toHaveTextContent('بلا فروعه')
    fireEvent.click(screen.getByTestId('am-confirm-activate'))
    await waitFor(() => expect(h.activate).toHaveBeenCalledWith(expect.objectContaining({ departmentId: 'd1', includeSub: false })))
  })

  it('رفض الخادم (تفعيل مكرر): رسالة عربية، يُغلق التأكيد، ويبقى النموذج كما هو', async () => {
    h.activate.mockRejectedValue(new Error('ATT_MANUAL_DUPLICATE_ACTIVE'))
    renderPage(); await fillValid()
    fireEvent.click(screen.getByTestId('am-activate'))
    fireEvent.click(screen.getByTestId('am-confirm-activate'))
    await waitFor(() => expect(screen.queryByTestId('am-confirm')).toBeNull())
    expect(toasts()).toEqual([expect.objectContaining({ type: 'error', message: ATTENDANCE_MANUAL_ERROR_MESSAGES.ATT_MANUAL_DUPLICATE_ACTIVE })])
    expect(screen.getByTestId('am-portal')).toHaveValue('transfer-station')
    expect(screen.getByTestId('am-reason')).toHaveValue('عطل جهاز البصمة منذ الصباح')
  })
})

describe('التفعيلات السارية والسجل', () => {
  beforeEach(() => {
    h.list.mockResolvedValue([
      row('a1'),
      row('a2', { portal: 'hr', portal_label: 'الموارد البشرية', scope_label: 'فرع الفرع الرئيسي', employees: 5, entries: 0, pending_days: 0, pending_dates: 0, starts_on: '2026-11-16' }),
      row('e1', { status: 'ended', ends_on: '2026-11-12', ended_by_name: 'مهندس الشبكة', end_note: 'أُصلح الجهاز', pending_days: 0, pending_dates: 0, employees: 7 }),
    ])
  })

  it('العدّادات: السارية، المغطّون، المعلّق، المنتهية؛ وتنبيه الأيام المعلّقة', async () => {
    renderPage()
    await screen.findByTestId('am-item-a1')
    expect([stat('am-stat-active'), stat('am-stat-employees'), stat('am-stat-pending'), stat('am-stat-ended')]).toEqual(['2', '17', '4', '1'])
    expect(screen.getByTestId('am-pending-note')).toHaveTextContent('تمنع اعتماد حضورية الشهر')
    expect(screen.getByTestId('am-counters-a1')).toHaveTextContent('12 موظفاً · 30 تسجيلاً · 4 يوم-موظف بانتظار الكشف (في 2 يوم)')
    expect(screen.getByTestId('am-counters-a2')).toHaveTextContent('5 موظفاً · 0 تسجيلاً · 0 يوم-موظف بانتظار الكشف')
    expect(screen.getByTestId('am-item-a1')).toHaveTextContent('فعّله مهندس الشبكة')
    expect(screen.getByTestId('am-item-a1')).toHaveTextContent('السبب: عطل الجهاز')
    // السجل: المنتهية فقط وبملاحظة الإيقاف
    const ended = screen.getByTestId('am-ended-list')
    expect(within(ended).getByTestId('am-item-e1')).toHaveTextContent('الإيقاف: أُصلح الجهاز')
    expect(within(ended).getByTestId('am-item-e1')).toHaveTextContent('أوقفه مهندس الشبكة')
    expect(within(ended).queryByTestId('am-stop-e1')).toBeNull()   // المنتهي لا يُوقف
    expect(screen.queryByTestId('am-active-empty')).toBeNull()
  })

  it('بلا أيام معلّقة لا يظهر التنبيه', async () => {
    h.list.mockResolvedValue([row('a2', { pending_days: 0, pending_dates: 0 })])
    renderPage(); await screen.findByTestId('am-item-a2')
    expect(screen.queryByTestId('am-pending-note')).toBeNull()
    expect(screen.queryByTestId('am-ended-list')).toBeNull()
  })

  it('فشل تحميل القائمة: رسالة وزر إعادة المحاولة', async () => {
    h.list.mockRejectedValue(new Error('network'))
    renderPage()
    expect(await screen.findByText('تعذّر تحميل التفعيلات.')).toBeInTheDocument()
    h.list.mockResolvedValue([row('a1')])
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(await screen.findByTestId('am-item-a1')).toBeInTheDocument()
  })

  it('الإيقاف: آخر يوم مغطّى افتراضيه اليوم، ويُرسل مع الملاحظة، ثم يُغلق الحوار برسالة نجاح', async () => {
    h.deactivate.mockResolvedValue({ id: 'a1', ends_on: TODAY, reevaluated_days: 2, pending_days: 3 })
    renderPage()
    fireEvent.click(await screen.findByTestId('am-stop-a1'))
    expect(screen.getByTestId('am-last-day')).toHaveValue(TODAY)
    expect(screen.getByTestId('am-last-day')).toHaveAttribute('min', '2026-11-09')   // يوم قبل البدء
    expect(screen.getByTestId('am-last-day')).toHaveAttribute('max', TODAY)
    change('am-stop-note', '  أُصلح الجهاز  ')
    fireEvent.click(screen.getByTestId('am-stop-confirm'))
    await waitFor(() => expect(h.deactivate).toHaveBeenCalledWith('a1', TODAY, 'أُصلح الجهاز'))
    await waitFor(() => expect(screen.queryByTestId('am-stop-dialog')).toBeNull())
    expect(toasts()).toEqual([expect.objectContaining({ type: 'success', message: expect.stringContaining('بقي 3 يوم-موظف بانتظار الكشف') })])
  })

  it('آخر يوم أقدم من اليوم يُنبَّه أن ما بعده يُحسب من الجهاز؛ وخارج [يوم قبل البدء، اليوم] يعطّل التأكيد', async () => {
    renderPage()
    fireEvent.click(await screen.findByTestId('am-stop-a1'))
    change('am-last-day', '2026-11-14')
    expect(screen.getByText(/تُحسب من بصمات الجهاز الآن/)).toBeInTheDocument()
    expect(screen.getByTestId('am-stop-confirm')).toBeEnabled()
    for (const bad of ['2026-11-08', '2026-11-18']) {
      change('am-last-day', bad)
      expect(screen.getByTestId('am-stop-confirm')).toBeDisabled()
    }
    change('am-last-day', '2026-11-09')   // يوم قبل البدء مسموح (تعود البصمة من أول يوم)
    expect(screen.getByTestId('am-stop-confirm')).toBeEnabled()
    fireEvent.click(screen.getByTestId('am-stop-confirm'))
    await waitFor(() => expect(h.deactivate).toHaveBeenCalledWith('a1', '2026-11-09', null))
  })

  it('فشل الإيقاف: يبقى الحوار مفتوحاً مع رسالة الخطأ العربية', async () => {
    h.deactivate.mockRejectedValue(new Error('ATT_MANUAL_ALREADY_ENDED'))
    renderPage()
    fireEvent.click(await screen.findByTestId('am-stop-a1'))
    fireEvent.click(screen.getByTestId('am-stop-confirm'))
    await waitFor(() => expect(toasts()).toEqual([expect.objectContaining({ type: 'error', message: ATTENDANCE_MANUAL_ERROR_MESSAGES.ATT_MANUAL_ALREADY_ENDED })]))
    expect(screen.getByTestId('am-stop-dialog')).toBeInTheDocument()
  })
})

describe('الصلاحيات', () => {
  it('بلا صلاحية «تنفيذ» الوحدة: التفعيل والإيقاف معطّلان بتلميح (والخادم يرفض على أي حال)', async () => {
    useMyPermissionsStore.getState().set('u1', { 'it.integrations.attendance-manual': ['view'] })
    h.list.mockResolvedValue([row('a1')])
    renderPage(); await fillValid()
    expect(screen.getByTestId('am-activate')).toBeDisabled()
    expect(screen.getByTestId('am-activate')).toHaveAttribute('title', PERMISSION_DENIED_TITLE)
    expect(screen.getByTestId('am-stop-a1')).toBeDisabled()
    expect(screen.getByTestId('am-stop-a1')).toHaveAttribute('title', PERMISSION_DENIED_TITLE)
  })

  it('مع صلاحية «تنفيذ»: الأزرار تعمل بلا تلميح', async () => {
    useMyPermissionsStore.getState().set('u1', { 'it.integrations.attendance-manual': ['view', 'execute'] })
    h.list.mockResolvedValue([row('a1')])
    renderPage(); await fillValid()
    expect(screen.getByTestId('am-activate')).toBeEnabled()
    expect(screen.getByTestId('am-activate')).not.toHaveAttribute('title')
    expect(screen.getByTestId('am-stop-a1')).toBeEnabled()
  })
})
