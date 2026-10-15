/** 00262 — غرفة العمليات: حضوريات العمال (الكشف المحوري، الفلاتر، التصحيح بسبب، الاعتماد، التصدير) */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { buildPivot, workersOf } from '@features/ops-contractor-headcounts/pivot'
import type { HeadcountSheetRow } from '@sdk/ops-contractor-headcounts.sdk'

const row = (o: Partial<HeadcountSheetRow>): HeadcountSheetRow => ({
  contractor_user_id: 'c1', contractor_name: 'متعهد أ', sector_id: 1, area_name: 'أرخيته', parent_sector: 'karrada', shift: 'morning', is_active: true,
  log_date: '2026-10-01', checked_in: true, in_zone: true, contractor_headcount: null, follow_up_headcount: null, sector_manager_headcount: null,
  contractor_edit_reason: null, follow_up_edit_reason: null, sector_manager_edit_reason: null, ...o,
})
const ROWS: HeadcountSheetRow[] = [
  row({ log_date: '2026-10-01', sector_manager_headcount: 14, contractor_headcount: 16, follow_up_headcount: 15 }),
  row({ log_date: '2026-10-02', sector_manager_headcount: null, contractor_headcount: 16, follow_up_headcount: 16, contractor_edit_reason: 'عدّ ميداني' }),
  row({ contractor_user_id: 'c2', contractor_name: 'متعهد ب', area_name: 'السندباد', parent_sector: 'zaafaraniya', shift: 'evening', log_date: '2026-10-01', sector_manager_headcount: 10, contractor_headcount: 11, follow_up_headcount: 10 }),
  row({ contractor_user_id: 'c2', contractor_name: 'متعهد ب', area_name: 'السندباد', parent_sector: 'zaafaraniya', shift: 'evening', log_date: '2026-10-02', checked_in: false }),
]

describe('buildPivot (00262)', () => {
  it('أيام × متعهدين × 3 جهات مع مجاميع الشفتين والكلي ومجاميع المتعهد', () => {
    const p = buildPivot(ROWS)
    expect(p.contractors.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(p.days.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02'])
    const d1 = p.days[0]!
    expect(d1.cells.c1!.contractor.value).toBe(16)
    expect(d1.shiftTotals.morning).toEqual({ sector_manager: 14, contractor: 16, follow_up: 15 })
    expect(d1.shiftTotals.evening).toEqual({ sector_manager: 10, contractor: 11, follow_up: 10 })
    expect(d1.total).toEqual({ sector_manager: 24, contractor: 27, follow_up: 25 })
    expect(p.contractorTotals.c1).toEqual({ sector_manager: 14, contractor: 32, follow_up: 31 })
    expect(p.grand).toEqual({ sector_manager: 24, contractor: 43, follow_up: 41 })
    expect(p.days[1]!.cells.c1!.contractor.reason).toBe('عدّ ميداني')
    expect(p.days[1]!.cells.c2!.contractor.value).toBeNull()
  })
  it('فلتر المصدر يترك عموداً واحداً لكل متعهد؛ العمال = العدد − 1', () => {
    expect(buildPivot(ROWS, 'follow_up').sources).toEqual(['follow_up'])
    expect(workersOf(16)).toBe(15); expect(workersOf(0)).toBe(0); expect(workersOf(null)).toBeNull()
  })
})

const mockCorrect = vi.fn(), mockApprove = vi.fn(), mockReopen = vi.fn()
const H = { status: { month: '2026-10-01', approved: false, approved_source: null, approved_by_name: null, approved_at: null, is_locked: false, reopened_by_name: null, reopened_at: null, reopen_reason: null, month_ended: true, contractors: 2, days_with_contractor: 3, days_with_follow_up: 3, days_with_sector_manager: 2 } as Record<string, unknown> }
vi.mock('@features/ops-contractor-headcounts/hooks', () => ({
  useHeadcountSheet: () => ({ data: ROWS, isLoading: false }),
  useHeadcountMonthStatus: () => ({ data: H.status }),
  useHeadcountAudit: () => ({ data: [{ id: 'a1', actor_name: 'عمليات', action: 'ops_correct_contractor', contractor_name: 'متعهد أ', log_date: '2026-10-02', before_data: { headcount: 15 }, after_data: { headcount: 16 }, reason: 'عدّ ميداني', created_at: '2026-10-02T10:00:00Z' }] }),
  useCorrectHeadcount: () => ({ mutate: mockCorrect, isPending: false }),
  useApproveHeadcountMonth: () => ({ mutate: mockApprove, isPending: false }),
  useReopenHeadcountMonth: () => ({ mutate: mockReopen, isPending: false }),
}))
import OpsContractorHeadcountsPage from '@portals/ops-room/pages/ContractorHeadcounts/OpsContractorHeadcountsPage'

describe('OpsContractorHeadcountsPage (00262)', () => {
  beforeEach(() => { mockCorrect.mockReset(); mockApprove.mockReset(); H.status = { ...H.status, is_locked: false, approved: false }; vi.spyOn(window, 'confirm').mockReturnValue(true) })
  it('يعرض الكشف: صفوف الأيام، 3 أعمدة لكل متعهد، مجاميع الشفتين والكلي، والعلامة على المصحَّح', () => {
    render(<MemoryRouter><OpsContractorHeadcountsPage /></MemoryRouter>)
    expect(screen.getByTestId('head-c1')).toHaveTextContent('متعهد أ')
    expect(screen.getByTestId('cell-c1-2026-10-01-contractor')).toHaveTextContent('16')
    expect(screen.getByTestId('cell-c1-2026-10-02-sector_manager')).toHaveTextContent('—')
    expect(screen.getByTestId('cell-c1-2026-10-02-contractor')).toHaveClass('underline')
    expect(screen.getByTestId('morning-2026-10-01-contractor')).toHaveTextContent('16')
    expect(screen.getByTestId('evening-2026-10-01-contractor')).toHaveTextContent('11')
    expect(screen.getByTestId('total-2026-10-01-contractor')).toHaveTextContent('27')
    expect(screen.getByTestId('grand-contractor')).toHaveTextContent('43')
    expect(screen.getByTestId('cworkers-c1-contractor')).toHaveTextContent('30')
    expect(screen.getByTestId('st-grand-fu')).toHaveTextContent('41')
  })
  it('فلتر المصدر «المتابعة» يُبقي عمود المتابعة فقط', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><OpsContractorHeadcountsPage /></MemoryRouter>)
    await user.click(screen.getByTestId('source-follow_up'))
    expect(screen.getByTestId('cell-c1-2026-10-01-follow_up')).toBeInTheDocument()
    expect(screen.queryByTestId('cell-c1-2026-10-01-contractor')).toBeNull()
  })
  it('التصحيح يتطلب سبباً ويمرر الجهة واليوم والعدد', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><OpsContractorHeadcountsPage /></MemoryRouter>)
    await user.click(screen.getByTestId('cell-c1-2026-10-01-follow_up'))
    const dlg = screen.getByTestId('correct-dialog')
    await user.clear(within(dlg).getByTestId('correct-value')); await user.type(within(dlg).getByTestId('correct-value'), '13')
    expect(within(dlg).getByTestId('correct-save')).toBeDisabled()
    await user.type(within(dlg).getByTestId('correct-reason'), 'مراجعة الصور')
    await user.click(within(dlg).getByTestId('correct-save'))
    expect(mockCorrect).toHaveBeenCalledWith({ contractorUserId: 'c1', date: '2026-10-01', source: 'follow_up', headcount: 13, reason: 'مراجعة الصور' }, expect.anything())
  })
  it('اعتماد الشهر على جهة واحدة بعد التأكيد؛ وعند القفل تُعطَّل الخلايا ويظهر زر إعادة الفتح', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<MemoryRouter><OpsContractorHeadcountsPage /></MemoryRouter>)
    expect(screen.getByTestId('approve-btn')).toBeDisabled()
    await user.selectOptions(screen.getByTestId('approve-source'), 'follow_up')
    await user.click(screen.getByTestId('approve-btn'))
    expect(mockApprove).toHaveBeenCalledWith({ month: expect.stringMatching(/^\d{4}-\d{2}$/), source: 'follow_up' })
    unmount()
    H.status = { ...H.status, is_locked: true, approved: true, approved_source: 'follow_up', approved_by_name: 'عمليات', approved_at: '2026-11-01T08:00:00Z' }
    render(<MemoryRouter><OpsContractorHeadcountsPage /></MemoryRouter>)
    expect(screen.getByTestId('month-status')).toHaveTextContent('مقفل على جهة «المتابعة»')
    expect(screen.getByTestId('reopen-btn')).toBeInTheDocument()
    expect(screen.getByTestId('cell-c1-2026-10-01-contractor')).toBeDisabled()
  })
  it('سجل التدقيق يعرض التصحيح بسببه', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><OpsContractorHeadcountsPage /></MemoryRouter>)
    await user.click(screen.getByTestId('audit-toggle'))
    expect(screen.getByTestId('audit-list')).toHaveTextContent('15 ← 16')
    expect(screen.getByTestId('audit-list')).toHaveTextContent('عدّ ميداني')
  })
})

describe('exportHeadcountsExcel (00262)', () => {
  it('يبني ورقة «الكشف» برؤوس المتعهدين والجهات وورقة التفاصيل', async () => {
    const { exportHeadcountsExcel } = await import('@features/ops-contractor-headcounts/excel')
    const wb = await exportHeadcountsExcel(buildPivot(ROWS), { month: '2026-10', parent: null, approvedSource: 'follow_up', locked: true })
    expect(wb.worksheets[0]!.name).toBe('الكشف')
    const ws = wb.worksheets[0]!
    expect(String(ws.getCell('A1').value)).toContain('معتمد على جهة «المتابعة»')
    expect(String(ws.getCell('B3').value)).toContain('متعهد أ')
    expect(ws.getCell('B4').value).toBe('القاطع'); expect(ws.getCell('C4').value).toBe('المتعهد'); expect(ws.getCell('D4').value).toBe('المتابعة')
    expect(ws.getCell('A5').value).toBe('2026-10-01'); expect(ws.getCell('C5').value).toBe(16)
    expect(wb.worksheets.some((s) => s.name === 'التفاصيل')).toBe(true)
  })
})
