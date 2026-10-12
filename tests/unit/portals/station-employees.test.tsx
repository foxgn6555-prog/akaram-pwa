/** 00211: صفحة «الموظفون» في بوابة المحطة التحويلية — نفس الصفحة المشتركة، بعنوان المحطة وبلا بيانات حساسة. */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const employees = vi.fn()
vi.mock('@sdk/central-garage.sdk', () => ({ centralGarage: { employees: (...a: unknown[]) => employees(...a) } }))

import StationEmployeesPage from '@portals/transfer-station/pages/Employees/StationEmployeesPage'
import { disclosureErrorMessage } from '@sdk/disclosures-unit.sdk'

const payload = {
  month: '2026-10-01', department: 'المحطة التحويلية', scoped: true,
  summary: { total: 1, drivers: 0, active: 1, on_leave: 0, absent_today: 0, with_open_disclosures: 0 },
  rows: [{ id: 'e1', employee_number: 'S-001', full_name: 'موظف الميزان', job_title: 'وزّان', department: 'ميزان المحطة', is_driver: false, hire_date: '2025-01-01', employment_status: 'active', contract_type: 'monthly',
    phone: '07700000001', shift: 'الصباحي', vehicle: null, month: { present: 20, late: 0, absent: 0, leave: 0, working_days: 22 }, open_disclosures: 0, approved_disclosures_month: 0 }],
}
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><StationEmployeesPage /></QueryClientProvider>)

describe('StationEmployeesPage (00211)', () => {
  beforeEach(() => { employees.mockReset() })
  it('الرأس الموحد بعنوان المحطة وقسمها، والصفوف بلا بيانات حساسة', async () => {
    employees.mockResolvedValue(payload)
    wrap()
    expect(await screen.findByTestId('station-employees-page')).toBeInTheDocument()
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('موظفو المحطة')
    expect(await screen.findByTestId('emp-row-S-001')).toHaveTextContent('موظف الميزان')
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('المحطة التحويلية')
    const html = screen.getByTestId('emp-table').innerHTML
    for (const forbidden of ['راتب', 'بصمة', 'الهوية', 'salary']) expect(html).not.toContain(forbidden)
  })
  it('حساب محطة بلا قسم ⇒ رسالة واضحة تذكر المحطة', async () => {
    employees.mockRejectedValue(new Error('STATION_NO_DEPARTMENT'))
    wrap()
    expect(await screen.findByRole('alert')).toHaveTextContent('قسم المحطة التحويلية')
    expect(disclosureErrorMessage(new Error('STATION_NO_DEPARTMENT'))).toContain('المحطة التحويلية')
  })
})
