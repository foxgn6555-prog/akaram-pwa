/** 00271 — بطاقة ورشة الصيانة في التطوير المركزية: تعرض الورشة الحالية، اختيار ورشة أخرى، الحفظ يستدعي الإسناد */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockAssign = vi.fn()
vi.mock('@features/maintenance-workshops/hooks', () => ({
  useMaintenanceWorkshops: () => ({ data: [
    { key: 'central', name: 'الصيانة المركزية', parent_sector: null, is_active: true, accounts: 3, open_cases: 5 },
    { key: 'zaafaraniya', name: 'صيانة قاطع الزعفرانية', parent_sector: 'zaafaraniya', is_active: true, accounts: 0, open_cases: 0 },
  ] }),
  useMaintenanceWorkshopAccount: () => ({ data: { is_maintenance: true, workshop_key: 'central', workshop_name: 'الصيانة المركزية', explicit: false } }),
  useAssignMaintenanceWorkshop: () => ({ mutate: mockAssign, isPending: false }),
}))
import { MaintenanceWorkshopCard } from '@portals/it/pages/UserManagement/MaintenanceWorkshopCard'

describe('MaintenanceWorkshopCard (00271)', () => {
  it('الورشة الحالية افتراضية = المركزية؛ الحفظ معطّل حتى يتغير الاختيار؛ اختيار الزعفرانية ثم الحفظ يرسل الإسناد', async () => {
    const user = userEvent.setup()
    render(<MaintenanceWorkshopCard userId="u1" />)
    expect(screen.getByTestId('mw-current')).toHaveTextContent('الصيانة المركزية (افتراضي)')
    expect(screen.getByTestId('mw-opt-central')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mw-save')).toBeDisabled()
    await user.click(screen.getByTestId('mw-opt-zaafaraniya'))
    expect(screen.getByTestId('mw-save')).toBeEnabled()
    await user.click(screen.getByTestId('mw-save'))
    expect(mockAssign).toHaveBeenCalledWith({ userId: 'u1', workshopKey: 'zaafaraniya' })
  })
})
