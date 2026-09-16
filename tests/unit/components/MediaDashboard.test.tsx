/** لوحة قيادة بوابة الإعلام: KPI + رسوم بيانية + تفاصيل الوحدات + آخر النشاط */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { baghdadDay } from '@features/media/constants'

// recharts يعتمد ResizeObserver غير المتوفر في jsdom — نمسخر المكونات البصرية
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children?: ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  PieChart: ({ children }: { children?: ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  AreaChart: ({ children }: { children?: ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Pie: () => null,
  Bar: () => null,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  Cell: () => null,
  Legend: () => null,
}))

const today = baghdadDay()
const yest = baghdadDay(-1)

vi.mock('@features/media/hooks', () => ({
  useSubmissions: (sector: string) => ({
    isLoading: false,
    data:
      sector === 'karrada'
        ? [
            { id: 'k1', title: 'كنس الكرادة', work_type: 'كنس الشوارع', photo_count: 3, event_date: `${today}T08:00:00`, created_at: `${today}T08:00:00`, status: 'active' },
            { id: 'k2', title: 'حاويات الكرادة', work_type: 'رفع حاويات', photo_count: 2, event_date: `${yest}T08:00:00`, created_at: `${yest}T08:00:00`, status: 'active' },
            { id: 'k3', title: 'مؤرشفة ك', work_type: 'كنس الشوارع', photo_count: 4, event_date: `${yest}T09:00:00`, created_at: `${yest}T09:00:00`, status: 'archived' },
          ]
        : [
            { id: 'z1', title: 'غسل الزعفرانية', work_type: 'غسل الشارع', photo_count: 5, event_date: `${today}T07:00:00`, created_at: `${today}T07:00:00`, status: 'active' },
          ],
  }),
  useDesigns: () => ({
    data: [
      { id: 'd1', status: 'draft' },
      { id: 'd2', status: 'completed' },
    ],
  }),
  useMediaTemplates: () => ({ data: [{ id: 't1' }] }),
}))

import MediaDashboardPage from '@portals/media/pages/MediaDashboardPage'

const renderDash = () =>
  render(
    <MemoryRouter>
      <MediaDashboardPage />
    </MemoryRouter>,
  )

describe('لوحة قيادة الإعلام', () => {
  it('مؤشرات KPI محسوبة من القاطعين', () => {
    renderDash()
    expect(screen.getByTestId('kpi-تذاكر اليوم').textContent).toContain('2')
    expect(screen.getByTestId('kpi-تذاكر نشطة').textContent).toContain('3')
    expect(screen.getByTestId('kpi-صور نشطة').textContent).toContain('10')
    expect(screen.getByTestId('kpi-مؤرشفة').textContent).toContain('1')
    expect(screen.getByTestId('kpi-تصاميم').textContent).toContain('2')
    expect(screen.getByTestId('kpi-قوالب').textContent).toContain('1')
  })

  it('ثلاثة رسوم بيانية: أعمدة ودونوت وتراكمي', () => {
    renderDash()
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
  })

  it('بطاقات الوحدات تعرض تفاصيل حية لكل وحدة', () => {
    renderDash()
    const k = screen.getByTestId('unit-karrada-sector')
    expect(k.textContent).toContain('2 تذكرة نشطة')
    expect(k.textContent).toContain('5 صورة نشطة')
    expect(k.textContent).toContain('1 اليوم')
    const kf = screen.getByTestId('unit-karrada-folder')
    expect(kf.textContent).toContain('3 تذكرة كلية')
    expect(kf.textContent).toContain('9 صورة')
    expect(kf.textContent).toContain('1 مؤرشفة')
    const d = screen.getByTestId('unit-designs')
    expect(d.textContent).toContain('1 مسودة')
    expect(d.textContent).toContain('1 مكتمل')
    const a = screen.getByTestId('unit-archive')
    expect(a.textContent).toContain('4 صورة مؤرشفة')
  })

  it('آخر النشاط يعرض أحدث التذاكر', () => {
    renderDash()
    expect(screen.getAllByTestId('recent-item').length).toBe(4)
  })
})
