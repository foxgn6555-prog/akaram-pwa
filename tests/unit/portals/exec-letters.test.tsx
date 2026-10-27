/**
 * 00357 — صفحة «كتب الشكر والتنبيه» (المدير المفوض ومعاونه): الرأس والعدّادات، التبويبات، الجدول، معاينة/طباعة،
 *          نموذج تنبيه/إنذار (موظف + نوع + سبب ≥ 5 أحرف) يستدعي RPC بالقيم الصحيحة، الحالة الفارغة، actor=deputy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ExecLettersPage from '@portals/executive/pages/Letters/ExecLettersPage'

const h = vi.hoisted(() => ({ rows: [] as unknown[], lastKind: '' as string, issue: vi.fn() }))
vi.mock('@features/hr/hooks/useHr', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useLettersList: (kind: string | null) => { h.lastKind = kind ?? ''; return { data: h.rows, isLoading: false } },
  useLettersYears: () => ({ data: [2026] }),
  useLetter: (id: string | null) => ({ data: id ? h.rows.find((r) => (r as { id: string }).id === id) : undefined, isLoading: false }),
  useLetterIssueDisciplinary: () => ({ mutate: h.issue, isPending: false }),
}))
vi.mock('@features/treasury/hooks', () => ({
  useEmployeeLookup: (q: string) => ({ data: q ? [{ id: 'e1', full_name: 'كرار علي', employee_number: 'A-1', job_title: 'سائق', department_name: 'النقل' }] : [] }),
}))

const row = (o: Record<string, unknown>) => ({
  id: 'l1', ref: '12/2026', letter_year: 2026, letter_no: 12, kind: 'thanks', kind_label: 'شكر وتقدير', subject: 'شكر وتقدير / كرار علي', employee_id: 'e1', employee_number: 'A-1', full_name: 'كرار علي', department_name: 'النقل', job_title: 'سائق',
  issued_at: '2026-10-01T08:00:00Z', issued_by_name: 'المدير التنفيذي', signer_name: 'المهندس حسين', signer_title: 'المدير المفوض', source_kind: 'treasury', source_id: 't1', hire_date: '2022-01-01', body: ['شكراً'], payload: { reward_ref: 'TR-1' }, ...o,
})
beforeEach(() => { vi.clearAllMocks(); h.rows = [row({}), row({ id: 'l2', ref: '13/2026', letter_no: 13, kind: 'notice', kind_label: 'تنبيه', subject: 'تنبيه / كرار علي', source_kind: 'disciplinary', payload: { reason: 'تأخر', prior_count: 0 } }), row({ id: 'l3', ref: '14/2026', letter_no: 14, kind: 'warning', kind_label: 'إنذار', subject: 'إنذار / كرار علي', source_kind: 'disciplinary', payload: { reason: 'تكرار', prior_count: 1 } })] })
const r = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('00357 — كتب الشكر والتنبيه', () => {
  it('الرأس (1 شكر، 1 تنبيه، 1 إنذار)، التبويبات تغيّر مرشّح النوع، الجدول بالعدد والنوع والموظف، المعاينة تفتح الكتاب', () => {
    r(<ExecLettersPage />)
    expect(screen.getByTestId('exec-letters-page')).toHaveAttribute('data-actor', 'executive')
    expect(screen.getByTestId('el-stat-thanks')).toHaveTextContent('1'); expect(screen.getByTestId('el-stat-notice')).toHaveTextContent('1'); expect(screen.getByTestId('el-stat-warning')).toHaveTextContent('1')
    expect(h.lastKind).toBe('admin_any')
    fireEvent.click(screen.getByTestId('el-tab-disciplinary_any')); expect(h.lastKind).toBe('disciplinary_any')
    fireEvent.click(screen.getByTestId('el-tab-thanks')); expect(h.lastKind).toBe('thanks')
    const tr = screen.getByTestId('el-row-14-2026')
    expect(tr).toHaveTextContent('14/2026'); expect(tr).toHaveTextContent('إنذار'); expect(tr).toHaveTextContent('كرار علي'); expect(tr).toHaveTextContent('A-1 · النقل')
    expect(screen.getByTestId('el-table').textContent).not.toMatch(/[٠-٩]/)
    fireEvent.click(screen.getByTestId('el-open-14-2026'))
    expect(screen.getByTestId('letter-ref')).toHaveTextContent('العدد 14/2026'); expect(screen.getByTestId('letter-kind')).toHaveTextContent('إنذار')
    expect((screen.getByTestId('letter-frame') as HTMLIFrameElement).getAttribute('srcdoc')).toContain('doc-warning')
    fireEvent.click(screen.getByTestId('letter-close')); expect(screen.queryByTestId('letter-viewer')).toBeNull()
  })
  it('نموذج تنبيه/إنذار: معطّل حتى اختيار موظف وسبب ≥ 5 أحرف، ويرسل employeeId/kind/reason؛ الإنذار زر أحمر', async () => {
    r(<ExecLettersPage actor="deputy" />)
    expect(screen.getByTestId('exec-letters-page')).toHaveAttribute('data-actor', 'deputy')
    fireEvent.click(screen.getByTestId('btn-new-disciplinary'))
    expect(screen.getByTestId('dl-submit')).toBeDisabled(); expect(screen.getByTestId('dl-submit')).toHaveTextContent('إصدار التنبيه')
    fireEvent.change(screen.getByTestId('dl-emp-input'), { target: { value: 'كرار' } })
    fireEvent.click(await screen.findByTestId('dl-emp-opt-e1')); expect(screen.getByTestId('dl-emp-selected')).toHaveTextContent('كرار علي')
    fireEvent.change(screen.getByTestId('dl-reason'), { target: { value: 'قصير' } }); expect(screen.getByTestId('dl-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('dl-reason'), { target: { value: 'التأخر المتكرر عن الدوام الصباحي' } }); expect(screen.getByTestId('dl-submit')).toBeEnabled()
    fireEvent.click(screen.getByTestId('dl-kind-warning')); expect(screen.getByTestId('dl-submit')).toHaveTextContent('إصدار الإنذار')
    fireEvent.click(screen.getByTestId('dl-submit'))
    await waitFor(() => expect(h.issue).toHaveBeenCalledTimes(1))
    expect(h.issue.mock.calls[0]![0]).toEqual({ employeeId: 'e1', kind: 'warning', reason: 'التأخر المتكرر عن الدوام الصباحي' })
  })
  it('لا كتب ⇒ حالة فارغة', () => {
    h.rows = []
    r(<ExecLettersPage />)
    expect(screen.getByText('لا كتب هنا')).toBeInTheDocument()
  })
})
