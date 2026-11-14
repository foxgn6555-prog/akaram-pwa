/**
 * 00415 · بيانات الشركة (/admin/company) — اختبار انحدار
 *
 * يتحقق من:
 *  1) الشاشة تُركّب وتعرض الأرقام القادمة من الخدمات الموجودة (بلا أي استعلام جديد).
 *  2) لا يوجد أي عنصر كتابة (أزرار حفظ/إرسال) — الشاشة قراءة فقط.
 *  3) تعذّر خدمة واحدة لا يُسقِط الشاشة كلها.
 *  4) استدعاء الخدمات الخمس يقع مرة واحدة لكل قطاع.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  monthStats: vi.fn(),
  list: vi.fn(),
  listDesigns: vi.fn(),
  managerOptions: vi.fn(),
  wagesMonthStatus: vi.fn(),
  auditList: vi.fn(),
  auditTop: vi.fn(),
}))

vi.mock('@sdk/central-garage.sdk', () => ({ centralGarage: { dashboard: mocks.dashboard } }))
vi.mock('@sdk/gps-hotspots.sdk', () => ({ gpsHotspots: { monthStats: mocks.monthStats, list: mocks.list } }))
vi.mock('@sdk/media.sdk', () => ({ mediaService: { listDesigns: mocks.listDesigns } }))
vi.mock('@sdk/contractors.sdk', () => ({ contractors: { managerOptions: mocks.managerOptions, wagesMonthStatus: mocks.wagesMonthStatus } }))
vi.mock('@sdk/audit.sdk', () => ({ audit: { list: mocks.auditList, topTables: mocks.auditTop } }))

import AdminCompany from '@portals/admin/pages/AdminCompany'

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AdminCompany />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.dashboard.mockResolvedValue({ vehiclesTotal: 2, driversTotal: 3, dispatchesTotal: 41, pendingZeroRequests: 1, tankStock: [{ id: 't1', name: 'خزان بنزين', percent: 42.5, lowStock: false }] })
  mocks.monthStats.mockResolvedValue([{ month: '2026-11-01', spots: 348, stops: 900, by_class: { heavy: 120 }, by_recurrence: { recurring: 70 }, multi_vehicle: 12, total_minutes: 5400 }])
  mocks.list.mockResolvedValue({ total: 348, rows: [] })
  mocks.listDesigns.mockResolvedValue([{ id: 'd1', title: 'حملة النظافة', period_start: '2026-11-01', status: 'draft' }])
  mocks.managerOptions.mockResolvedValue([{ user_id: 'u1', full_name: 'متعهد الشمال', shift: 'morning' }])
  mocks.wagesMonthStatus.mockResolvedValue({ month: '2026-11-01', approved: false })
  mocks.auditList.mockResolvedValue({ rows: [{ id: 1, table_name: 'employees', operation: 'UPDATE', actor_role: 'hr_manager', created_at: '2026-11-09T10:00:00Z' }], total: 8952, page: 1, pageSize: 15 })
  mocks.auditTop.mockResolvedValue([{ table_name: 'audit_logs', count: 100 }])
})

describe('00415 · /admin/company — بيانات الشركة', () => {
  it('يعرض القطاعات الخمسة بأرقامها الحقيقية', async () => {
    mount()
    expect(screen.getByTestId('admin-company')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('company-fleet').textContent).toContain('41'))
    expect(screen.getByTestId('company-hotspots').textContent).toContain('348')
    expect(screen.getByTestId('company-media').textContent).toContain('حملة النظافة')
    expect(screen.getByTestId('company-contractors').textContent).toContain('متعهد الشمال')
    await waitFor(() => expect(screen.getByTestId('company-audit').textContent).toContain('employees'))
    expect(screen.getByTestId('company-audit').textContent).toContain('8,952')
  })

  it('قراءة فقط: لا أزرار كتابة (حفظ/إرسال/إضافة) داخل الشاشة', async () => {
    mount()
    await waitFor(() => expect(mocks.dashboard).toHaveBeenCalledTimes(1))
    const root = screen.getByTestId('admin-company')
    const labels = [...root.querySelectorAll('button')].map((b) => b.textContent ?? '')
    expect(labels.filter((t) => /حفظ|إرسال|إضافة|تعديل|حذف|اعتماد/.test(t))).toEqual([])
  })

  it('فشل خدمة واحدة لا يُسقِط الشاشة — بطاقتها وحدها تُظهر خطأ', async () => {
    mocks.dashboard.mockRejectedValue(new Error('boom'))
    mount()
    await waitFor(() => expect(screen.getByTestId('company-fleet').textContent).toContain('تعذر تحميل'))
    expect(screen.getByTestId('company-hotspots').textContent).toContain('348')
  })

  it('كل خدمة تُستدعى مرة واحدة فقط (لا حلقات إعادة جلب)', async () => {
    mount()
    await waitFor(() => expect(mocks.auditList).toHaveBeenCalledTimes(1))
    expect(mocks.dashboard).toHaveBeenCalledTimes(1)
    expect(mocks.monthStats).toHaveBeenCalledTimes(1)
    expect(mocks.listDesigns).toHaveBeenCalledTimes(1)
    expect(mocks.managerOptions).toHaveBeenCalledTimes(1)
  })
})
