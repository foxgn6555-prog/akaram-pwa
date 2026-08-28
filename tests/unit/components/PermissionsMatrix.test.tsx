/** مصفوفة الصلاحيات: الدورة (افتراضي→منح→إخفاء) + القيود الفردية */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockSetRole = vi.fn()
const mockSetOverride = vi.fn()
const mockRolePerms = vi.fn()
const mockOverrides = vi.fn()

vi.mock('@features/permissions', () => ({
  useRolePermissions: () => mockRolePerms(),
  useUserOverrides: () => mockOverrides(),
  useSetRoleEffect: () => ({ mutate: mockSetRole, isPending: false }),
  useSetUserOverride: () => ({ mutate: mockSetOverride, isPending: false }),
}))

import PermissionsMatrix from '@portals/it/pages/Permissions/PermissionsMatrix'

const PERMS = [
  { id: 'p1', role: 'hr_officer', page_key: 'it.db.tables', effect: 'grant' },
  { id: 'p2', role: 'employee', page_key: 'employee.dashboard', effect: 'hide' },
] as never

describe('PermissionsMatrix — مصفوفة الصلاحيات', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRolePerms.mockReturnValue({ data: PERMS, isLoading: false })
    mockOverrides.mockReturnValue({ data: [], isLoading: false })
  })

  it('يعرض المصفوفة بكل الصفحات والأدوار', () => {
    render(<PermissionsMatrix />)
    expect(screen.getByTestId('perm-matrix')).toHaveTextContent('المستخدمون')
    expect(screen.getByTestId('perm-matrix')).toHaveTextContent('فروع الشركة')
    expect(screen.getByTestId('perm-matrix')).toHaveTextContent('موظف')
    expect(screen.getByTestId('perm-matrix')).toHaveTextContent('موارد بشرية')
  })

  it('خلية منحوحة تعرض ✓', () => {
    render(<PermissionsMatrix />)
    const cell = screen.getByTestId('cell-it-db-tables-hr_officer')
    expect(cell).toHaveTextContent('✓')
  })

  it('خلية مخفية تعرض ✗', () => {
    render(<PermissionsMatrix />)
    const cell = screen.getByTestId('cell-employee-dashboard-employee')
    expect(cell).toHaveTextContent('✗')
  })

  it('النقر على خلية فارغة → منح (grant)', async () => {
    const user = userEvent.setup()
    render(<PermissionsMatrix />)
    await user.click(screen.getByTestId('cell-hr-payroll-finance_officer'))
    expect(mockSetRole).toHaveBeenCalledWith({ role: 'finance_officer', pageKey: 'hr.payroll', effect: 'grant' })
  })

  it('النقر على خلية منحوحة → إخفاء (hide)', async () => {
    const user = userEvent.setup()
    render(<PermissionsMatrix />)
    await user.click(screen.getByTestId('cell-it-db-tables-hr_officer'))
    expect(mockSetRole).toHaveBeenCalledWith({ role: 'hr_officer', pageKey: 'it.db.tables', effect: 'hide' })
  })

  it('النقر على خلية مخفية → إلغاء (null)', async () => {
    const user = userEvent.setup()
    render(<PermissionsMatrix />)
    await user.click(screen.getByTestId('cell-employee-dashboard-employee'))
    expect(mockSetRole).toHaveBeenCalledWith({ role: 'employee', pageKey: 'employee.dashboard', effect: null })
  })

  it('قسم القيود الفردية يعرض القفل والسبب', () => {
    mockOverrides.mockReturnValue({
      data: [{ id: 'o1', user_id: 'u-abc', page_key: 'it.users.list', effect: 'lock', reason: 'إجازة' }],
      isLoading: false,
    })
    render(<PermissionsMatrix />)
    expect(screen.getByTestId('overrides-list')).toHaveTextContent('مقفول')
    expect(screen.getByTestId('overrides-list')).toHaveTextContent('إجازة')
  })

  it('إضافة قيد فردي يرسل الحمولة', async () => {
    const user = userEvent.setup()
    render(<PermissionsMatrix />)
    const form = screen.getByTestId('add-override')
    const inputs = form.querySelectorAll('input')
    await user.type(inputs[0] as HTMLElement, 'user-123')
    await user.type(inputs[1] as HTMLElement, 'it.users.list')
    await user.click(screen.getByTestId('add-override-btn'))
    expect(mockSetOverride).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123', pageKey: 'it.users.list', effect: 'lock' }),
    )
  })
})
