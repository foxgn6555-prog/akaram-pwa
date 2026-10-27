/**
 * 00355 — وحدة «المنتهية خدماتهم والتصفية النهائية» (المالية):
 *   الرأس والقائمة، الملف وبنوده (راتب تناسبي + إجازات − سلف)، اعتماد/تسليم، الذمة السالبة (تسديد/إعفاء بسبب إلزامي)،
 *   تنبيهات (بلا ملف راتب، صُرف ضمن الكشف، أشهر غير مصدَّرة)، السجل، الأرقام اللاتينية.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import FinanceSettlementsPage from '@portals/finance/pages/Settlements/FinanceSettlementsPage'
import type { SettlementDetail, SettlementRow } from '@features/hr/types'

const h = vi.hoisted(() => ({
  rows: [] as unknown[], detail: null as unknown, summary: null as unknown,
  recompute: vi.fn(async () => ({})), approve: vi.fn(async () => ({})), deliver: vi.fn(async () => ({})), debt: vi.fn(async () => ({})),
}))
const mut = (fn: (...a: never[]) => Promise<unknown>) => ({ mutate: (v: never) => void fn(v), mutateAsync: fn, isPending: false })
vi.mock('@features/hr/hooks/useHr', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useSettlementsList: () => ({ data: h.rows, isLoading: false }), useSettlementsSummary: () => ({ data: h.summary, isLoading: false }),
  useSettlement: (id: string | null) => ({ data: id ? h.detail : undefined, isLoading: false }),
  useLettersForSource: () => ({ data: [{ id: 'l1', ref: '12/2026', kind: 'resignation_accept', kind_label: 'قبول استقالة', issued_at: '2026-09-16T08:00:00Z' }], isLoading: false }), useLetter: () => ({ data: undefined, isLoading: true }),
  useSettlementRecompute: () => mut(h.recompute), useSettlementApprove: () => mut(h.approve), useSettlementDeliver: () => mut(h.deliver), useSettlementDebtClose: () => mut(h.debt),
}))

const row = (o: Partial<SettlementRow>): SettlementRow => ({
  id: 's1', ref_no: 'ST-2026-0001', employee_id: 'e1', employee_number: 'A-1', full_name: 'كرار', department_name: 'النقل', job_title: 'سائق', termination_type: 'resignation', termination_label: 'استقالة',
  last_day: '2026-09-15', salary_month: '2026-09-01', status: 'pending', status_label: 'بانتظار الاعتماد', net_amount: 1200000, debt_amount: 0, has_profile: true, computed_at: '2026-09-16T08:00:00Z',
  approved_at: null, delivered_at: null, debt_closed_at: null, manager_name: 'المهندس علي', created_at: '2026-09-16T08:00:00Z', ...o,
})
const detail = (o: Partial<SettlementDetail> = {}, lines: Record<string, unknown> = {}): SettlementDetail => ({
  ...row({}), reason: 'ظروف عائلية', approve_note: null, delivery_note: null, debt_note: null, month_locked: false,
  lines: {
    salary_month: '2026-09-01',
    salary: { source: 'computed', gross: 450000, deductions: 0, rented_tax: 0, overtime: 0, net: 450000, covered_days: 15, payable_days: 15, day_rate: 30000, period_from: '2026-09-01', period_to: '2026-09-15', pay_type: 'monthly', base_salary: 900000, days_in_month: 30, note: null },
    leave: { remaining_days: 30, day_rate: 30000, amount: 900000, year: 2026 },
    advances: [{ id: 'a1', ref_no: 'ADV-7', type_name: 'سلفة نقدية عادية', amount: 200000, repaid: 50000, remaining: 150000 }],
    advances_total: 150000, prior_months_unexported: [], total_due: 1350000, total_deduct: 150000, net: 1200000, has_profile: true, computed_at: '2026-09-16T08:00:00Z', ...lines,
  } as SettlementDetail['lines'],
  events: [{ id: 1, action: 'opened', actor_name: 'HR', amount: null, note: 'استقالة · آخر يوم 2026-09-15', created_at: '2026-09-16T08:00:00Z' }],
  ...o,
})
const open = () => render(<MemoryRouter><FinanceSettlementsPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  h.summary = { pending: 2, approved: 1, approved_amount: 800000, debt_open: 1, debt_amount: 350000, delivered_total: 5400000, closed: 7 }
  h.rows = [
    row({}),
    row({ id: 's2', ref_no: 'ST-2026-0002', employee_id: 'e2', employee_number: 'A-2', full_name: 'حيدر', termination_type: 'dismissal', termination_label: 'فصل', status: 'debt_open', status_label: 'ذمة على الموظف', net_amount: -350000, debt_amount: 350000, manager_name: null }),
    row({ id: 's3', ref_no: 'ST-2026-0003', employee_id: 'e3', employee_number: 'A-3', full_name: 'علي', termination_type: 'retirement', termination_label: 'تقاعد', has_profile: false, net_amount: 0 }),
  ]
  h.detail = detail()
})

describe('00355 — المنتهية خدماتهم والتصفية (المالية)', () => {
  it('الرأس: 2 بانتظار، 1 معتمدة 800,000، ذمة 350,000، مسلَّم 5,400,000؛ القائمة: الاسم ونوع الإنهاء وآخر يوم والمدير المباشر والصافي والحالة؛ السالب أحمر؛ بلا ملف راتب مُعلَّم؛ أرقام لاتينية', () => {
    open()
    expect(screen.getByTestId('st-stat-pending')).toHaveTextContent('2'); expect(screen.getByTestId('st-stat-approved')).toHaveTextContent('800,000')
    expect(screen.getByTestId('st-stat-debt')).toHaveTextContent('350,000'); expect(screen.getByTestId('st-stat-delivered')).toHaveTextContent('5,400,000')
    const r1 = screen.getByTestId('st-row-A-1')
    expect(r1).toHaveTextContent('كرار'); expect(r1).toHaveTextContent('استقالة'); expect(r1).toHaveTextContent('2026-09-15'); expect(r1).toHaveTextContent('المهندس علي')
    expect(screen.getByTestId('st-net-A-1')).toHaveTextContent('1,200,000'); expect(screen.getByTestId('st-status-A-1')).toHaveTextContent('بانتظار الاعتماد')
    expect(screen.getByTestId('st-net-A-2')).toHaveTextContent('-350,000'); expect(screen.getByTestId('st-net-A-2')).toHaveTextContent('ذمة 350,000'); expect(screen.getByTestId('st-net-A-2').className).toContain('rose')
    expect(screen.getByTestId('st-row-A-2')).toHaveTextContent('لا مدير مباشر')
    expect(screen.getByTestId('st-noprofile-A-3')).toHaveTextContent('بلا ملف راتب')
    expect(screen.getByTestId('st-table').textContent).not.toMatch(/[٠-٩]/)
    expect(screen.getByTestId('st-tab-open')).toBeInTheDocument(); expect(screen.getByTestId('st-tab-closed')).toBeInTheDocument(); expect(screen.getByTestId('st-search')).toBeInTheDocument()
  })

  it('الملف: البنود الثلاثة بأرقامها ومعادلاتها (15 يوم × 30,000؛ 30 يوم إجازة × 30,000؛ سلفة متبقٍ 150,000) والصافي 1,200,000؛ إعادة الاحتساب؛ الاعتماد بملاحظة اختيارية؛ السجل', async () => {
    const prompt = vi.spyOn(window, 'prompt')
    open()
    fireEvent.click(screen.getByTestId('st-open-A-1'))
    expect(screen.getByTestId('st-d-name')).toHaveTextContent('كرار'); expect(screen.getByTestId('st-drawer')).toHaveTextContent('ظروف عائلية'); expect(screen.getByTestId('st-drawer')).toHaveTextContent('(بُلّغ)')
    expect(screen.getByTestId('st-line-salary')).toHaveTextContent('450,000'); expect(screen.getByTestId('st-lines-table')).toHaveTextContent('15 يوم مستحق × أجر اليوم 30,000'); expect(screen.getByTestId('st-lines-table')).toHaveTextContent('900,000 ÷ 30 يوم')
    expect(screen.getByTestId('st-line-leave')).toHaveTextContent('900,000'); expect(screen.getByTestId('st-lines-table')).toHaveTextContent('30 يوم × أجر اليوم 30,000')
    expect(screen.getByTestId('st-line-advances')).toHaveTextContent('150,000'); expect(screen.getByTestId('st-lines-table')).toHaveTextContent('ADV-7'); expect(screen.getByTestId('st-lines-table')).toHaveTextContent('سُدّد 50,000')
    expect(screen.getByTestId('st-line-net')).toHaveTextContent('1,200,000'); expect(screen.getByTestId('st-lines-table')).toHaveTextContent('1,350,000 − 150,000')
    expect(screen.queryByTestId('st-deliver')).toBeNull(); expect(screen.queryByTestId('st-debt-paid')).toBeNull()
    fireEvent.click(screen.getByTestId('st-recompute')); await waitFor(() => expect(h.recompute).toHaveBeenCalledWith('s1'))
    prompt.mockReturnValueOnce(null); fireEvent.click(screen.getByTestId('st-approve')); expect(h.approve).not.toHaveBeenCalled()
    prompt.mockReturnValueOnce('  '); fireEvent.click(screen.getByTestId('st-approve')); await waitFor(() => expect(h.approve).toHaveBeenCalledWith({ id: 's1', note: null }))
    expect(screen.getAllByTestId('st-event')).toHaveLength(1); expect(screen.getByTestId('st-events')).toHaveTextContent('فُتح الملف')
    expect(screen.getByTestId('st-letter-resignation_accept')).toHaveTextContent('قبول استقالة — العدد 12/2026')
    fireEvent.click(screen.getByTestId('st-letter-resignation_accept')); expect(screen.getByTestId('letter-viewer')).toBeInTheDocument()
    prompt.mockRestore()
  })

  it('معتمدة ⇒ زر تأكيد التسليم فقط (بالمبلغ) وتظهر «البنود مجمّدة»', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce('سُلّم نقداً')
    h.detail = detail({ status: 'approved', status_label: 'معتمدة — بانتظار التسليم' })
    open(); fireEvent.click(screen.getByTestId('st-open-A-1'))
    expect(screen.queryByTestId('st-approve')).toBeNull(); expect(screen.queryByTestId('st-recompute')).toBeNull()
    expect(screen.getByTestId('st-lines')).toHaveTextContent('البنود مجمّدة منذ الاعتماد')
    fireEvent.click(screen.getByTestId('st-deliver'))
    expect(prompt.mock.calls[0]?.[0]).toContain('1,200,000')
    await waitFor(() => expect(h.deliver).toHaveBeenCalledWith({ id: 's1', note: 'سُلّم نقداً' }))
    prompt.mockRestore()
  })

  it('ذمة مفتوحة: الصافي السالب موضّح، «تم التسديد» و«إعفاء بسبب» (السبب إلزامي ≥ 3 أحرف)', async () => {
    const prompt = vi.spyOn(window, 'prompt'); const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    h.detail = detail({ id: 's2', status: 'debt_open', status_label: 'ذمة على الموظف', net_amount: -350000, debt_amount: 350000 }, { advances_total: 1700000, total_deduct: 1700000, net: -350000 })
    open(); fireEvent.click(screen.getByTestId('st-open-A-2'))
    expect(screen.getByTestId('st-line-net')).toHaveTextContent('-350,000'); expect(screen.getByTestId('st-lines-table')).toHaveTextContent('ذمة على الموظف بقيمة 350,000')
    expect(screen.queryByTestId('st-deliver')).toBeNull()
    prompt.mockReturnValueOnce('لا'); fireEvent.click(screen.getByTestId('st-debt-waived')); expect(alert).toHaveBeenCalled(); expect(h.debt).not.toHaveBeenCalled()
    prompt.mockReturnValueOnce('قرار المدير المفوض'); fireEvent.click(screen.getByTestId('st-debt-waived'))
    await waitFor(() => expect(h.debt).toHaveBeenCalledWith({ id: 's2', mode: 'waived', note: 'قرار المدير المفوض' }))
    prompt.mockReturnValueOnce(''); fireEvent.click(screen.getByTestId('st-debt-paid'))
    await waitFor(() => expect(h.debt).toHaveBeenCalledWith({ id: 's2', mode: 'paid', note: null }))
    expect(prompt.mock.calls[2]?.[0]).toContain('350,000')
    prompt.mockRestore(); alert.mockRestore()
  })

  it('تنبيهات الملف: بلا ملف راتب / صُرف ضمن الكشف المعتمد / أشهر سابقة غير مصدَّرة', () => {
    h.detail = detail({ id: 's3' }, { has_profile: false, salary: { source: 'no_profile', gross: 0, deductions: 0, rented_tax: 0, overtime: 0, net: 0, covered_days: 5, payable_days: 5, day_rate: 0, period_from: null, period_to: null, note: 'x' }, prior_months_unexported: ['2026-08'] })
    const { unmount } = open(); fireEvent.click(screen.getByTestId('st-open-A-3'))
    expect(screen.getByTestId('st-noprofile')).toHaveTextContent('لا ملف راتب معرَّف'); expect(screen.getByTestId('st-prior-months')).toHaveTextContent('2026-08')
    unmount()
    h.detail = detail({}, { salary: { source: 'paid_in_sheet', gross: 900000, deductions: 0, rented_tax: 0, overtime: 0, net: 0, sheet_net: 870000, covered_days: 15, payable_days: 15, day_rate: 30000, period_from: '2026-09-01', period_to: '2026-09-15', note: null, export_version: 2 } })
    open(); fireEvent.click(screen.getByTestId('st-open-A-1'))
    expect(screen.getByTestId('st-paid-in-sheet')).toHaveTextContent('إصدار 2'); expect(screen.getByTestId('st-paid-in-sheet')).toHaveTextContent('870,000'); expect(screen.getByTestId('st-line-salary')).toHaveTextContent('0')
  })

  it('لا ملفات ⇒ حالة فارغة توضح متى تظهر', () => {
    h.rows = []
    open()
    expect(screen.getByText('لا ملفات تصفية هنا')).toBeInTheDocument()
  })
})
