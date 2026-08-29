/** لوحة بوابة التطوير المركزية — الترحيب الذكي + مؤشرات المنظومة + الرسوم الحقيقية */
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

vi.mock('@features/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    data: { id: 'u1', email: 'it@x.iq', fullName: 'مدير النظام', roles: ['it_admin'], primaryRole: 'it_admin' },
  }),
}))

vi.mock('@features/system', () => ({
  useDbOverview: () => ({
    data: { allowed: true, db_size_bytes: 90112, open_errors: 2, tables_count: 15, total_rows: 420, version: '17' },
    isLoading: false,
  }),
  useDbStats: () => ({
    data: [{ table_name: 'employees', total_bytes: 90112, row_estimate: 10, seq_scan: 0, idx_scan: 0 }],
    isLoading: false,
  }),
  useErrorLogs: () => ({
    data: [
      { id: 1, error_type: 'runtime', message: 'خطأ أول للعرض', created_at: '2026-08-28T10:00:00Z' },
      { id: 2, error_type: 'network', message: 'خطأ ثانٍ للعرض', created_at: '2026-08-28T09:00:00Z' },
    ],
    isLoading: false,
  }),
}))

vi.mock('@features/metrics', () => ({
  useConnectionHistory: () => ({
    data: [
      { at: '2026-08-28T10:00:00Z', ms: 120 },
      { at: '2026-08-28T10:01:00Z', ms: 95 },
    ],
  }),
  useLiveLatency: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@features/integrations', () => ({
  useIntegrationLogs: () => ({
    data: [
      { id: 1, provider: 'biometric', status: 'success', created_at: '2026-08-28T08:00:00Z' },
      { id: 2, provider: 'gps', status: 'success', created_at: '2026-08-28T09:00:00Z' },
    ],
  }),
  useDevices: () => ({ data: [{ id: 'd1', is_active: true }, { id: 'd2', is_active: false }] }),
  useVehicles: () => ({ data: [{ id: 'v1', is_active: true }] }),
  useProviders: () => ({ data: [{ id: 'p1', is_active: true }] }),
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

vi.mock('@features/branches', () => ({
  useBranches: () => ({ data: [{ id: 'b1', is_active: true }, { id: 'b2', is_active: false }] }),
}))

vi.mock('@features/portals', () => ({
  usePortals: () => ({ data: [{ id: 'p1', is_active: true }, { id: 'p2', is_active: true }] }),
}))

vi.mock('@features/archive', () => ({
  useArchiveCounts: () => ({ data: [{ table: 'employees', count: 4 }, { table: 'vehicles', count: 1 }] }),
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

describe('ITDashboard v3 — اللوحة الحية للبوابة', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it('⛔ الانحدار: لا يعرض «قيد التطوير» إطلاقاً (إصلاح Placeholder على الرئيسية)', () => {
    const { container } = renderDash()
    expect(container.textContent).not.toContain('قيد التطوير')
    expect(screen.queryByTestId('unit-placeholder')).not.toBeInTheDocument()
  })

  it('يرحب بالمستخدم باسمه ويظهر دوره', () => {
    renderDash()
    expect(screen.getByTestId('dash-greeting')).toHaveTextContent('مدير النظام')
    expect(screen.getByTestId('dash-role')).toHaveTextContent('تقنية معلومات')
  })

  it('يوفر زر تحديث فوري ويحدد وقت آخر تحديث تلقائياً عند التحميل', async () => {
    const user = userEvent.setup()
    renderDash()
    // التحديث التلقائي يعمل فور التحميل — يحدد الطابع الزمني مباشرة
    await waitFor(() => {
      expect(screen.getByTestId('last-refresh').textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    })
    // الزر يعمل بلا أخطاء ويبقي الطابع صالحاً
    await user.click(screen.getByTestId('refresh-now'))
    expect(screen.getByTestId('last-refresh').textContent).toMatch(/\d{2}\/\d{2}\/\d{4} · \d{2}:\d{2}/)
  })

  it('يعرض بطاقات المؤشرات الحية', async () => {
    renderDash()
    await waitFor(() => {
      const stats = screen.getByTestId('dash-stats')
      expect(stats).toHaveTextContent('3')          // مستخدمون
      expect(stats).toHaveTextContent('88.0 ك.ب')   // حجم
      expect(stats).toHaveTextContent('2')          // أخطاء
    })
  })

  it('مؤشرات المنظومة: الفروع والأجهزة والمركبات والبوابات والمؤرشف', () => {
    renderDash()
    const stats = screen.getByTestId('dash-stats')
    expect(stats).toHaveTextContent('الفروع النشطة')
    expect(stats).toHaveTextContent('أجهزة البصمة')
    expect(stats).toHaveTextContent('مركبات GPS')
    expect(stats).toHaveTextContent('مزودون نشطون: 1')
    expect(stats).toHaveTextContent('بوابات ديناميكية')
    expect(stats).toHaveTextContent('سجلات مؤرشفة')
    expect(stats).toHaveTextContent('5')            // 4 + 1 مؤرشف
  })

  it('يعرض رسوم الاتصال والقاعدة والأداء والأدوار والتكاملات', () => {
    renderDash()
    expect(screen.getByTestId('chart-connection')).toBeInTheDocument()
    expect(screen.getByTestId('chart-db')).toBeInTheDocument()
    expect(screen.getByTestId('chart-perf')).toBeInTheDocument()
    expect(screen.getByTestId('chart-roles')).toBeInTheDocument()
    expect(screen.getByTestId('chart-integrations')).toBeInTheDocument()
  })

  it('يعرض آخر الأخطاء المفتوحة مع رابط العرض الكامل', () => {
    renderDash()
    const errors = screen.getByTestId('recent-errors')
    expect(errors).toHaveTextContent('خطأ أول للعرض')
    expect(errors).toHaveTextContent('runtime')
    expect(errors).toHaveTextContent('عرض الكل')
  })

  it('روابط سريعة تغطي وحدات البوابة وتوجّه للصفحات', async () => {
    const user = userEvent.setup()
    renderDash()
    expect(screen.getByTestId('quick-actions').children.length).toBeGreaterThanOrEqual(10)
    await user.click(screen.getByTestId('quick-user-plus'))
    expect(mockNavigate).toHaveBeenCalledWith('/it/user-management/create')
    await user.click(screen.getByTestId('quick-activity'))
    expect(mockNavigate).toHaveBeenCalledWith('/it/database/errors')
    await user.click(screen.getByTestId('quick-database'))
    expect(mockNavigate).toHaveBeenCalledWith('/it/database')
  })

  it('لا يحتوي أي بيانات وهمية (كل الرسوم من مصادر حقيقية)', () => {
    const { container } = renderDash()
    expect(container.textContent).not.toContain('بيانات تجريبية')
    expect(container.textContent).not.toContain('mock data')
  })
})

