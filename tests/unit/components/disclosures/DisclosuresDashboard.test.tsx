/** لوحة وحدة الكشوفات — الإحصائيات + رسم التوزيع + روابط الوحدات */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'

// recharts يعتمد ResizeObserver غير المتوفر في jsdom — نمسخر المكونات البصرية
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children?: ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  Cell: () => null,
}))

vi.mock('@features/disclosures', () => ({
  useDisclosureSummary: () => ({
    data: {
      total: 24, today: 3, drafts: 5, submitted: 7, archived: 12,
      by_violation: { delay: 6, absence: 4, collection: 3, evasion: 2, early_withdrawal: 5, load_deficiency: 4 },
    },
    isLoading: false,
  }),
}))

import DisclosuresDashboard from '@portals/disclosures/pages/Dashboard/DisclosuresDashboard'

function renderDash() {
  return render(
    <MemoryRouter>
      <DisclosuresDashboard />
    </MemoryRouter>,
  )
}

describe('DisclosuresDashboard', () => {
  it('يعرض بطاقات الإحصائيات بالقيم', () => {
    renderDash()
    expect(screen.getByTestId('disc-stats')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()  // الإجمالي
    expect(screen.getByText('3')).toBeInTheDocument()   // اليوم
    expect(screen.getByText('5')).toBeInTheDocument()   // المسودات
    expect(screen.getByText('7')).toBeInTheDocument()   // المرفوعة
    expect(screen.getByText('12')).toBeInTheDocument()  // الأرشيف
  })

  it('يعرض روابط الوحدات الثلاث', () => {
    renderDash()
    expect(screen.getByTestId('disc-units')).toBeInTheDocument()
    expect(screen.getByText('الكشوفات')).toBeInTheDocument()
    expect(screen.getByText('إنشاء كشف')).toBeInTheDocument()
    expect(screen.getByText('الأرشيف')).toBeInTheDocument()
  })

  it('يعرض رسم توزيع المخالفات (يشمل النوعين الجديدين)', () => {
    renderDash()
    expect(screen.getByText('توزيع الكشوفات حسب نوع المخالفة')).toBeInTheDocument()
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })
})