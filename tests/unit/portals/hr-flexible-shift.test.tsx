/** 00215 — قوالب الشفتات: نوع «مرن» بساعات مطلوبة (افتراضي 12)، شارة في البطاقة، والحفظ يحمل kind/required_hours. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ save: vi.fn(async (_i: Record<string, unknown>) => ({})) }))
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [] }) }))
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [] }) }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useHrShifts: () => ({ data: [
    { id: 's1', name: 'صباحي', start_time: '08:00:00', end_time: '16:00:00', grace_minutes: 10, work_days: [0, 1, 2, 3, 4, 5, 6], is_active: true, kind: 'fixed', required_hours: null },
    { id: 's2', name: 'مرن صباحي', start_time: '05:00:00', end_time: '16:00:00', grace_minutes: 10, work_days: [0, 1, 2, 3, 4, 5, 6], is_active: true, kind: 'flexible', required_hours: 12 },
  ] }),
  useHrEmployees: () => ({ data: [], isLoading: false }),
  useCreateEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCompleteHireRequest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveShift: () => ({ mutateAsync: h.save, isPending: false }),
  useTerminateEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEmployeeDocuments: () => ({ data: [], isLoading: false }),
  useDeleteDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportEmployees: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useHrJobTitles: () => ({ data: [], isLoading: false }),
}))
import Recruitment from '@portals/hr/pages/Recruitment/Recruitment'

const openShifts = () => { render(<MemoryRouter><Recruitment /></MemoryRouter>); fireEvent.click(screen.getByText('قوالب الشفتات')) }

describe('الشفت المرن (00215)', () => {
  beforeEach(() => h.save.mockClear())
  it('بطاقة المرن تحمل شارة «مرن · 12 ساعة» والثابت بلا شارة؛ وخيار الشفت في التوظيف يذكر المرن', () => {
    openShifts()
    expect(screen.getByTestId('shift-flex-مرن صباحي')).toHaveTextContent('مرن · 12 ساعة')
    expect(screen.queryByTestId('shift-flex-صباحي')).toBeNull()
    expect(screen.getByTestId('shift-card-مرن صباحي')).toHaveTextContent('نافذة الدخول — بلا تأخير')
  })
  it('«+ شفت مرن» يفتح النموذج بنوع مرن و05:00–16:00 و12 ساعة قابلة للتعديل، والحفظ يحمل kind/required_hours', async () => {
    openShifts()
    fireEvent.click(screen.getByTestId('shift-new-flex'))
    expect(screen.getByTestId('s-kind')).toHaveValue('flexible')
    expect(screen.getByTestId('s-start')).toHaveValue('05:00')
    expect(screen.getByTestId('s-end')).toHaveValue('16:00')
    expect(screen.getByTestId('s-hours')).toHaveValue(12)
    fireEvent.change(screen.getByTestId('s-name'), { target: { value: 'مرن 10 ساعات' } })
    fireEvent.change(screen.getByTestId('s-hours'), { target: { value: '10' } })
    fireEvent.click(screen.getByTestId('s-save'))
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1))
    expect(h.save.mock.calls[0]?.[0]).toMatchObject({ name: 'مرن 10 ساعات', kind: 'flexible', required_hours: 10, start_time: '05:00', end_time: '16:00' })
  })
  it('الشفت الثابت يُحفظ بـ kind=fixed بلا ساعات مطلوبة، وتبديل النوع إلى مرن يُظهر حقل الساعات', async () => {
    openShifts()
    fireEvent.click(screen.getByTestId('shift-new'))
    expect(screen.queryByTestId('s-hours')).toBeNull()
    fireEvent.change(screen.getByTestId('s-name'), { target: { value: 'ثابت' } })
    fireEvent.click(screen.getByTestId('s-save'))
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1))
    expect(h.save.mock.calls[0]?.[0]).toMatchObject({ kind: 'fixed', required_hours: null })
    fireEvent.click(screen.getByTestId('shift-new'))
    fireEvent.change(screen.getByTestId('s-kind'), { target: { value: 'flexible' } })
    expect(screen.getByTestId('s-hours')).toHaveValue(12)
  })
})
