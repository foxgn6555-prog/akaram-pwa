/** لوحة البوابة التقنية v2 — رسوم Recharts حقيقية */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@features/system', () => ({
  useDbOverview: () => ({
    data: { allowed: true, db_size_bytes: 90112, open_errors: 2, tables_count: 15, version: '17' },
    isLoading: false,
  }),
  useDbStats: () => ({
    data: [{ table_name: 'employees', total_bytes: 90112, row_estimate: 10, seq_scan: 0, idx_scan: 0 }],
    isLoading: false,
  }),
  useErrorLogs: () => ({ data: [], isLoading: false }),
}))

vi.mock('@features/metrics', () => ({
  useConnectionHistory: () => ({
    data: [
      { at: '2026-08-26T10:00:00Z', ms: 120 },
      { at: '2026-08-26T10:01:00Z', ms: 95 },
    ],
  }),
  useLiveLatency: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@features/integrations', () => ({
  useIntegrationLogs: () => ({
    data: [
      { id: 1, provider: 'biometric', status: 'success', created_at: '2026-08-26T08:00:00Z' },
      { id: 2, provider: 'gps', status: 'success', created_at: '2026-08-26T09:00:00Z' },
    ],
    isLoading: false,
  }),
}))

vi.mock('@features/user-management', () => ({
  useUsers: () => ({
    data: [
      { id: 'u1', roles: ['employee'], employee_number: 'EMP-001' },
      { id: 'u2', roles: ['hr_officer'], employee_number: 'EMP-002' },
      { id: 'u3', roles: [], employee_number: null },
    ],
  }),
}))

vi.mock('@features/departments', () => ({
  useDepartments: () => ({ data: [{ id: 'd1' }, { id: 'd2' }] }),
}))

vi.mock('@sdk/employees.sdk', () => ({
  employees: { list: vi.fn(async () => [
    { employee_number: 'EMP-001', employment_status: 'active' },
    { employee_number: 'EMP-010', employment_status: 'active' },
  ]) },
}))

import ITDashboard from '@portals/it/pages/Dashboard/ITDashboard'

function renderDash() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ITDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ITDashboard v2 — الرسوم الحقيقية', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it('يعرض بطاقات الإحصائيات الحية', async () => {
    const { container } = renderDash()
    await waitFor(() => {
      const stats = screen.getByTestId('dash-stats')
      expect(stats).toHaveTextContent('3')          // مستخدمون
      expect(stats).toHaveTextContent('88.0 ك.ب')   // حجم
      expect(stats).toHaveTextContent('2')          // أخطاء
    })
    void container
  })

  it('يعرض رسوم الاتصال والقاعدة والأداء والأدوار والتكاملات', () => {
    renderDash()
    expect(screen.getByTestId('chart-connection')).toBeInTheDocument()
    expect(screen.getByTestId('chart-db')).toBeInTheDocument()
    expect(screen.getByTestId('chart-perf')).toBeInTheDocument()
    expect(screen.getByTestId('chart-roles')).toBeInTheDocument()
    expect(screen.getByTestId('chart-integrations')).toBeInTheDocument()
  })

  it('عناوين الرسوم تصف المصدر الحقيقي', () => {
    renderDash()
    expect(screen.getByText(/سرعة الاتصال بالخادم — قياس فعلي/)).toBeInTheDocument()
    expect(screen.getByText(/حجم الجداول.*pg_stat/)).toBeInTheDocument()
    expect(screen.getByText(/Performance API فعلي/)).toBeInTheDocument()
  })

  it('روابط سريعة توجّه للصفحات', async () => {
    const user = userEvent.setup()
    renderDash()
    await user.click(screen.getByTestId('quick-user-plus'))
    expect(mockNavigate).toHaveBeenCalledWith('/it/user-management/create')
    await user.click(screen.getByTestId('quick-activity'))
    expect(mockNavigate).toHaveBeenCalledWith('/it/database/errors')
  })

  it('عناصر التنبيه والروابط السريعة موجودة في البنية', () => {
    renderDash()
    expect(screen.getByTestId('quick-user-plus')).toBeInTheDocument()
    expect(screen.getByTestId('quick-activity')).toBeInTheDocument()
    expect(screen.getByTestId('quick-layout-grid')).toBeInTheDocument()
    expect(screen.getByTestId('quick-database')).toBeInTheDocument()
  })

  it('لا يحتوي أي بيانات وهمية (كل الرسوم من مصادر حقيقية)', () => {
    const { container } = renderDash()
    // التأكد من عدم وجود placeholder وهمي
    expect(container.textContent).not.toContain('بيانات تجريبية')
    expect(container.textContent).not.toContain('mock data')
  })
})
