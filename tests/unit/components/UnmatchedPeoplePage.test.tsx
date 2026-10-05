/** 00175 · وحدة «الأشخاص غير المطابقين»: شبكة يومية، فلاتر الفترة/الفرع/البحث، مجاميع، تصدير Excel صف لكل شخص */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ report: vi.fn(), lastFilters: null as unknown, download: vi.fn() }))
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [{ id: 'b1', name: 'فرع الكرخ' }, { id: 'b2', name: 'فرع الرصافة' }], isLoading: false }) }))
vi.mock('@features/integrations', async () => {
  const types = await import('@features/integrations/types')
  return {
    UNMATCHED_STATUS_LABELS: types.UNMATCHED_STATUS_LABELS, UNMATCHED_STATUS_SHORT: types.UNMATCHED_STATUS_SHORT,
    useUnmatchedReport: (f: unknown) => { h.lastFilters = f; return h.report() },
  }
})
vi.mock('@features/hr/lib/hrExcel', () => ({ downloadWorkbook: h.download }))

import UnmatchedPeoplePage from '@portals/hr/pages/Biometric/UnmatchedPeoplePage'
import { buildUnmatchedWorkbook, dayCellText, fmtHours } from '@features/integrations/lib/unmatchedExcel'
import type { UnmatchedPersonRow } from '@features/integrations/types'

const days = (spec: Array<[string, 'present' | 'missing' | 'absent', number, string | null, string | null]>) =>
  spec.map(([d, status, minutes, first, last]) => ({ d, status, minutes, first, last, n: status === 'present' ? 2 : status === 'missing' ? 1 : 0 }))
const ROWS: UnmatchedPersonRow[] = [
  { pin: '901', person_name: 'كريم جاسم', device_serial: 'UM-1', device_name: 'بصمة الكرخ', branch_id: 'b1', branch_name: 'فرع الكرخ',
    days: days([['2026-09-01', 'present', 510, '08:00', '16:30'], ['2026-09-02', 'missing', 0, '08:05', null], ['2026-09-03', 'absent', 0, null, null], ['2026-09-04', 'present', 480, '08:00', '16:00']]),
    present_days: 2, missing_days: 1, absent_days: 1, total_minutes: 990, first_seen: '2026-09-01T05:00:00Z', last_seen: '2026-09-04T13:00:00Z' },
  { pin: '902', person_name: null, device_serial: 'UM-2', device_name: 'بصمة الرصافة', branch_id: 'b2', branch_name: 'فرع الرصافة',
    days: days([['2026-09-01', 'present', 480, '08:00', '16:00'], ['2026-09-02', 'present', 480, '08:00', '16:00'], ['2026-09-03', 'present', 480, '08:00', '16:00'], ['2026-09-04', 'present', 480, '08:00', '16:00']]),
    present_days: 4, missing_days: 0, absent_days: 0, total_minutes: 1920, first_seen: '2026-09-01T05:00:00Z', last_seen: '2026-09-04T13:00:00Z' },
]

describe('UnmatchedPeoplePage', () => {
  beforeEach(() => { vi.clearAllMocks(); h.report.mockReturnValue({ data: ROWS, isLoading: false, error: null }) })

  it('يعرض صفاً لكل شخص وخلية لكل يوم بالحالة الصحيحة (حاضر بالساعات، ناقصة بالوقت، غائب) والمجاميع', () => {
    render(<MemoryRouter><UnmatchedPeoplePage /></MemoryRouter>)
    expect(screen.getByTestId('um-row-UM-1-901')).toHaveTextContent('كريم جاسم')
    expect(screen.getByTestId('um-row-UM-2-902')).toHaveTextContent('— بلا اسم —')
    expect(screen.getByTestId('um-cell-901-2026-09-01')).toHaveTextContent('ح 8:30')
    expect(screen.getByTestId('um-cell-901-2026-09-02')).toHaveTextContent('ن 08:05')
    expect(screen.getByTestId('um-cell-901-2026-09-03')).toHaveTextContent('غ')
    expect(screen.getByTestId('um-cell-901-2026-09-03').className).toMatch(/red/)
    expect(screen.getByTestId('um-stat-people')).toHaveTextContent('2')
    expect(screen.getByTestId('um-stat-present')).toHaveTextContent('6')
    expect(screen.getByTestId('um-stat-missing')).toHaveTextContent('1')
    expect(screen.getByTestId('um-stat-absent')).toHaveTextContent('1')
    expect(screen.getByTestId('um-stat-absent')).toHaveTextContent('48:30')
    // رابط الربط يمرر PIN إلى دفتر البصمة
    expect(screen.getByTestId('um-link-901')).toHaveAttribute('href', '/hr/biometric?pin=901')
  })

  it('الفلاتر تُمرَّر إلى التقرير: الشهر يضبط من/إلى، الفرع والبحث، و«من لديهم غياب أو نقص فقط» يحصر محلياً', () => {
    render(<MemoryRouter><UnmatchedPeoplePage /></MemoryRouter>)
    fireEvent.change(screen.getByTestId('um-month'), { target: { value: '2026-09' } })
    expect(screen.getByTestId('um-from')).toHaveValue('2026-09-01')
    expect(screen.getByTestId('um-to')).toHaveValue('2026-09-30')
    fireEvent.change(screen.getByTestId('um-from'), { target: { value: '2026-09-10' } })
    fireEvent.change(screen.getByTestId('um-branch'), { target: { value: 'b1' } })
    fireEvent.change(screen.getByTestId('um-search'), { target: { value: '901' } })
    expect(h.lastFilters).toEqual({ from: '2026-09-10', to: '2026-09-30', branchId: 'b1', search: '901' })
    fireEvent.click(screen.getByTestId('um-only-issues'))
    expect(screen.queryByTestId('um-row-UM-2-902')).toBeNull()
    expect(screen.getByTestId('um-row-UM-1-901')).toBeInTheDocument()
  })

  it('فترة أوسع من 62 يوماً تُظهر تنبيهاً؛ النسخة للقراءة (IT) بلا عمود الإجراء', () => {
    render(<MemoryRouter><UnmatchedPeoplePage readOnly /></MemoryRouter>)
    expect(screen.queryByTestId('um-link-901')).toBeNull()
    fireEvent.change(screen.getByTestId('um-from'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByTestId('um-to'), { target: { value: '2026-06-01' } })
    expect(screen.getByRole('alert')).toHaveTextContent('62 يوماً')
  })

  it('حالة فارغة عند غياب البيانات', () => {
    h.report.mockReturnValue({ data: [], isLoading: false, error: null })
    render(<MemoryRouter><UnmatchedPeoplePage /></MemoryRouter>)
    expect(screen.getByText('لا أشخاص غير مطابقين في هذه الفترة')).toBeInTheDocument()
    expect(screen.getByTestId('unmatched-export')).toBeDisabled()
  })

  it('تصدير Excel: ورقة شبكة بصف لكل شخص وعمود لكل يوم (ملوّن) + مجاميع + ورقة تفاصيل يومية', async () => {
    render(<MemoryRouter><UnmatchedPeoplePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('unmatched-export'))
    await vi.waitFor(() => expect(h.download).toHaveBeenCalledTimes(1))
    const wb = await buildUnmatchedWorkbook(ROWS, { from: '2026-09-01', to: '2026-09-04', branchLabel: 'كل الفروع' })
    const ws = wb.getWorksheet('غير المطابقين')!
    expect(ws.getCell('A1').value).toContain('غير المطابقين')
    // الترويسة: 5 أعمدة ثابتة + 4 أيام + 4 مجاميع
    expect(ws.getRow(4).getCell(6).value).toBe('1')
    expect(ws.getRow(4).getCell(9).value).toBe('4')
    expect(ws.getRow(4).getCell(10).value).toBe('أيام الحضور')
    expect(ws.getRow(4).getCell(13).value).toBe('إجمالي الساعات')
    // صف الشخص الأول
    const r = ws.getRow(6)
    expect(r.getCell(2).value).toBe('كريم جاسم'); expect(r.getCell(3).value).toBe('901'); expect(r.getCell(4).value).toBe('فرع الكرخ')
    expect(r.getCell(6).value).toBe('ح 8:30'); expect(r.getCell(7).value).toBe('ن 08:05'); expect(r.getCell(8).value).toBe('غ'); expect(r.getCell(9).value).toBe('ح 8:00')
    expect((r.getCell(8).fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FFFEE2E2')
    expect((r.getCell(6).fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FFDCFCE7')
    expect(r.getCell(10).value).toBe(2); expect(r.getCell(11).value).toBe(1); expect(r.getCell(12).value).toBe(1); expect(r.getCell(13).value).toBe('16:30')
    expect(ws.getRow(7).getCell(2).value).toBe('— بلا اسم —')
    // الورقة الثانية: صف لكل شخص/يوم = 8 صفوف
    const det = wb.getWorksheet('التفاصيل اليومية')!
    expect(det.rowCount).toBe(4 + 8)
    expect(det.getRow(5).getCell(6).value).toBe('حاضر'); expect(det.getRow(6).getCell(6).value).toBe('بصمة ناقصة'); expect(det.getRow(7).getCell(6).value).toBe('غائب')
  })

  it('المساعدات: تنسيق الساعات ونص الخلية', () => {
    expect(fmtHours(510)).toBe('8:30'); expect(fmtHours(0)).toBe('0:00'); expect(fmtHours(65)).toBe('1:05')
    expect(dayCellText({ d: 'x', status: 'missing', n: 1, minutes: 0, first: '22:10', last: null })).toBe('ن 22:10')
    expect(dayCellText({ d: 'x', status: 'absent', n: 0, minutes: 0, first: null, last: null })).toBe('غ')
  })
})
