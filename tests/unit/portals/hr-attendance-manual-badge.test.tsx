/**
 * الحضور اليدوي — أثره في تقارير الحضور:
 *   شارة «يدوي» في StatusBadge (تُميّز الكشف عن تعديل غرفة العمليات ✎) · شارة وملاحظة وعمود «أيام يدوية» في التقرير الشهري
 *   · فشل جلب العدّادات = لا شارات (لا خطأ ظاهراً) · بلا أيام يدوية تبقى الأعمدة المعتادة كما هي.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ grid: [] as unknown[], counts: vi.fn() }))
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [{ id: 'b1', name: 'الفرع الرئيسي' }] }) }))
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [{ id: 'dep1', name: 'قسم النظافة' }] }) }))
vi.mock('@features/hr/hooks/useHr', () => ({ useAttendanceGrid: () => ({ data: h.grid, isLoading: false }) }))
vi.mock('@features/hr/lib/hrExcel', () => ({ exportToExcel: vi.fn(async () => undefined) }))
vi.mock('@sdk/attendance-manual.sdk', async (importOriginal) => {
  const m = await importOriginal<{ attendanceManual: object } & Record<string, unknown>>()
  return { ...m, attendanceManual: { ...m.attendanceManual, monthCounts: h.counts } }
})

import MonthlyAttendanceReportPage, { monthlySpec } from '@portals/hr/pages/Attendance/MonthlyAttendanceReportPage'
import { StatusBadge } from '@portals/hr/components/hr-ui'
import { exportToExcel } from '@features/hr/lib/hrExcel'
import type { AttendanceGridRow } from '@features/hr/types'
import { fireEvent } from '@testing-library/react'

const gr = (n: string, p: Partial<AttendanceGridRow> = {}): AttendanceGridRow => ({
  employee_id: `id-${n}`, employee_number: n, full_name: `موظف ${n}`, job_title: null, department_id: 'dep1', department_name: 'قسم النظافة', branch_name: null, contract_type: null, days: [],
  present_days: 20, late_days: 0, early_days: 0, incomplete_days: 0, absent_days: 0, leave_days: 0, rest_days: 4, unevaluated_days: 0,
  worked_minutes: 0, late_minutes: 0, early_minutes: 0, shortfall_minutes: 0, overtime_minutes: 0, permit_minutes: 0, proposed_minutes: 0, proposed_days: 0, ...p,
})

describe('StatusBadge — شارة «يدوي»', () => {
  const renderBadge = (props: Parameters<typeof StatusBadge>[0]) => render(<StatusBadge {...props} />)

  it('صف سُجّل من كشف الحضور اليدوي ⇒ شارة «يدوي» بدل علامة التعديل ✎', () => {
    renderBadge({ status: 'present', source: 'manual', editReason: 'كشف حضور يدوي — المحطة التحويلية' })
    expect(screen.getByTestId('att-manual-sheet')).toHaveTextContent('يدوي')
    expect(screen.getByTestId('att-manual-sheet')).toHaveAttribute('title', expect.stringContaining('كشف الحضور اليدوي'))
    expect(screen.getByTestId('att-status')).not.toHaveTextContent('✎')
  })

  it('تعديل يدوي عادي (غرفة العمليات) يبقى ✎ بلا شارة «يدوي»', () => {
    renderBadge({ status: 'present', source: 'manual', editReason: 'تصحيح بصمة ناقصة' })
    expect(screen.queryByTestId('att-manual-sheet')).toBeNull()
    expect(screen.getByTestId('att-status')).toHaveTextContent('✎')
  })

  it('بلا سبب مخزَّن/المعدّل قديماً ⇒ ✎ كما كان (السلوك السابق محفوظ)', () => {
    renderBadge({ status: 'late', source: 'manual' })
    expect(screen.queryByTestId('att-manual-sheet')).toBeNull()
    expect(screen.getByTestId('att-status')).toHaveTextContent('✎')
  })

  it('صف تلقائي لا يحمل شارة حتى لو ورد سبب بالبادئة (المصدر هو المرجع)', () => {
    renderBadge({ status: 'present', source: 'auto', editReason: 'كشف حضور يدوي' })
    expect(screen.queryByTestId('att-manual-sheet')).toBeNull()
    expect(screen.getByTestId('att-status')).not.toHaveTextContent('✎')
  })

  it('بلا مصدر ⇒ لا شارة ولا علامة', () => {
    renderBadge({ status: 'absent' })
    expect(screen.queryByTestId('att-manual-sheet')).toBeNull()
    expect(screen.getByTestId('att-status')).not.toHaveTextContent('✎')
  })
})

describe('monthlySpec — عمود «أيام يدوية»', () => {
  const rows = [gr('E1'), gr('E2')]
  const base = monthlySpec(rows, '2026-10-01', [])

  it('بلا أيام يدوية: الأعمدة والملاحظة كما كانت تماماً', () => {
    for (const m of [undefined, new Map<string, number>(), new Map([['id-E1', 0]])]) {
      const spec = monthlySpec(rows, '2026-10-01', [], m)
      expect(spec.columns.map((c) => c.header)).toEqual(base.columns.map((c) => c.header))
      expect(spec.columns.map((c) => c.header)).not.toContain('أيام يدوية')
      expect(spec.footerNote).toBe(base.footerNote)
    }
    expect(base.columns[base.columns.length - 1]!.header).toBe('الالتزام %')
  })

  it('مع أيام يدوية: عمود أخير بقيم كل موظف (0 لمن لا أيام له) وملاحظة شرح في التذييل', () => {
    const spec = monthlySpec(rows, '2026-10-01', [], new Map([['id-E1', 3]]))
    expect(spec.columns.length).toBe(base.columns.length + 1)
    const col = spec.columns[spec.columns.length - 1]!
    expect(col.header).toBe('أيام يدوية')
    expect(rows.map((r) => col.value(r))).toEqual([3, 0])
    expect(spec.footerNote).toContain('«أيام يدوية» = أيام سُجّلت من كشف الحضور اليدوي')
    expect(spec.columns.slice(0, -1).map((c) => c.header)).toEqual(base.columns.map((c) => c.header))
  })
})

/** نقر التصدير وانتظار اكتمال حالته غير المتزامنة (ExportButton) كي لا تُطبع تحذيرات act */
async function clickExport() {
  fireEvent.click(screen.getByTestId('am-export'))
  await waitFor(() => expect(exportToExcel).toHaveBeenCalled())
  await act(async () => { await Promise.resolve() })
}

describe('تقرير الحضور الشهري — شارات اليدوي', () => {
  beforeEach(() => {
    h.grid = [gr('E1'), gr('E2'), gr('E3')]
    h.counts.mockReset()
    vi.mocked(exportToExcel).mockClear()
  })

  it('شارة بعدد الأيام لمن لديه أيام يدوية فقط، وملاحظة بعدد الموظفين، والتصدير يحمل العمود', async () => {
    h.counts.mockResolvedValue([{ employee_id: 'id-E1', days: 3, present: 2, absent: 1 }, { employee_id: 'id-E3', days: 0, present: 0, absent: 0 }])
    render(<MemoryRouter><MonthlyAttendanceReportPage /></MemoryRouter>)
    const badge = await screen.findByTestId('am-manual-E1')
    expect(badge).toHaveTextContent('يدوي 3')
    expect(badge).toHaveAttribute('title', expect.stringContaining('حاضر 2 · غائب 1'))
    expect(screen.queryByTestId('am-manual-E2')).toBeNull()
    expect(screen.queryByTestId('am-manual-E3')).toBeNull()   // صفر أيام ⇒ لا شارة
    expect(screen.getByTestId('am-manual-note')).toHaveTextContent('«يدوي»: 1 موظفاً')
    expect(h.counts).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-01$/))
    await clickExport()
    const spec = vi.mocked(exportToExcel).mock.calls[0]?.[0] as { columns: Array<{ header: string; value: (r: AttendanceGridRow) => unknown }>; rows: AttendanceGridRow[] }
    const col = spec.columns.find((c) => c.header === 'أيام يدوية')
    expect(col).toBeDefined()
    expect(spec.rows.map((r) => col!.value(r))).toEqual([3, 0, 0])
  })

  it('لا أيام يدوية في الشهر ⇒ لا شارات ولا ملاحظة ولا عمود', async () => {
    h.counts.mockResolvedValue([])
    render(<MemoryRouter><MonthlyAttendanceReportPage /></MemoryRouter>)
    await waitFor(() => expect(h.counts).toHaveBeenCalled())
    expect(screen.queryByTestId('am-manual-note')).toBeNull()
    expect(screen.queryByTestId('am-manual-E1')).toBeNull()
    await clickExport()
    const spec = vi.mocked(exportToExcel).mock.calls[0]?.[0] as { columns: Array<{ header: string }> }
    expect(spec.columns.map((c) => c.header)).not.toContain('أيام يدوية')
  })

  it('فشل جلب العدّادات (صلاحية/شبكة) ⇒ التقرير يعمل بلا شارات ولا خطأ ظاهر', async () => {
    h.counts.mockRejectedValue(new Error('network'))
    render(<MemoryRouter><MonthlyAttendanceReportPage /></MemoryRouter>)
    await waitFor(() => expect(h.counts).toHaveBeenCalled())
    expect(screen.getByTestId('am-row-E1')).toBeInTheDocument()
    expect(screen.queryByTestId('am-manual-E1')).toBeNull()
    expect(screen.queryByTestId('am-manual-note')).toBeNull()
  })
})
