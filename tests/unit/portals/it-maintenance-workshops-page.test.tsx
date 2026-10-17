/** 00274 — صفحة ورش الصيانة في التطوير المركزية */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ setActive: vi.fn(), open: 0 }))
vi.mock('@features/maintenance-workshops/hooks', () => ({
  useMaintenanceWorkshops: () => ({ data: [
    { key: 'central', name: 'الصيانة المركزية', parent_sector: null, is_active: true, accounts: 3, open_cases: 5 },
    { key: 'zaafaraniya', name: 'صيانة قاطع الزعفرانية', parent_sector: 'zaafaraniya', is_active: true, accounts: 1, open_cases: h.open },
  ] }),
  useMaintenanceWorkshopAccounts: () => ({ data: [
    { user_id: 'u1', display_name: 'مسؤول المركزية', email: 'c@t.iq', workshop_key: 'central', workshop_name: 'الصيانة المركزية', explicit: false, assigned_at: null, department_name: 'الصيانة' },
    { user_id: 'u2', display_name: 'فني الزعفرانية', email: 'z@t.iq', workshop_key: 'zaafaraniya', workshop_name: 'صيانة قاطع الزعفرانية', explicit: true, assigned_at: '2026-10-17T00:00:00Z', department_name: 'صيانة الزعفرانية' },
  ], isLoading: false }),
  useSetMaintenanceWorkshopActive: () => ({ mutate: h.setActive, isPending: false }),
}))
import MaintenanceWorkshopsPage from '@portals/it/pages/UserManagement/MaintenanceWorkshopsPage'

beforeEach(() => { h.setActive.mockReset(); h.open = 0; vi.spyOn(window, 'confirm').mockReturnValue(true) })

describe('MaintenanceWorkshopsPage (00274)', () => {
  it('يعرض الورشتين بأعدادهما وحسابات الصيانة مع رابط تفاصيل المستخدم؛ لا زر إيقاف للمركزية؛ إيقاف الزعفرانية بتأكيد', () => {
    render(<MemoryRouter><MaintenanceWorkshopsPage /></MemoryRouter>)
    expect(screen.getByTestId('workshop-accounts-central')).toHaveTextContent('3')
    expect(screen.getByTestId('workshop-open-zaafaraniya')).toHaveTextContent('0')
    expect(screen.queryByTestId('workshop-toggle-central')).toBeNull()
    expect(screen.getByTestId('account-u2')).toHaveTextContent('صيانة قاطع الزعفرانية')
    expect(screen.getByTestId('account-u2')).toHaveTextContent('مُسند')
    expect(screen.getByTestId('account-link-u2')).toHaveAttribute('href', '/it/user-management/u2')
    fireEvent.click(screen.getByTestId('workshop-toggle-zaafaraniya'))
    expect(h.setActive).toHaveBeenCalledWith({ key: 'zaafaraniya', isActive: false })
  })
  it('ورشة لديها حالات مفتوحة لا يمكن إيقافها (الزر معطّل)', () => {
    h.open = 2
    render(<MemoryRouter><MaintenanceWorkshopsPage /></MemoryRouter>)
    expect(screen.getByTestId('workshop-toggle-zaafaraniya')).toBeDisabled()
  })
})
