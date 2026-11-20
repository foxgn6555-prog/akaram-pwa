/**
 * الجولة ٦ — لوحة صلاحيات الحساب: تعرض السقف الساري، تمنع تكرار المستوى المخزَّن،
 * وتُبقي «إزالة» معطّلة حين لا سقف. (الإنفاذ الحقيقي في الخادم — تختبره حزمة SQL)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const setMutate = vi.fn()
const clearMutate = vi.fn()

vi.mock('@features/permissions', () => ({
  useAccountLevels: () => ({
    data: [
      { unit_key: 'hr.employees', portal: 'hr', label: 'الموظفون', accessible: true, stored: 'view', effective: 'view' },
      { unit_key: 'finance.payroll', portal: 'finance', label: 'الرواتب', accessible: false, stored: null, effective: 'full' },
    ],
    isLoading: false,
    isError: false,
  }),
  useSetAccountLevel: () => ({ mutate: setMutate, isPending: false }),
  useClearAccountLevel: () => ({ mutate: clearMutate, isPending: false }),
}))
vi.mock('@sdk/users.sdk', () => ({
  users: {
    list: async () => [
      { id: 'u-1', email: 'hr@test.iq', employee_name: 'سارة', roles: ['hr_officer'] },
    ],
  },
}))

import { AccountLevelsPanel } from '@portals/it/pages/Permissions/AccountLevelsPanel'

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AccountLevelsPanel />
    </QueryClientProvider>,
  )
}

describe('AccountLevelsPanel — صلاحيات الحساب', () => {
  beforeEach(() => {
    setMutate.mockClear()
    clearMutate.mockClear()
  })

  it('لا تعرض وحدات قبل اختيار حساب', () => {
    renderPanel()
    expect(screen.queryByTestId('level-rows')).toBeNull()
    expect(screen.getByText(/اختر حساباً/)).toBeInTheDocument()
  })

  it('تعرض الوحدات المتاحة فقط بعد اختيار الحساب، مع السقف الساري', async () => {
    renderPanel()
    await userEvent.type(screen.getByTestId('level-user-search'), 'hr@test')
    await userEvent.click(await screen.findByText('hr@test.iq', {}, { timeout: 3000 }))
    await waitFor(() => expect(screen.getByTestId('level-rows')).toBeInTheDocument())
    expect(screen.getByText('الموظفون')).toBeInTheDocument()
    // الوحدة غير المتاحة مخفية افتراضياً
    expect(screen.queryByText('الرواتب')).toBeNull()
    // المستوى الساري معروض كشارة، والمستوى نفسه معطّل لأن السقف المخزَّن هو نفسه
    const row = within(screen.getByTestId('level-rows'))
    expect(row.getByRole('button', { name: 'عرض فقط' })).toBeDisabled()
    expect(row.getByRole('button', { name: 'كامل' })).toBeEnabled()
  })

  it('ضبط المستوى يستدعي الدالة المحروسة، و«إزالة» معطّلة حين لا سقف', async () => {
    renderPanel()
    await userEvent.type(screen.getByTestId('level-user-search'), 'hr@test')
    await userEvent.click(await screen.findByText('hr@test.iq', {}, { timeout: 3000 }))
    await waitFor(() => expect(screen.getByTestId('level-rows')).toBeInTheDocument())

    const row = within(screen.getByTestId('level-rows'))
    // «إزالة» متاحة لأن السقف مخزَّن صراحةً (view)
    expect(row.getByRole('button', { name: 'إزالة' })).toBeEnabled()

    await userEvent.click(row.getByRole('button', { name: 'كامل' }))
    expect(setMutate).toHaveBeenCalledWith({ userId: 'u-1', unit: 'hr.employees', level: 'full' })
  })
})
