import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { UnmatchedUnitDay, UnmatchedUnitPerson } from '@features/integrations/types'

const h = vi.hoisted(() => ({ report: vi.fn(), download: vi.fn(), link: vi.fn() }))
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [{ id: 'b1', name: 'فرع الكرخ' }] }) }))
vi.mock('@sdk/biometric.sdk', () => ({ biometricErrorMessage: (e: string) => e, biometric: { unmatchedUnitReport: h.report, unmatchedUnitDevices: async () => [{device_serial: 'UM-1', device_name: 'بصمة الكرخ'}] } }))
vi.mock('@features/hr', () => ({ useHrEmployees: () => ({ data: [{ id: 'e1', full_name: 'موظف اختبار', employee_number: 'EMP1', biometric_pin: null }], isLoading: false, isError: false, refetch: async () => ({ data: [{ id: 'e1', full_name: 'موظف اختبار', employee_number: 'EMP1', biometric_pin: null }], isError: false }) }) }))
vi.mock('@features/integrations', async () => { const types = await import('@features/integrations/types'); return { UNMATCHED_STATUS_LABELS: types.UNMATCHED_STATUS_LABELS, UNMATCHED_STATUS_SHORT: types.UNMATCHED_STATUS_SHORT, useLinkBiometricPin: () => ({ isPending: false, mutate: h.link }) } })
vi.mock('@features/hr/lib/hrExcel', () => ({ downloadWorkbook: h.download }))
vi.mock('@portals/hr/pages/Biometric/UnmatchedArchive', () => ({ default: () => <div data-testid="mock-archive">الأرشيف</div> }))
vi.mock('@portals/hr/pages/Biometric/UnmatchedUnitWorkspace', () => ({ default: ({ mode }: { mode: string }) => <div data-testid="mock-unit-workspace">{mode}</div> }))
import UnmatchedPeoplePage from '@portals/hr/pages/Biometric/UnmatchedPeoplePage'
import { summaryRows } from '@features/integrations/lib/unmatchedSummary'
import { buildUnmatchedWorkbook, dayCellText, fmtHours } from '@features/integrations/lib/unmatchedExcel'
const d = (date: string, status: UnmatchedUnitDay['status'], extra: Partial<UnmatchedUnitDay> = {}): UnmatchedUnitDay => ({ date, status, punch_count: 0, entry: null, exit: null, raw_first: null, raw_last: null, manual_revision: 0, manual: false, ...extra })
const rows: UnmatchedUnitPerson[] = [
  { device_serial: 'UM-1', pin: '901', person_name: 'كريم', device_name: 'بصمة الكرخ', branch_id: 'b1', current_pin_linked: false, days: [
    d('2025-05-01', 'present', { entry: '2025-05-01T16:00:00', exit: '2025-05-02T03:00:00', punch_count: 1 }),
    d('2025-05-02', 'previous_exit', { exit: '2025-05-02T03:00:00', punch_count: 1 }), d('2025-05-03', 'leave', { manual: true }),
    d('2025-05-04', 'missing', { raw_first: '2025-05-04T08:05:00', punch_count: 1 }), d('2025-05-05', 'review', { raw_first: '2025-05-05T08:00:00', raw_last: '2025-05-05T17:00:00', punch_count: 3 }), d('2025-05-06', 'unknown'), d('2025-05-07', 'future'), d('2025-05-08', 'absent')] },
]
function setup(readOnly = false) { const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return render(<QueryClientProvider client={qc}><MemoryRouter><UnmatchedPeoplePage readOnly={readOnly}/></MemoryRouter></QueryClientProvider>) }
describe('التقرير الأول بالمحرك المشترك', () => {
  beforeEach(() => { vi.resetAllMocks(); h.report.mockResolvedValue(rows); h.download.mockResolvedValue(undefined) })
  it('يحافظ على الشبكة والمجاميع ويعرض الليلي والإجازة والحالات دون تخمين', async () => {
    setup()
    expect(await screen.findByTestId('um-cell-901-2025-05-01')).toHaveTextContent('ح 11:00')
    expect(screen.getByTestId('um-cell-901-2025-05-03')).toHaveTextContent('إ')
    expect(screen.getByTestId('um-cell-901-2025-05-04')).toHaveTextContent('ن 08:05')
    expect(screen.getByTestId('um-cell-901-2025-05-05')).toHaveTextContent('08:00 17:00'); expect(screen.getByTestId('unmatched-page')).not.toHaveTextContent('مراجعة')
    expect(screen.getByTestId('um-cell-901-2025-05-06')).toHaveTextContent('غير محدد')
    expect(screen.getByTestId('um-cell-901-2025-05-07')).toHaveTextContent('مستقبل')
    expect(screen.getByTestId('um-cell-901-2025-05-08')).toHaveTextContent('غ')
    expect(screen.getByTestId('um-link-901')).toHaveTextContent('ربط بموظف')
  })
  it('يربط الشخص من التقرير حتى لو لم تكن لديه بصمة اليوم', async () => {
    h.report.mockResolvedValue([{ ...rows[0]!, days: [d('2025-05-01', 'absent')] }]); setup()
    fireEvent.click(await screen.findByTestId('um-link-901'))
    expect(screen.getByTestId('unmatched-link-form')).toHaveTextContent('جميع الأجهزة')
    fireEvent.change(screen.getByTestId('unmatched-link-employee'), { target: { value: 'e1' } })
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الربط' }))
    await waitFor(() => expect(h.link).toHaveBeenCalledWith({ pin: '901', employeeId: 'e1' }, expect.any(Object)))
  })
  it('يبقي الربط لكل جهاز مستقلاً في العرض عند تكرار الرقم', async () => {
    h.report.mockResolvedValue([rows[0], { ...rows[0]!, person_name: 'شخص آخر', device_serial: 'UM-2' }]); setup()
    await screen.findByTestId('unmatched-grid')
    const actions = screen.getAllByTestId('um-link-901'); expect(actions).toHaveLength(2)
    fireEvent.click(actions[1]!)
    expect(screen.getByTestId('unmatched-link-form')).toHaveTextContent('شخص آخر')
    expect(screen.getByTestId('unmatched-link-form')).toHaveTextContent('UM-2')
    expect(screen.getByTestId('unmatched-link-form')).toHaveTextContent('جميع الأجهزة')
  })
  it('يرسل فلاتر الجهاز وPIN والحالة والغياب للخادم', async () => {
    setup(); await screen.findByTestId('unmatched-grid'); await screen.findByRole('option', { name: /بصمة الكرخ/ })
    fireEvent.change(screen.getByTestId('um-device'), { target: { value: 'UM-1' } })
    fireEvent.change(screen.getByTestId('um-pin'), { target: { value: '901' } })
    fireEvent.change(screen.getByTestId('um-status'), { target: { value: 'leave' } })
    fireEvent.click(screen.getByTestId('um-only-issues'))
    await waitFor(() => expect(h.report).toHaveBeenLastCalledWith(expect.objectContaining({ device: 'UM-1', pin: '901', status: 'leave', issues: true }), null, 26))
  })
  it('التصدير يستخدم كل النتائج بالمحرك نفسه ويحفظ شكل التقرير الأول', async () => {
    setup(); await screen.findByTestId('unmatched-grid'); fireEvent.click(screen.getByTestId('unmatched-export'))
    await waitFor(() => expect(h.download).toHaveBeenCalledTimes(1))
    const ws = h.download.mock.calls[0]![0].getWorksheet('غير المطابقين')
    expect(ws.getRow(6).getCell(6).value).toBe('ح 11:00')
    expect(ws.getRow(6).getCell(8).value).toBe('إ')
    expect(ws.getRow(6).getCell(10).value).toBe('08:00\n17:00'); expect(String(ws.getCell(`A${ws.rowCount}`).value)).not.toContain('مراجعة')
    expect(h.download.mock.calls[0]![0].getWorksheet('التفاصيل اليومية').getRow(7).getCell(6).value).toBe('مجاز')
  })
  it('التبديل للصفحات الجديدة والأرشيف ورابط الربط يختفي في نسخة القراءة', async () => {
    setup(true); await screen.findByTestId('unmatched-grid'); expect(screen.queryByTestId('um-link-901')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'الدخول والخروج' })); expect(screen.getByTestId('mock-unit-workspace')).toHaveTextContent('grid')
    fireEvent.click(screen.getByRole('button', { name: 'التفاصيل اليومية' })); expect(screen.getByTestId('mock-unit-workspace')).toHaveTextContent('details')
    fireEvent.click(screen.getByRole('button', { name: 'الأرشيف' })); expect(screen.getByTestId('mock-archive')).toBeInTheDocument()
  })
  it('المساعدات تحفظ شكل Excel السابق وتدعم الحالات الإضافية', async () => {
    const converted = summaryRows(rows, [{ id: 'b1', name: 'فرع الكرخ' }]); expect(converted[0]!.total_minutes).toBe(660)
    const wb = await buildUnmatchedWorkbook(converted, { from: '2025-05-01', to: '2025-05-08', branchLabel: 'الكل' })
    expect(wb.getWorksheet('غير المطابقين')!.getRow(6).getCell(6).value).toBe('ح 11:00')
    expect(fmtHours(65)).toBe('1:05'); expect(dayCellText({ d: 'x', status: 'leave', n: 0, minutes: 0, first: null, last: null })).toBe('إ')
  })
})
