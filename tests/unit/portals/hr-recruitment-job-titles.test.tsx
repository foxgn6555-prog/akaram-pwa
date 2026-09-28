/** 00153 — نموذج التوظيف: المسمى الوظيفي يُختار من الهيكل التنظيمي (لا نص حر) والقسم يُشتق من القسم الأب. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  create: vi.fn(async (_input: Record<string, unknown>) => 'new-id'),
  titles: [] as Array<{ id: string; name: string; code: string; department_id: string; department_name: string; drives_vehicles: boolean; is_active: boolean; employees_active: number }>,
}))
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [{ id: 'b1', name: 'بغداد' }] }) }))
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [
  { id: 'd1', name: 'قسم الآليات', code: 'FLEET', parent_id: null, is_active: true, is_job_title: false },
  { id: 't1', name: 'سائق كابسة', code: 'T1', parent_id: 'd1', is_active: true, is_job_title: true, drives_vehicles: true },
] }) }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useHrShifts: () => ({ data: [{ id: 's1', name: 'صباحي', start_time: '08:00', end_time: '16:00', grace_minutes: 15, work_days: [0, 1, 2, 3, 4], is_active: true }] }),
  useHrEmployees: () => ({ data: [], isLoading: false }),
  useCreateEmployee: () => ({ mutateAsync: h.create, isPending: false }),
  useSaveShift: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTerminateEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEmployeeDocuments: () => ({ data: [], isLoading: false }),
  useDeleteDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportEmployees: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useHrJobTitles: () => ({ data: h.titles, isLoading: false }),
}))
import Recruitment from '@portals/hr/pages/Recruitment/Recruitment'

const fill = () => {
  fireEvent.change(screen.getByTestId('f-number'), { target: { value: 'E-9' } })
  fireEvent.change(screen.getByTestId('f-name'), { target: { value: 'علي حسن كاظم جواد' } })
  fireEvent.change(screen.getByTestId('f-branch'), { target: { value: 'b1' } })
  fireEvent.change(screen.getByTestId('f-shift'), { target: { value: 's1' } })
}

describe('التوظيف — المسمى من الهيكل التنظيمي', () => {
  beforeEach(() => { h.create.mockClear(); h.titles = [{ id: 't1', name: 'سائق كابسة', code: 'T1', department_id: 'd1', department_name: 'قسم الآليات', drives_vehicles: true, is_active: true, employees_active: 0 }] })
  it('لا حقل نصي للمسمى؛ الاختيار من قائمة مجمّعة بالقسم الأب، والقسم يُعرض مشتقاً للقراءة فقط، والإرسال يحمل job_title_id بلا job_title', async () => {
    render(<MemoryRouter><Recruitment /></MemoryRouter>)
    const title = screen.getByTestId('f-title') as HTMLSelectElement
    expect(title.tagName).toBe('SELECT')
    expect(title.querySelector('optgroup')?.getAttribute('label')).toBe('قسم الآليات')
    fill()
    fireEvent.click(screen.getByTestId('hire-submit'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('اختر المسمى الوظيفي'))
    expect(h.create).not.toHaveBeenCalled()
    fireEvent.change(title, { target: { value: 't1' } })
    expect((screen.getByTestId('f-dept-derived') as HTMLInputElement).value).toBe('قسم الآليات')
    expect(screen.queryByTestId('f-dept')).toBeNull()
    expect(screen.getByText(/يقود آليات/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('hire-submit'))
    await waitFor(() => expect(h.create).toHaveBeenCalled())
    const sent = h.create.mock.calls[0]![0]
    expect(sent.job_title_id).toBe('t1')
    expect(sent.department_id).toBe('d1')
    expect(sent).not.toHaveProperty('job_title')
  })
  it('بلا مسميات معرَّفة: القائمة معطّلة مع توجيه إلى الهيكل التنظيمي، ويُقبل اختيار القسم الأب مباشرة (لا تظهر المسميات كأقسام)', async () => {
    h.titles = []
    render(<MemoryRouter><Recruitment /></MemoryRouter>)
    expect(screen.getByTestId('f-title')).toBeDisabled()
    expect(screen.getByText(/أضفها من الهيكل التنظيمي/)).toBeInTheDocument()
    const dept = screen.getByTestId('f-dept') as HTMLSelectElement
    expect(Array.from(dept.options).map((o) => o.value)).toEqual(['', 'd1'])
    fill()
    fireEvent.change(dept, { target: { value: 'd1' } })
    fireEvent.click(screen.getByTestId('hire-submit'))
    await waitFor(() => expect(h.create).toHaveBeenCalled())
    expect(h.create.mock.calls[0]![0].department_id).toBe('d1')
  })
})
