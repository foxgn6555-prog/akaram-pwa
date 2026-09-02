/** لوحة المحطة التحويلية — تعرض إحصائيات التقارير وروابط الوحدات */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('@features/transfer-station', () => ({
  useWeightSummary: () => ({
    data: {
      total_records: 120, today_records: 8, pending_ops: 5, submitted_ops: 15,
      archived: 3, total_net_tons: 450.5, today_net_tons: 42.25,
    },
    isLoading: false,
  }),
}))

import StationDashboard from '@portals/transfer-station/pages/Dashboard/StationDashboard'

function renderDash() {
  return render(
    <MemoryRouter>
      <StationDashboard />
    </MemoryRouter>,
  )
}

describe('StationDashboard', () => {
  it('يعرض بطاقات الإحصائيات بالقيم', () => {
    renderDash()
    expect(screen.getByTestId('dash-stats')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()          // سجلات اليوم
    expect(screen.getByText('5')).toBeInTheDocument()          // بانتظار التدقيق
    expect(screen.getByText('42.25 طن')).toBeInTheDocument()   // أطنان اليوم
  })

  it('يعرض روابط الوحدات السبع', () => {
    renderDash()
    expect(screen.getByTestId('dash-units')).toBeInTheDocument()
    expect(screen.getByText('الأوزان')).toBeInTheDocument()
    expect(screen.getByText('الحضورية')).toBeInTheDocument()
    expect(screen.getByText('السكسات الخارجة')).toBeInTheDocument()
    expect(screen.getByText('النسافات الخارجة')).toBeInTheDocument()
    expect(screen.getByText('الغرامات')).toBeInTheDocument()
    expect(screen.getByText('الأرشيف')).toBeInTheDocument()
  })
})
