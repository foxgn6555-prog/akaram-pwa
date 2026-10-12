/** 00207: صفحة «الموظفون» في بوابة الكراج — بيانات أساسية فقط، بلا رواتب ولا بيانات حساسة. */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const employees = vi.fn()
vi.mock('@sdk/central-garage.sdk', () => ({ centralGarage: { employees: (...a: unknown[]) => employees(...a) } }))

import GarageEmployeesPage from '@portals/central-garage/pages/GarageEmployeesPage'

const row = (o: Record<string, unknown>) => ({
  id: 'e1', employee_number: 'G-001', full_name: 'أحمد علي', job_title: 'سائق', department: 'الكراج المركزي', is_driver: true, hire_date: '2025-01-01', employment_status: 'active', contract_type: 'monthly',
  phone: '07700000000', shift: 'الصباحي', vehicle: 'بغداد 12345', month: { present: 20, late: 1, absent: 2, leave: 0, working_days: 23 }, open_disclosures: 1, approved_disclosures_month: 0, ...o,
})
const payload = {
  month: '2026-10-01', department: 'الكراج المركزي', scoped: true,
  summary: { total: 2, drivers: 1, active: 2, on_leave: 0, absent_today: 1, with_open_disclosures: 1 },
  rows: [row({}), row({ id: 'e2', employee_number: 'G-002', full_name: 'سارة حسن', job_title: 'محاسب كراج', is_driver: false, vehicle: null, month: { present: 23, late: 0, absent: 0, leave: 0, working_days: 23 }, open_disclosures: 0 })],
}
const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

describe('GarageEmployeesPage (00207)', () => {
  beforeEach(() => { employees.mockReset(); employees.mockResolvedValue(payload) })

  it('يعرض الرأس الموحد والإحصاءات والصفوف دون أي بيانات حساسة', async () => {
    wrap(<GarageEmployeesPage />)
    expect(await screen.findByTestId('exec-page-header')).toHaveTextContent('موظفو الكراج')
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('عليهم كشوفات مفتوحة')
    expect(await screen.findByTestId('emp-row-G-001')).toHaveTextContent('أحمد علي')
    expect(screen.getByTestId('emp-row-G-001')).toHaveTextContent('سائق')
    expect(screen.getByTestId('emp-row-G-001')).toHaveTextContent('20/23')
    expect(screen.getByTestId('emp-row-G-002')).toHaveTextContent('سارة حسن')
    const html = screen.getByTestId('emp-table').innerHTML
    for (const forbidden of ['راتب', 'بصمة', 'الهوية', 'salary']) expect(html).not.toContain(forbidden)
    expect(employees).toHaveBeenCalledWith(null, expect.stringMatching(/^\d{4}-\d{2}$/))
  })

  it('المرشّحات تعمل: السائقون / الكادر / بحاجة متابعة', async () => {
    wrap(<GarageEmployeesPage />)
    await screen.findByTestId('emp-row-G-001')
    fireEvent.click(screen.getByRole('tab', { name: 'الكادر' }))
    expect(screen.queryByTestId('emp-row-G-001')).toBeNull(); expect(screen.getByTestId('emp-row-G-002')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'بحاجة متابعة' }))
    expect(screen.getByTestId('emp-row-G-001')).toBeInTheDocument(); expect(screen.queryByTestId('emp-row-G-002')).toBeNull()
  })

  it('البحث وتغيير الشهر يُمرَّران إلى SDK', async () => {
    wrap(<GarageEmployeesPage />)
    await screen.findByTestId('emp-row-G-001')
    fireEvent.change(screen.getByTestId('emp-month'), { target: { value: '2026-09' } })
    await waitFor(() => expect(employees).toHaveBeenLastCalledWith(null, '2026-09'))
    fireEvent.change(screen.getByTestId('emp-search'), { target: { value: 'سارة' } })
    await waitFor(() => expect(employees).toHaveBeenLastCalledWith('سارة', '2026-09'))
  })

  it('يعرض رسالة واضحة عند عدم ربط الحساب بقسم', async () => {
    employees.mockRejectedValue(new Error('GARAGE_NO_DEPARTMENT'))
    wrap(<GarageEmployeesPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('غير مربوط بقسم')
  })
})
