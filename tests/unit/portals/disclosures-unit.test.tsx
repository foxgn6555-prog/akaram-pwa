/**
 * 00170 واجهات وحدة الكشوفات:
 *  غرفة العمليات (تبويبات · نموذج: هدف آلية/موظف من النظام فقط · نوع يقيّد العقوبات ويقترح المبلغ · حفظ/رفع)
 *  المعاون/المدير المفوض (وارد · مبلغ · اعتماد · إعادة بسبب) · IT (أنواع الكشوفات · إخفاء الوحدات) · إخفاء الوحدات في القوائم · عقود المسارات
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'

const TYPES = [
  { key: 'delay', label: 'تأخر عن الدوام', description: null, allowed_penalties: ['warning', 'reprimand'], default_amount: null, is_active: true, sort_order: 10, updated_at: 'x', updated_by_name: null, used: 3 },
  { key: 'speeding', label: 'سرعة زائدة', description: 'تجاوز السرعة', allowed_penalties: ['warning'], default_amount: 5000, is_active: true, sort_order: 20, updated_at: 'x', updated_by_name: null, used: 0 },
  { key: 'old', label: 'قديم', description: null, allowed_penalties: [], default_amount: null, is_active: false, sort_order: 30, updated_at: 'x', updated_by_name: null, used: 1 },
]
const V1 = { id: 'v1', db_number: 'DB-101', plate_number: '12345', vehicle_name: 'كابسة', driver_name: 'كريم جبار', shift: 'evening', sector: 'الزعفرانية 1', parent_sector: 'الزعفرانية', driver_employee_id: 'e9', driver_employee_name: 'كريم جبار', driver_employee_number: 'EMP-9' }
const E1 = { id: 'e2', full_name: 'سارة محمد', employee_number: 'EMP-2', job_title: 'محاسبة', department_name: 'المالية' }
const base = {
  id: 'd1', ref_no: 'DS-2026-00001', status: 'pending', target_kind: 'vehicle', target_label: 'كريم جبار (DB-101)', vehicle_id: 'v1', employee_id: 'e9', employee_name: 'كريم جبار', employee_number: 'EMP-9', department_name: null, job_title: 'سائق',
  db_number: 'DB-101', driver_name: 'كريم جبار', vehicle_type: 'كابسة', contractor_name: null, sector: 'الزعفرانية 1', shift: 'evening', log_date: '2026-09-20', period_month: '2026-09-01', violation_type: 'speeding', type_label: 'سرعة زائدة', penalty_type: 'warning',
  details: 'تجاوز السرعة في الشارع العام', amount: 5000, amount_by_name: null, amount_note: null, prepared_by: 'u-ops', prepared_by_name: 'موظف العمليات', submitted_at: '2026-10-01T08:00:00Z', resubmit_count: 0, chain_id: 'c1',
  current_step: 'معاون المدير المفوض', current_approvers: ['المعاون'], can_decide: true, return_reason: null, returned_by_name: null, returned_at: null, approved_by_name: null, approved_at: null, cancelled_by_name: null, cancelled_at: null, cancel_reason: null,
  deduction_posted: false, deduction_month: null, deduction_note: null, created_at: '2026-10-01T07:00:00Z', updated_at: '2026-10-01T08:00:00Z',
  events: [{ id: 1, action: 'created', actor_name: 'موظف العمليات', note: null, amount: null, at: '2026-10-01T07:00:00Z' }, { id: 2, action: 'submitted', actor_name: 'موظف العمليات', note: null, amount: null, at: '2026-10-01T08:00:00Z' }],
  timeline: [{ step_no: 1, label: 'معاون المدير المفوض', status: 'pending', decided_by: null, decided_at: null, note: null, approvers: ['المعاون'] }, { step_no: 2, label: 'المدير المفوض', status: 'waiting', decided_by: null, decided_at: null, note: null, approvers: [] }],
}
const h = vi.hoisted(() => ({
  types: vi.fn(async () => [] as unknown[]), saveType: vi.fn(async () => [] as unknown[]),
  vehicles: vi.fn(async () => [] as unknown[]), employees: vi.fn(async () => [] as unknown[]),
  save: vi.fn(async (_id: string | null, _input: Record<string, unknown>) => ({}) as unknown), submit: vi.fn(async (_id: string) => ({}) as unknown), decide: vi.fn(async (_id: string, _approve: boolean, _note?: string | null, _amount?: number | null) => ({}) as unknown), cancel: vi.fn(async (_id: string, _reason: string) => ({}) as unknown),
  get: vi.fn(async () => ({}) as unknown), list: vi.fn(async () => [] as unknown[]), inbox: vi.fn(async () => [] as unknown[]),
  stats: vi.fn(async () => ({ month: '2026-10-01', total: 2, by_status: { pending: 1, returned: 1 }, by_type: [{ key: 'speeding', label: 'سرعة زائدة', count: 2 }], by_preparer: [{ name: 'موظف العمليات', count: 2 }], amount_approved: 0, amount_pending: 5000, deductions_posted: 0, inbox: 0, months: [] })),
  report: vi.fn(async (_f: Record<string, unknown>) => ({ from: '2026-10-01', to: '2026-10-31', totals: { count: 4, pending: 1, returned: 0, approved: 2, cancelled: 1, amount_approved: 25000, amount_pending: 5000, employees: 1, vehicles: 2, avg_decision_hours: 6.5 },
    by_type: [{ key: 'speeding', label: 'سرعة زائدة', count: 3, approved: 2, amount: 25000 }, { key: 'delay', label: 'تأخر عن الدوام', count: 1, approved: 0, amount: 0 }], by_penalty: [{ key: 'warning', count: 4 }], by_target: { vehicle: 3, employee: 1 },
    by_sector: [{ sector: 'الزعفرانية 1', count: 4, approved: 2, amount: 25000 }], by_shift: { evening: 4 }, by_preparer: [{ name: 'موظف العمليات', count: 4, returned: 1 }],
    by_month: [{ month: '2026-10', count: 4, approved: 2, amount: 25000 }], top_employees: [{ employee_id: 'e2', name: 'سارة محمد', employee_number: 'EMP-2', department: 'المالية', count: 1, approved: 1, amount: 10000 }],
    top_vehicles: [{ db_number: 'DB-101', driver_name: 'كريم جبار', contractor_name: null, count: 3, approved: 1, amount: 15000 }],
    deductions: { with_amount: 2, posted: 1, awaiting_export: 1, exported: 0, approved_by_finance: 0, missing: 0, not_linked: 1, amount_posted: 10000 },
    rows: [{ id: 'd1', ref_no: 'DS-1', log_date: '2026-10-03', target_kind: 'vehicle', db_number: 'DB-101', driver_name: 'كريم جبار', employee_number: null, department_name: null, sector: 'الزعفرانية 1', shift: 'evening', violation_type: 'speeding', penalty_type: 'warning', status: 'approved', amount: 15000, prepared_by_name: 'موظف العمليات', deduction_state: 'awaiting_export', approved_at: '2026-10-04T08:00:00Z' }] }) as unknown),
  myHidden: vi.fn(async () => ({}) as Record<string, string[]>), hiddenGet: vi.fn(async () => [] as string[]), hiddenSet: vi.fn(async (_u: string, _p: string, paths: string[]) => paths),
}))
vi.mock('@sdk/disclosures-unit.sdk', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, disclosuresUnit: { types: h.types, saveType: h.saveType, vehicles: h.vehicles, employees: h.employees, save: h.save, submit: h.submit, decide: h.decide, cancel: h.cancel, get: h.get, list: h.list, inbox: h.inbox, stats: h.stats, report: h.report, myHiddenUnits: h.myHidden, hiddenUnitsGet: h.hiddenGet, hiddenUnitsSet: h.hiddenSet } }
})
vi.mock('@features/auth/hooks/useAuth', () => ({ useAuth: () => ({ data: { id: 'u1', roles: ['ops_room'], full_name: 'موظف' } }), useLogout: () => ({ mutate: vi.fn() }) }))

import OpsDisclosuresPage from '@portals/ops-room/pages/Disclosures/OpsDisclosuresPage'
import IncomingStatements from '@portals/deputy/pages/IncomingStatements'
import AdminDisclosures from '@portals/admin/pages/AdminDisclosures'
import DisclosureTypesPage from '@portals/it/pages/UserManagement/DisclosureTypesPage'
import { OpsUnitsCard } from '@portals/it/pages/UserManagement/OpsUnitsCard'
import { filterVisibleUnits, loadMyHiddenUnits, useHiddenUnitsStore } from '@features/portal-visibility'
import { Sidebar } from '@components/layout/Sidebar/Sidebar'
import { PORTAL_UNITS, type SidebarUnit } from '@config/portals.config'
import { PORTALS, PORTAL_DEFINITIONS } from '@lib/constants/portals.constants'
import { ROLE_LABELS } from '@lib/constants/roles.constants'
import { PORTAL_ROUTES } from '@router/routes.config'
import { customRoutes as opsRoutes } from '@portals/ops-room/routes'
import { customRoutes as itRoutes } from '@portals/it/routes'

const wrap = (node: ReactNode, path = '/ops-room/disclosures') => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[path]}>{node}</MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  vi.clearAllMocks()
  h.types.mockResolvedValue(TYPES); h.vehicles.mockResolvedValue([V1]); h.employees.mockResolvedValue([E1])
  h.list.mockResolvedValue([base]); h.inbox.mockResolvedValue([base]); h.get.mockResolvedValue(base)
  h.save.mockImplementation(async (_id: string | null, input: Record<string, unknown>) => ({ ...base, id: 'd-new', status: 'draft', ...input }))
  h.submit.mockImplementation(async (id: string) => ({ ...base, id, status: 'pending' }))
  h.decide.mockImplementation(async (id: string, approve: boolean, note?: string | null, amount?: number | null) => ({ ...base, id, amount: amount ?? null, status: approve ? 'approved' : 'returned', return_reason: note ?? null, deduction_posted: approve && amount != null }))
  useHiddenUnitsStore.getState().reset()
})

describe('غرفة العمليات — وحدة الكشوفات', () => {
  it('اللوحة والتبويبات: إحصاءات الشهر + عدّاد المُعادة + الأرشيف والقائمة من RPC بنطاقات صحيحة', async () => {
    wrap(<OpsDisclosuresPage />)
    expect(await screen.findByTestId('disc-dashboard')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('disc-tiles')).toHaveTextContent('مُعادة للتصحيح'))
    expect(screen.getByTestId('tab-returned')).toHaveTextContent('1')
    fireEvent.click(screen.getByTestId('tab-list'))
    await waitFor(() => expect(h.list).toHaveBeenCalledWith(expect.objectContaining({ scope: 'active' })))
    expect(await screen.findByTestId('list-active')).toHaveTextContent('DS-2026-00001')
    fireEvent.click(screen.getByTestId('tab-archive'))
    await waitFor(() => expect(h.list).toHaveBeenCalledWith(expect.objectContaining({ scope: 'archive' })))
    fireEvent.click(screen.getByTestId('tab-returned'))
    await waitFor(() => expect(h.list).toHaveBeenCalledWith(expect.objectContaining({ scope: 'returned' })))
  })

  it('كشف جديد على آلية: البحث يعرض نتائج قاعدة الآليات ويعبّئ السائق/القاطع، والنوع يقيّد العقوبات ويقترح المبلغ، ثم حفظ ورفع', async () => {
    wrap(<OpsDisclosuresPage />)
    fireEvent.click(await screen.findByTestId('new-disclosure-btn'))
    expect(screen.getByTestId('target-vehicle')).toHaveAttribute('aria-selected', 'true')
    fireEvent.change(screen.getByTestId('target-search'), { target: { value: 'DB-1' } })
    await waitFor(() => expect(h.vehicles).toHaveBeenCalledWith('DB-1'))
    fireEvent.click(await screen.findByTestId('opt-v1'))
    const sel = screen.getByTestId('target-selected')
    expect(sel).toHaveTextContent('DB-101'); expect(sel).toHaveTextContent('كريم جبار'); expect(sel).toHaveTextContent('الزعفرانية 1'); expect(sel).toHaveTextContent('EMP-9')
    expect((screen.getByTestId('shift-select') as HTMLSelectElement).value).toBe('evening')
    // النوع المعطّل لا يظهر
    const typeSel = screen.getByTestId('type-select') as HTMLSelectElement
    expect([...typeSel.options].map((o) => o.value)).toEqual(['', 'delay', 'speeding'])
    fireEvent.change(typeSel, { target: { value: 'speeding' } })
    await waitFor(() => expect((screen.getByTestId('amount') as HTMLInputElement).value).toBe('5000'))
    const pen = screen.getByTestId('penalty-select') as HTMLSelectElement
    expect([...pen.options].map((o) => o.value)).toEqual(['', 'warning'])
    fireEvent.change(pen, { target: { value: 'warning' } })
    fireEvent.change(screen.getByTestId('details'), { target: { value: 'تجاوز السرعة في الشارع العام' } })
    fireEvent.change(screen.getByTestId('log-date'), { target: { value: '2026-09-20' } })
    fireEvent.click(screen.getByTestId('save-submit'))
    await waitFor(() => expect(h.save).toHaveBeenCalled())
    const [id, input] = h.save.mock.calls[0] as unknown as [string | null, Record<string, unknown>]
    expect(id).toBeNull()
    expect(input).toMatchObject({ target_kind: 'vehicle', vehicle_id: 'v1', employee_id: null, violation_type: 'speeding', penalty_type: 'warning', amount: 5000, log_date: '2026-09-20', shift: 'evening', sector: 'الزعفرانية 1' })
    await waitFor(() => expect(h.submit).toHaveBeenCalledWith('d-new'))
  })

  it('كشف على موظف: الاسم يُختار من الموارد البشرية فقط (لا كتابة حرة) ويُرسل employee_id', async () => {
    wrap(<OpsDisclosuresPage />)
    fireEvent.click(await screen.findByTestId('new-disclosure-btn'))
    fireEvent.click(screen.getByTestId('target-employee'))
    fireEvent.change(screen.getByTestId('target-search'), { target: { value: 'سارة' } })
    await waitFor(() => expect(h.employees).toHaveBeenCalledWith('سارة'))
    fireEvent.click(await screen.findByTestId('opt-e2'))
    expect(screen.getByTestId('target-selected')).toHaveTextContent('المالية')
    fireEvent.change(screen.getByTestId('type-select'), { target: { value: 'delay' } })
    fireEvent.change(screen.getByTestId('details'), { target: { value: 'تأخر ساعتين عن الدوام' } })
    expect(screen.queryByTestId('contractor')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('save-draft'))
    await waitFor(() => expect(h.save).toHaveBeenCalled())
    expect((h.save.mock.calls[0] as unknown as [null, Record<string, unknown>])[1]).toMatchObject({ target_kind: 'employee', employee_id: 'e2', vehicle_id: null, violation_type: 'delay', amount: null })
    expect(h.submit).not.toHaveBeenCalled()
  })

  it('زر الحفظ معطّل حتى اكتمال الحقول الإلزامية (هدف + نوع + تفاصيل)', async () => {
    wrap(<OpsDisclosuresPage />)
    fireEvent.click(await screen.findByTestId('new-disclosure-btn'))
    expect(screen.getByTestId('save-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('details'), { target: { value: 'تفاصيل كافية' } })
    expect(screen.getByTestId('form-errors')).toHaveTextContent('اختر الآلية')
    expect(screen.getByTestId('save-submit')).toBeDisabled()
  })

  it('درج التفاصيل: سجل الأحداث ومسار الموافقة؛ كشف مُعاد يُظهر السبب وأزرار إعادة الرفع/التعديل/الإلغاء', async () => {
    h.get.mockResolvedValue({ ...base, status: 'returned', can_decide: false, return_reason: 'نقص في المعلومات', returned_by_name: 'المعاون', returned_at: '2026-10-02T09:00:00Z' })
    h.list.mockResolvedValue([{ ...base, status: 'returned' }])
    wrap(<OpsDisclosuresPage />, '/ops-room/disclosures?tab=returned')
    fireEvent.click(await screen.findByTestId('disc-row-d1'))
    const drawer = await screen.findByTestId('disc-drawer')
    expect(await within(drawer).findByTestId('disc-return-banner')).toHaveTextContent('نقص في المعلومات')
    expect(within(drawer).getByTestId('disc-events')).toHaveTextContent('رُفع للموافقة')
    expect(within(drawer).getByTestId('disc-timeline')).toHaveTextContent('المدير المفوض')
    expect(within(drawer).queryByTestId('disc-decision')).not.toBeInTheDocument()
    expect(within(drawer).getByTestId('ops-submit')).toHaveTextContent('إعادة الرفع')
    fireEvent.click(within(drawer).getByTestId('ops-cancel-open'))
    fireEvent.change(within(drawer).getByTestId('cancel-reason'), { target: { value: 'مكرر' } })
    fireEvent.click(within(drawer).getByTestId('cancel-confirm'))
    await waitFor(() => expect(h.cancel).toHaveBeenCalledWith('d1', 'مكرر'))
  })
})

describe('المعاون والمدير المفوض — الوارد والقرار', () => {
  it('المعاون: الوارد من disclosure_inbox، تحديد مبلغ 5000 واعتماد', async () => {
    wrap(<IncomingStatements />, '/deputy/statements')
    expect(await screen.findByTestId('deputy-statements')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('inbox-count')).toHaveTextContent('1'))
    fireEvent.click(screen.getAllByTestId('decide-d1')[0] as HTMLElement)
    const drawer = await screen.findByTestId('disc-drawer')
    const dec = await within(drawer).findByTestId('disc-decision')
    expect(dec).toHaveTextContent('معاون المدير المفوض')
    fireEvent.change(within(dec).getByTestId('decide-amount'), { target: { value: '7500' } })
    fireEvent.click(within(dec).getByTestId('decide-approve'))
    await waitFor(() => expect(h.decide).toHaveBeenCalledWith('d1', true, null, 7500))
  })
  it('إعادة بسبب: زر التأكيد معطّل بلا سبب، ثم يُرسل approve=false مع السبب', async () => {
    wrap(<IncomingStatements />, '/deputy/statements')
    fireEvent.click((await screen.findAllByTestId('decide-d1'))[0] as HTMLElement)
    const dec = await screen.findByTestId('disc-decision')
    fireEvent.click(within(dec).getByTestId('decide-return-open'))
    expect(within(dec).getByTestId('decide-return')).toBeDisabled()
    fireEvent.change(within(dec).getByTestId('decide-reason'), { target: { value: 'أضف اسم السائق الصحيح' } })
    fireEvent.click(within(dec).getByTestId('decide-return'))
    await waitFor(() => expect(h.decide).toHaveBeenCalledWith('d1', false, 'أضف اسم السائق الصحيح', undefined))
  })
  it('المدير المفوض: نفس الوارد مع خطوة «المدير المفوض»؛ المبلغ قابل للتعديل؛ تبويب الملغاة يطلب scope=cancelled', async () => {
    h.inbox.mockResolvedValue([{ ...base, current_step: 'المدير المفوض', amount: 5000 }])
    h.get.mockResolvedValue({ ...base, current_step: 'المدير المفوض', amount: 5000 })
    wrap(<AdminDisclosures />, '/admin/disclosures')
    expect(await screen.findByTestId('admin-disclosures')).toBeInTheDocument()
    fireEvent.click((await screen.findAllByTestId('decide-d1'))[0] as HTMLElement)
    const dec = await screen.findByTestId('disc-decision')
    expect((within(dec).getByTestId('decide-amount') as HTMLInputElement).value).toBe('5000')
    fireEvent.change(within(dec).getByTestId('decide-amount'), { target: { value: '' } })
    fireEvent.click(within(dec).getByTestId('decide-approve'))
    await waitFor(() => expect(h.decide).toHaveBeenCalledWith('d1', true, null, null))
    await waitFor(() => expect(screen.queryByTestId('disc-drawer')).not.toBeInTheDocument())   // يُغلق تلقائياً بعد الاعتماد النهائي
    fireEvent.click(screen.getByTestId('tab-cancelled'))
    await waitFor(() => expect(h.list).toHaveBeenCalledWith(expect.objectContaining({ scope: 'cancelled' })))
  })
  it('كشف معتمد بمبلغ يُظهر أنه أُضيف للحضورية وشهر الاستقطاع', async () => {
    h.get.mockResolvedValue({ ...base, status: 'approved', can_decide: false, deduction_posted: true, deduction_month: '2026-09-01', approved_by_name: 'المدير المفوض', approved_at: '2026-10-03T10:00:00Z' })
    wrap(<AdminDisclosures />, '/admin/disclosures')
    fireEvent.click((await screen.findAllByTestId('decide-d1'))[0] as HTMLElement)
    const b = await screen.findByTestId('disc-approved-banner')
    expect(b).toHaveTextContent('أُضيف استقطاع'); expect(b).toHaveTextContent('2026-09')
  })
  it('00185: الكشف المعتمد يعرض حالة استقطاعه في سلسلة المالية (بانتظار إعادة التصدير / في كشف المالية / معتمد)', async () => {
    for (const [state, text] of [['awaiting_export', 'بانتظار إعادة تصدير الشهر'], ['exported', 'ضمن كشف المالية الحالي'], ['approved', 'اعتمدته المالية']] as const) {
      h.get.mockResolvedValue({ ...base, status: 'approved', can_decide: false, deduction_posted: true, deduction_month: '2026-09-01', deduction_state: state, approved_by_name: 'المدير المفوض', approved_at: '2026-10-03T10:00:00Z' })
      const { unmount } = wrap(<AdminDisclosures />, '/admin/disclosures')
      fireEvent.click((await screen.findAllByTestId('decide-d1'))[0] as HTMLElement)
      expect(await screen.findByTestId('disc-deduction-state')).toHaveTextContent(text)
      unmount()
    }
  })
})

describe('التطوير المركزية — أنواع الكشوفات وإخفاء وحدات غرفة العمليات', () => {
  it('أنواع الكشوفات: الجدول + إضافة نوع (رمز إنجليزي + عقوبات) + تعطيل', async () => {
    wrap(<DisclosureTypesPage />, '/it/user-management/disclosure-types')
    expect(await screen.findByTestId('type-row-speeding')).toHaveTextContent('سرعة زائدة')
    expect(screen.getByTestId('type-row-old')).toHaveTextContent('معطّل')
    fireEvent.click(screen.getByTestId('type-new'))
    fireEvent.change(screen.getByTestId('type-key'), { target: { value: 'Bad Key' } })
    expect(screen.getByTestId('type-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('type-key'), { target: { value: 'no_uniform' } })
    fireEvent.change(screen.getByTestId('type-label'), { target: { value: 'عدم ارتداء الزي' } })
    fireEvent.click(screen.getByTestId('pen-termination'))
    fireEvent.change(screen.getByTestId('type-amount'), { target: { value: '2500' } })
    fireEvent.click(screen.getByTestId('type-save'))
    await waitFor(() => expect(h.saveType).toHaveBeenCalledWith(expect.objectContaining({ key: 'no_uniform', label: 'عدم ارتداء الزي', allowed_penalties: ['warning', 'reprimand', 'termination'], default_amount: 2500, is_active: true })))
    fireEvent.click(screen.getByTestId('type-toggle-speeding'))
    await waitFor(() => expect(h.saveType).toHaveBeenCalledWith(expect.objectContaining({ key: 'speeding', is_active: false })))
  })
  it('بطاقة وحدات غرفة العمليات: الكل ظاهر افتراضياً؛ إخفاء وحدتين وحفظهما بمساراتهما', async () => {
    wrap(<OpsUnitsCard userId="u-ops" />, '/it')
    await waitFor(() => expect(h.hiddenGet).toHaveBeenCalledWith('u-ops', 'ops-room'))
    await waitFor(() => expect(screen.getByTestId('unit-disclosures')).toBeEnabled())
    expect(screen.getByTestId('ops-units-card')).toHaveTextContent('كل الوحدات ظاهرة')
    expect(screen.getByTestId('unit-disclosures')).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByTestId('unit-ops-room')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('unit-disclosures')); fireEvent.click(screen.getByTestId('unit-store'))
    fireEvent.click(screen.getByTestId('units-save'))
    await waitFor(() => expect(h.hiddenSet).toHaveBeenCalledWith('u-ops', 'ops-room', ['/ops-room/disclosures', '/ops-room/store']))
  })
  it('القوائم تُرشّح الوحدات المخفية لهذا الحساب وتُبقي الرئيسية؛ فشل التحميل = لا إخفاء', async () => {
    const units = PORTAL_UNITS[PORTALS.OPS_ROOM] as readonly SidebarUnit[]
    const out = filterVisibleUnits('ops-room', units, { 'ops-room': ['/ops-room/disclosures', '/ops-room'] })
    expect(out.map((u) => u.path)).toContain('/ops-room'); expect(out.map((u) => u.path)).not.toContain('/ops-room/disclosures')
    expect(filterVisibleUnits('ops-room', units, {})).toBe(units)
    h.myHidden.mockResolvedValue({ 'ops-room': ['/ops-room/store'] })
    await loadMyHiddenUnits(true)
    render(<MemoryRouter initialEntries={['/ops-room']}><Sidebar portal={PORTALS.OPS_ROOM} /></MemoryRouter>)
    expect(screen.getByText('الكشوفات')).toBeInTheDocument()
    expect(screen.queryByText('المخزن')).not.toBeInTheDocument()
    h.myHidden.mockRejectedValue(new Error('x'))
    await loadMyHiddenUnits(true)
    expect(useHiddenUnitsStore.getState().hidden).toEqual({})
  })
})

describe('عقود 00170 — لا بوابة كشوفات مستقلة، الوحدة داخل غرفة العمليات', () => {
  it('بوابة/دور الكشوفات أُلغيا؛ وحدة الكشوفات في غرفة العمليات ومسارها مسجَّل؛ IT تملك أنواع الكشوفات', () => {
    expect((PORTALS as Record<string, string>).DISCLOSURES).toBeUndefined()
    expect(PORTAL_DEFINITIONS.map((p) => p.path)).not.toContain('/disclosures')
    expect(PORTAL_ROUTES.map((r) => r.path)).not.toContain('/disclosures')
    expect((ROLE_LABELS as Record<string, string>).disclosures_officer).toBeUndefined()
    expect(PORTAL_UNITS[PORTALS.OPS_ROOM].map((u) => u.path)).toContain('/ops-room/disclosures')
    expect(opsRoutes.map((r) => r.path)).toContain('disclosures')
    expect(itRoutes.map((r) => r.path)).toContain('user-management/disclosure-types')
    expect(PORTAL_UNITS[PORTALS.ADMIN].map((u) => u.path)).toContain('/admin/disclosures')
  })
})

describe('00188 — تقرير الكشوفات (الجولة B)', () => {
  it('غرفة العمليات: تبويب «التقارير» يعرض المؤشرات والتوزيعات والمكرِّرين وسلسلة الاستقطاع، والفلاتر تُرسل إلى RPC', async () => {
    wrap(<OpsDisclosuresPage />)
    fireEvent.click(screen.getByTestId('tab-report'))
    await screen.findByTestId('rep-body')
    expect(screen.getByTestId('rep-k-count')).toHaveTextContent('4'); expect(screen.getByTestId('rep-k-approved')).toHaveTextContent('2'); expect(screen.getByTestId('rep-k-amount')).toHaveTextContent('25,000'); expect(screen.getByTestId('rep-k-hours')).toHaveTextContent('6.5')
    expect(screen.getByTestId('rep-by-type')).toHaveTextContent('سرعة زائدة'); expect(screen.getByTestId('rep-by-sector')).toHaveTextContent('الزعفرانية 1')
    expect(screen.getByTestId('rep-top-employees')).toHaveTextContent('سارة محمد'); expect(screen.getByTestId('rep-top-vehicles')).toHaveTextContent('DB-101')
    expect(screen.getByTestId('rep-deductions')).toHaveTextContent('بلا استقطاع مرتبط')
    expect(screen.getByTestId('rep-body').textContent).not.toMatch(/[\u0660-\u0669]/)
    const first = h.report.mock.calls[0]![0] as { from: string; to: string; type: string | null }
    expect(first.from).toMatch(/^\d{4}-\d{2}-01$/); expect(first.type).toBeNull()
    fireEvent.change(screen.getByTestId('rep-type'), { target: { value: 'speeding' } })
    fireEvent.change(screen.getByTestId('rep-from'), { target: { value: '2026-01-01' } })
    await waitFor(() => expect(h.report.mock.calls.some((c) => (c[0] as { type: string | null; from: string }).type === 'speeding' && (c[0] as { from: string }).from === '2026-01-01')).toBe(true))
    expect(screen.getByTestId('rep-excel')).toBeEnabled(); expect(screen.getByTestId('rep-print')).toBeEnabled()
  })
  it('المعاون والمدير المفوض: تبويب التقارير متاح أيضاً', async () => {
    wrap(<IncomingStatements />, '/deputy/statements')
    fireEvent.click(await screen.findByTestId('tab-report'))
    await screen.findByTestId('approver-report')
    expect(await screen.findByTestId('rep-k-count')).toHaveTextContent('4')
  })
})
