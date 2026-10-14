/** 00223: صفحة «الإجراءات» في بوابة الصيانة — نفس الصفحة المشتركة بعنوان الصيانة؛ رقم M-xxxx؛ مسميات قسم الصيانة فقط؛ بلا حقول حساسة. */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const hireOptions = vi.fn(); const hire = vi.fn(); const recentHires = vi.fn(); const mine = vi.fn(); const targets = vi.fn()
vi.mock('@sdk/central-garage.sdk', () => ({ centralGarage: { hireOptions: () => hireOptions(), hire: (...a: unknown[]) => hire(...a), recentHires: () => recentHires() } }))
vi.mock('@sdk/sector-manager.sdk', async (orig) => {
  const m = await orig<Record<string, unknown>>()
  return { ...m, procedures: { ...(m.procedures as object), mine: () => mine(), targets: () => targets(), create: vi.fn(), cancel: vi.fn() } }
})

import MaintenanceProceduresPage from '@portals/maintenance/pages/Procedures/MaintenanceProceduresPage'

const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MaintenanceProceduresPage /></QueryClientProvider>)

describe('MaintenanceProceduresPage (00223)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hireOptions.mockResolvedValue({ job_titles: [{ id: 't1', name: 'فني صيانة', department_id: 'd2', department: 'ورشة الصيانة', drives_vehicles: false }], shifts: [], next_employee_number: 'M-0001', scoped: true })
    recentHires.mockResolvedValue([])
    mine.mockResolvedValue([])
    targets.mockResolvedValue([{ target_kind: 'employee', employee_id: 'e1', worker_id: null, user_id: 'u1', full_name: 'فني الورشة', label: 'الصيانة · فني صيانة', scope: 'maintenance', employee_number: 'M-001' }])
    hire.mockResolvedValue({ id: 'e10', employee_number: 'M-0001', full_name: 'فني جديد', job_title: 'فني صيانة', department_id: 'd2', is_driver: false, hire_date: '2026-10-12', contract_type: 'monthly' })
  })

  it('الرأس الموحد بعنوان الصيانة، رقم M-xxxx، مسميات قسم الصيانة فقط، وإرسال بلا حقول حساسة', async () => {
    wrap()
    expect(await screen.findByTestId('maintenance-procedures-page')).toBeInTheDocument()
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('إجراءات الصيانة')
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('قسم الصيانة')
    const form = await screen.findByTestId('gp-hire-form')
    expect(form).toHaveTextContent('تعيين موظف جديد في قسم الصيانة')
    expect(form.innerHTML).not.toMatch(/راتب<|بصمة<|الهوية|البطاقة/)
    await waitFor(() => expect(screen.getByTestId('gp-number')).toHaveValue('M-0001'))
    expect(screen.getByTestId('gp-title')).toHaveTextContent('فني صيانة')
    fireEvent.change(screen.getByTestId('gp-name'), { target: { value: 'فني جديد' } })
    fireEvent.change(screen.getByTestId('gp-title'), { target: { value: 't1' } })
    fireEvent.click(screen.getByTestId('gp-hire-submit'))
    await waitFor(() => expect(hire).toHaveBeenCalledTimes(1))
    const sent = hire.mock.calls[0]?.[0] as Record<string, unknown>
    expect(sent).toMatchObject({ full_name: 'فني جديد', employee_number: 'M-0001', job_title_id: 't1' })
    expect(Object.keys(sent)).toEqual(expect.not.arrayContaining(['biometric_pin', 'base_salary', 'national_id_number']))
  })

  it('تبويب إنهاء الخدمة يعرض موظفي قسم الصيانة فقط', async () => {
    wrap()
    await screen.findByTestId('gp-hire-form')
    fireEvent.click(screen.getByText('إنهاء خدمة'))
    expect(await screen.findByTestId('target-e1')).toHaveTextContent('فني الورشة')
    expect(screen.getByTestId('target-e1')).toHaveTextContent('الصيانة')
  })
})
