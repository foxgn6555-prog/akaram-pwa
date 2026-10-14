/** 00223: صفحة «الموظفون» في بوابة الصيانة — نفس الصفحة المشتركة، بعنوان الصيانة وبلا بيانات حساسة. */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const employees = vi.fn()
vi.mock('@sdk/central-garage.sdk', () => ({ centralGarage: { employees: (...a: unknown[]) => employees(...a) } }))

import MaintenanceEmployeesPage from '@portals/maintenance/pages/Employees/MaintenanceEmployeesPage'
import { disclosureErrorMessage } from '@sdk/disclosures-unit.sdk'

const payload = {
  month: '2026-10-01', department: 'الصيانة', scoped: true,
  summary: { total: 1, drivers: 0, active: 1, on_leave: 0, absent_today: 0, with_open_disclosures: 0 },
  rows: [{ id: 'e1', employee_number: 'M-001', full_name: 'فني الورشة', job_title: 'فني صيانة', department: 'ورشة الصيانة', is_driver: false, hire_date: '2025-01-01', employment_status: 'active', contract_type: 'monthly',
    phone: '07700000001', shift: 'الصباحي', vehicle: null, month: { present: 20, late: 0, absent: 0, leave: 0, working_days: 22 }, open_disclosures: 0, approved_disclosures_month: 0 }],
}
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MaintenanceEmployeesPage /></QueryClientProvider>)

describe('MaintenanceEmployeesPage (00223)', () => {
  beforeEach(() => { employees.mockReset() })
  it('الرأس الموحد بعنوان الصيانة وقسمها، والصفوف بلا بيانات حساسة', async () => {
    employees.mockResolvedValue(payload)
    wrap()
    expect(await screen.findByTestId('maintenance-employees-page')).toBeInTheDocument()
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('موظفو الصيانة')
    expect(await screen.findByTestId('emp-row-M-001')).toHaveTextContent('فني الورشة')
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('الصيانة')
    const html = screen.getByTestId('emp-table').innerHTML
    for (const forbidden of ['راتب', 'بصمة', 'الهوية', 'salary']) expect(html).not.toContain(forbidden)
  })
  it('حساب صيانة بلا قسم ⇒ رسالة واضحة تذكر الصيانة', async () => {
    employees.mockRejectedValue(new Error('MAINTENANCE_NO_DEPARTMENT'))
    wrap()
    expect(await screen.findByRole('alert')).toHaveTextContent('قسم الصيانة')
    expect(disclosureErrorMessage(new Error('MAINTENANCE_NO_DEPARTMENT'))).toContain('الصيانة')
  })
})
