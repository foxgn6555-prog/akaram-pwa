/**
 * الجولة ٧ — اللوحة الأمنية الموحّدة: البطاقات، التصفية بالمدة والمصدر، وعرض السجل.
 * (الدمج والحراسة في الخادم — تختبرهما حزمة SQL)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const timelineMock = vi.fn()
const overviewMock = vi.fn()

vi.mock('@features/security/hooks', () => ({
  useSecurityOverview: () => ({ data: overviewMock(), isFetching: false }),
  useSecurityTimeline: (p: { days: number; source: string | null; user: string | null }) => {
    timelineMock(p)
    return {
      data: [
        { occurred_at: new Date().toISOString(), source: 'session', kind: 'login_failed', outcome: 'blocked',
          actor_id: 'u1', actor_label: 'hr@t.iq', target_id: 'u1', target_label: 'hr@t.iq',
          summary: 'محاولة دخول فاشلة · 10.0.0.1', detail: {} },
        { occurred_at: new Date(Date.now() - 60000).toISOString(), source: 'permissions', kind: 'level_set', outcome: 'info',
          actor_id: 'u2', actor_label: 'it@t.iq', target_id: 'u1', target_label: 'hr@t.iq',
          summary: 'ضبط سقف صفحة لحساب · hr.employees', detail: {} },
        { occurred_at: new Date(Date.now() - 120000).toISOString(), source: 'roles', kind: 'role_grant', outcome: 'pending',
          actor_id: 'u2', actor_label: 'it@t.iq', target_id: 'u1', target_label: 'hr@t.iq',
          summary: 'طلب منح دور تقنية المعلومات — بانتظار الاعتماد', detail: {} },
      ],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    }
  },
}))
vi.mock('@sdk/users.sdk', () => ({
  users: { list: async () => [{ id: 'u1', email: 'hr@t.iq', employee_name: 'سارة', roles: ['hr_officer'] }] },
}))

import { UnifiedSecurityDashboard } from '@portals/it/pages/Permissions/UnifiedSecurityDashboard'

function renderDash() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <UnifiedSecurityDashboard />
    </QueryClientProvider>,
  )
}

describe('اللوحة الأمنية الموحّدة', () => {
  beforeEach(() => {
    timelineMock.mockClear()
    overviewMock.mockReturnValue({
      days: 7,
      session: { total: 12, blocked: 3, logins: 8, failed: 2 },
      permissions: { total: 5, level_sets: 4 },
      roles: { total: 2, pending: 1, approved: 1, rejected: 0 },
      accounts: { with_policy: 3, with_levels: 6 },
      last_event_at: new Date().toISOString(),
    })
  })

  it('يعرض البطاقات الخمس بأرقام الخادم', () => {
    renderDash()
    expect(screen.getByText('أحداث الدخول والجلسات')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('محاولات مرفوضة')).toBeInTheDocument()
    expect(screen.getByText(/مرفوضة 3/)).toBeInTheDocument()
    expect(screen.getByText(/بانتظار الاعتماد 1/)).toBeInTheDocument()
  })

  it('يجمع المصادر الثلاثة في سجل واحد بترتيب زمني', () => {
    renderDash()
    const list = screen.getByTestId('security-timeline')
    const items = list.querySelectorAll('li')
    expect(items).toHaveLength(3)
    expect(itemText(items[0])).toContain('محاولة دخول فاشلة')
    expect(itemText(items[1])).toContain('ضبط سقف صفحة')
    expect(itemText(items[2])).toContain('طلب منح دور')
    expect(screen.getByText('مرفوض')).toBeInTheDocument()
    expect(screen.getByText('بانتظار الاعتماد')).toBeInTheDocument()
  })

  it('تغيير المدة والمصدر يُعيد الاستعلام بالمعاملات الصحيحة', async () => {
    renderDash()
    await userEvent.click(screen.getByRole('button', { name: '٣٠ يوماً' }))
    await waitFor(() => expect(timelineMock).toHaveBeenLastCalledWith(expect.objectContaining({ days: 30 })))
    await userEvent.click(screen.getByRole('button', { name: 'الأدوار' }))
    await waitFor(() => expect(timelineMock).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'roles', days: 30 })))
  })

  it('اختيار حساب يضيّق السجل ثم يُلغى بزر «عرض كل الحسابات»', async () => {
    renderDash()
    await userEvent.type(screen.getByTestId('security-account-search'), 'hr@t')
    await userEvent.click(await screen.findByText('hr@t.iq', {}, { timeout: 3000 }))
    await waitFor(() => expect(timelineMock).toHaveBeenLastCalledWith(expect.objectContaining({ user: 'u1' })))
    await userEvent.click(screen.getByTestId('security-clear-account'))
    await waitFor(() => expect(timelineMock).toHaveBeenLastCalledWith(expect.objectContaining({ user: null })))
  })
})

function itemText(el: Element | undefined): string {
  return el?.textContent ?? ''
}
