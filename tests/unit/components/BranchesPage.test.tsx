/** وحدة الفروع: عرض + إنشاء + تفعيل/تعطيل */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockCreate = vi.fn()
const mockToggle = vi.fn()
const mockBranches = vi.fn()

vi.mock('@features/branches', () => ({
  useBranches: () => mockBranches(),
  useCreateBranch: () => ({ mutateAsync: mockCreate, isPending: false }),
  useToggleBranch: () => ({ mutate: mockToggle, isPending: false }),
}))

import BranchesPage from '@portals/it/pages/Branches/BranchesPage'

const FIXTURE = [
  { id: 'b1', name: 'فرع الكرادة', code: 'KRR', city: 'بغداد', address: null, phone: null, is_active: true },
  { id: 'b2', name: 'فرع المرية', code: 'MRY', city: null, address: null, phone: null, is_active: false },
]

describe('BranchesPage — فروع الشركة', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ id: 'b9', code: 'NEW' })
    mockBranches.mockReturnValue({ data: FIXTURE, isLoading: false })
  })

  it('يعرض الفروع مع الحالة', () => {
    render(<BranchesPage />)
    const table = screen.getByTestId('branches-table')
    expect(table).toHaveTextContent('فرع الكرادة')
    expect(table).toHaveTextContent('فرع المرية')
    expect(table).toHaveTextContent('نشط — اضغط للتعطيل')
    expect(table).toHaveTextContent('موقوف — اضغط للتفعيل')
  })

  it('إنشاء فرع برمز يرفع للأحرف الكبيرة تلقائياً في SDK (نختبر النداء)', async () => {
    const user = userEvent.setup()
    render(<BranchesPage />)
    await user.click(screen.getByTestId('toggle-branch-form'))
    await user.type(screen.getByTestId('branch-name'), 'فرع جديد')
    await user.type(screen.getByTestId('branch-code'), 'new')
    await user.click(screen.getByTestId('branch-submit'))

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'فرع جديد', code: 'new' }),
      )
    })
  })

  it('يرفض رمزاً بحروف عربية', async () => {
    const user = userEvent.setup()
    render(<BranchesPage />)
    await user.click(screen.getByTestId('toggle-branch-form'))
    await user.type(screen.getByTestId('branch-name'), 'فرع عربي')
    await user.type(screen.getByTestId('branch-code'), 'عربي')
    await user.click(screen.getByTestId('branch-submit'))

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('زر الحالة يبدل التفعيل', async () => {
    const user = userEvent.setup()
    render(<BranchesPage />)
    await user.click(screen.getByTestId('branch-toggle-MRY'))
    expect(mockToggle).toHaveBeenCalledWith({ id: 'b2', active: true })
  })
})
